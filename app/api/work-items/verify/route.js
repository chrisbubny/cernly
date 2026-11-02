import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  ensureWorkItemsTable,
  getReportWithData,
  setVerifiedStatus,
  upsertWorkItem,
  deriveWorkItemScopeKey,
} from '@/lib/store';
import { compareScans, checkUrlCompatibility } from '@/lib/comparison';
import { deriveVerifiedStatus, extractFindingOutcomes } from '@/lib/verification';

// POST /api/work-items/verify
// Body: { recFingerprint, previousReportId, currentReportId }
//
// Authorization model (per Stage 5 approval):
//   - The server authenticates the user via Clerk.
//   - Both reports are retrieved from the database; either must belong to the
//     authenticated user OR be marked is_public. Clients may not send a
//     pre-computed verified_status.
//   - The comparison is run deterministically server-side using compareScans().
//   - The outcome is persisted; the browser only requests and displays results.
export async function POST(request) {
  // 1. Authenticate
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Parse body
  let body = {};
  try { body = await request.json(); } catch {}

  const { recFingerprint, previousReportId, currentReportId } = body;

  if (!recFingerprint || typeof recFingerprint !== 'string') {
    return NextResponse.json({ error: 'recFingerprint is required' }, { status: 400 });
  }
  if (!previousReportId || !Number.isInteger(Number(previousReportId))) {
    return NextResponse.json({ error: 'previousReportId must be a valid integer' }, { status: 400 });
  }
  if (!currentReportId || !Number.isInteger(Number(currentReportId))) {
    return NextResponse.json({ error: 'currentReportId must be a valid integer' }, { status: 400 });
  }
  if (Number(previousReportId) === Number(currentReportId)) {
    return NextResponse.json({ error: 'previousReportId and currentReportId must differ' }, { status: 400 });
  }

  // 3. Retrieve and authorize both reports
  const [prevReport, currReport] = await Promise.all([
    getReportWithData(Number(previousReportId), userId),
    getReportWithData(Number(currentReportId), userId),
  ]);

  if (!prevReport) {
    return NextResponse.json({ error: 'Previous report not found or not authorized' }, { status: 403 });
  }
  if (!currReport) {
    return NextResponse.json({ error: 'Current report not found or not authorized' }, { status: 403 });
  }

  // A verification must move forward in time, not compare against an older scan.
  const previousTime = new Date(prevReport.createdAt).getTime();
  const currentTime = new Date(currReport.createdAt).getTime();
  if (!prevReport.createdAt || !currReport.createdAt || !Number.isFinite(previousTime) || !Number.isFinite(currentTime) || currentTime <= previousTime) {
    return NextResponse.json({ error: 'A newer scan is required to verify this fix.',
      verifiedStatus: 'unable_to_verify' }, { status: 422 });
  }

  // 4. Validate comparability (URL must match)
  const urlCheck = checkUrlCompatibility(prevReport.url, currReport.url);
  if (!urlCheck.compatible) {
    return NextResponse.json({
      error: 'Reports are not comparable',
      reason: urlCheck.reason,
      verifiedStatus: 'unable_to_verify',
    }, { status: 422 });
  }

  // 5. Run server-side deterministic comparison
  let comparison;
  try {
    comparison = compareScans(prevReport, currReport);
  } catch (e) {
    console.error('[verify] compareScans error:', e.message);
    return NextResponse.json({ error: 'Comparison failed', verifiedStatus: 'unable_to_verify' }, { status: 500 });
  }

  // 6. Extract outcome for the requested recommendation fingerprint
  const verifiedStatus = deriveVerifiedStatus(recFingerprint, comparison);

  // 7. Derive scope key and persist
  const pageUrl = currReport.url;
  const scopeKey = deriveWorkItemScopeKey(recFingerprint, pageUrl);

  if (scopeKey) {
    await ensureWorkItemsTable();
    try {
      // Ensure the work item row exists (create it as 'verify' if not yet tracked)
      await upsertWorkItem(userId, {
        recFingerprint,
        scopeKey,
        userStatus: 'verify', // user initiated verification — mark as in-verify state
      });
      await setVerifiedStatus(userId, {
        recFingerprint,
        scopeKey,
        verifiedStatus,
        verifiedReportId: Number(currentReportId),
      });
    } catch (e) {
      console.error('[verify] persistence error:', e.message);
      // Persistence failure: return the result but flag the error so the client
      // can inform the user (per Stage 5 requirement: no silent fallback)
      return NextResponse.json({
        verifiedStatus,
        recFingerprint,
        persistenceError: true,
        error: 'Verification completed but could not be saved. Please try again.',
      }, { status: 207 });
    }
  }

  // 8. Return verification result
  return NextResponse.json({
    verifiedStatus,
    recFingerprint,
    scopeKey,
    currentReportId: Number(currentReportId),
    previousReportId: Number(previousReportId),
    comparedAt: comparison.comparedAt,
    comparabilityLevel: comparison.comparabilityLevel,
    // Include relevant finding details for the UI to highlight
    findingOutcomes: extractFindingOutcomes(recFingerprint, comparison),
  });
}
