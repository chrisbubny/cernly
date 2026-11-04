// POST /api/capture-desktop
//
// Authenticated, ownership-validated, idempotent endpoint that captures a
// 1280px desktop screenshot of an already-scanned report URL.
//
// Flow:
//   1. Auth — Clerk session required
//   2. Ownership check — only the report owner may trigger capture
//   3. URL validation — SSRF-safe (validateCaptureUrlWithDns)
//   4. Atomic claim — prevents concurrent duplicate captures; enforces 3-attempt limit
//   5. Microlink fetch — 1280×5000 desktop screenshot
//   6. Buffer validation — MIME, size, sanity
//   7. Spaces upload — private ACL; object key stored in DB, not URL
//   8. Conditional complete — only writes if our lease is still current
//
// Idempotency:
//   - GET ?slug=... returns the current capture status and a presigned URL if done
//   - POST is a no-op when status === 'done' or 'capturing' (non-expired)
//
// Failures never affect scan or report availability — all errors are caught and logged.

import { NextResponse }                from 'next/server';
import { auth }                        from '@clerk/nextjs/server';
import { randomUUID }                  from 'crypto';
import { authorizeReport }             from '@/lib/report-access';
import {
  claimDesktopCapture,
  completeDesktopCapture,
  failDesktopCapture,
  exhaustDesktopCapture,
} from '@/lib/store';
import { uploadScreenshot, getPresignedUrl } from '@/lib/spaces';
import {
  validateCaptureUrlWithDns,
  fetchMicrolinkScreenshot,
  validateScreenshotBuffer,
  screenshotKey,
} from '@/lib/capture';

// ---------------------------------------------------------------------------
// GET — status check and presigned URL retrieval
// ---------------------------------------------------------------------------

export async function GET(request) {
  const { userId } = await auth().catch(() => ({ userId: null }));
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const access = await authorizeReport({ slug }, userId);
  if (!access.report) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const capture = access.report.lhData?.desktopCapture || null;
  if (!capture) return NextResponse.json({ status: 'none' });

  if (capture.status === 'done' && capture.screenshotKey) {
    // Generate a fresh presigned URL against the S3 endpoint (1 hour TTL)
    let presignedUrl = null;
    try {
      presignedUrl = await getPresignedUrl(capture.screenshotKey, 3600);
    } catch (e) {
      console.error('[capture-desktop] presign failed:', e.message);
      return NextResponse.json({ status: 'done', presignedUrl: null, error: 'presign_failed' });
    }
    return NextResponse.json({ status: 'done', presignedUrl, capturedAt: capture.capturedAt });
  }

  // If still marked 'capturing' but the 90s lease has expired, the background
  // worker likely failed silently (e.g. Microlink timeout before failDesktopCapture ran).
  // Report it as 'failed' so the client can offer a retry rather than polling forever.
  if (capture.status === 'capturing' && capture.claimedAt) {
    const ageMs = Date.now() - new Date(capture.claimedAt).getTime();
    if (ageMs > 90_000) {
      console.log(`[capture-desktop] GET — lease expired, treating as failed | reportId: ${access.report.id} | ageMs: ${ageMs}`);
      return NextResponse.json({
        status:    'failed',
        retries:   capture.retries ?? 0,
        reason:    'lease_expired',
      });
    }
  }

  return NextResponse.json({
    status:    capture.status,
    retries:   capture.retries ?? 0,
    claimedAt: capture.claimedAt || null,
    failedAt:  capture.failedAt || null,
    reason:    capture.reason || null,
  });
}

// ---------------------------------------------------------------------------
// POST — trigger capture
// ---------------------------------------------------------------------------

export async function POST(request) {
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}
  const { reportId } = body; // reportId is the URL slug

  if (!reportId || typeof reportId !== 'string') {
    return NextResponse.json({ error: 'reportId (slug) is required' }, { status: 400 });
  }

  // Ownership check — only the owner may trigger a desktop capture
  const access = await authorizeReport({ slug: reportId }, userId);
  if (!access.report) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const report  = access.report;
  const capture = report.lhData?.desktopCapture || null;

  // Idempotency — return current status if already done or in progress (non-expired)
  if (capture?.status === 'done') {
    return NextResponse.json({ status: 'done', message: 'Screenshot already captured' });
  }
  if (capture?.status === 'exhausted') {
    return NextResponse.json({ status: 'exhausted', message: 'Capture retries exhausted', retries: 3 }, { status: 422 });
  }
  if (capture?.status === 'capturing') {
    const claimedAt = capture.claimedAt ? new Date(capture.claimedAt) : null;
    const ageMs     = claimedAt ? Date.now() - claimedAt.getTime() : Infinity;
    if (ageMs < 90_000) {
      return NextResponse.json({ status: 'capturing', message: 'Capture already in progress' });
    }
    // Lease expired — fall through to re-claim
  }

  // URL validation (SSRF-safe, with DNS pre-check)
  let validatedUrl;
  try {
    validatedUrl = await validateCaptureUrlWithDns(report.url);
  } catch (e) {
    console.error('[capture-desktop] URL validation failed:', e.message, '| url:', report.url);
    return NextResponse.json({ error: `URL validation failed: ${e.message}` }, { status: 422 });
  }

  // Atomic claim
  const attemptId = randomUUID();
  const claimed   = await claimDesktopCapture(report.id, attemptId).catch(e => {
    console.error('[capture-desktop] claim error:', e.message);
    return null;
  });

  if (!claimed) {
    // Either another concurrent request claimed it, or retries are exhausted
    if ((capture?.retries ?? 0) >= 3) {
      await exhaustDesktopCapture(report.id).catch(() => {});
      return NextResponse.json({ status: 'exhausted', message: 'Capture retries exhausted', retries: 3 }, { status: 422 });
    }
    return NextResponse.json({ status: 'capturing', message: 'Capture claimed by concurrent request' });
  }

  console.log(`[capture-desktop] claimed | reportId: ${report.id} | attemptId: ${attemptId} | retries: ${claimed.retries}`);

  // Exhausted check after successful claim
  if (claimed.retries > 3) {
    await exhaustDesktopCapture(report.id).catch(() => {});
    return NextResponse.json({ status: 'exhausted', message: 'Capture retries exhausted', retries: claimed.retries }, { status: 422 });
  }

  // Run capture in the background — response returns immediately with 'capturing' status
  // so the client can poll GET for the result without blocking.
  runCapture({ reportId: report.id, attemptId, url: validatedUrl }).catch(e => {
    console.error('[capture-desktop] background capture error:', e.message);
  });

  return NextResponse.json({
    status:    'capturing',
    attemptId,
    retries:   claimed.retries,
    message:   'Capture started',
  });
}

// ---------------------------------------------------------------------------
// Background capture worker
// ---------------------------------------------------------------------------

async function runCapture({ reportId, attemptId, url }) {
  let key = null;
  try {
    // Fetch screenshot from Microlink (1280px desktop)
    const { buffer: rawBuffer, contentType: rawContentType } =
      await fetchMicrolinkScreenshot(url);

    // Validate buffer before upload
    const { buffer, contentType } = validateScreenshotBuffer(rawBuffer, rawContentType);

    // Determine file extension from MIME type
    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const ext    = extMap[contentType] || 'jpg';

    // Generate a unique Spaces object key
    key = screenshotKey(reportId, ext);

    // Upload to Spaces with private ACL
    await uploadScreenshot(key, buffer, contentType);

    // Conditional complete — only writes if our lease is still current
    const wrote = await completeDesktopCapture(reportId, attemptId, key);
    if (wrote) {
      console.log(`[capture-desktop] done | reportId: ${reportId} | key: ${key}`);
    } else {
      console.warn(`[capture-desktop] lease superseded | reportId: ${reportId} | attemptId: ${attemptId}`);
      // Our lease expired and was re-claimed; delete the orphaned object
      const { deleteScreenshot } = await import('@/lib/spaces');
      await deleteScreenshot(key).catch(() => {});
    }
  } catch (e) {
    console.error(`[capture-desktop] capture failed | reportId: ${reportId} | reason: ${e.message}`);
    await failDesktopCapture(reportId, attemptId, e.message.slice(0, 200)).catch(() => {});
  }
}
