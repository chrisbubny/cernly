import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  ensureWorkItemsTable,
  getWorkItemsByUrl,
  upsertWorkItem,
  deriveWorkItemScopeKey,
  updateGuideProgress,
} from '@/lib/store';

// GET /api/work-items?url=<page-url>
// Returns all work items for the authenticated user for the given page URL.
export async function GET(request) {
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const url = (searchParams.get('url') || '').trim();
  if (!url) return NextResponse.json({ error: 'url query param is required' }, { status: 400 });

  await ensureWorkItemsTable();
  const items = await getWorkItemsByUrl(userId, url).catch(() => []);

  // Return as a map: fingerprint → work item row, for easy lookup in the client
  const byFingerprint = {};
  for (const item of items) {
    byFingerprint[item.rec_fingerprint] = {
      id:               item.id,
      recFingerprint:   item.rec_fingerprint,
      scopeKey:         item.scope_key,
      userStatus:       item.user_status,
      verifiedStatus:   item.verified_status   || null,
      verifiedAt:       item.verified_at       || null,
      verifiedReportId: item.verified_report_id || null,
      guideProgress:    item.guide_progress    || null,
      updatedAt:        item.updated_at,
    };
  }

  return NextResponse.json({ workItems: byFingerprint });
}

// PATCH /api/work-items
// Body: { recFingerprint, pageUrl, userStatus }
// Upserts the user_status for a single work item.
export async function PATCH(request) {
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}

  const { recFingerprint, pageUrl, userStatus, guideProgress } = body;

  if (!recFingerprint || typeof recFingerprint !== 'string') {
    return NextResponse.json({ error: 'recFingerprint is required' }, { status: 400 });
  }
  if (!pageUrl || typeof pageUrl !== 'string') {
    return NextResponse.json({ error: 'pageUrl is required' }, { status: 400 });
  }

  const scopeKey = deriveWorkItemScopeKey(recFingerprint, pageUrl);
  if (!scopeKey) {
    return NextResponse.json({ error: 'Could not derive scope key from pageUrl' }, { status: 400 });
  }

  await ensureWorkItemsTable();

  // guideProgress-only update (no userStatus required)
  if (guideProgress && !userStatus) {
    let updated;
    try {
      updated = await updateGuideProgress(userId, { recFingerprint, scopeKey, guideProgress });
    } catch (e) {
      console.error('[work-items] guideProgress update error:', e.message);
      return NextResponse.json({ error: 'Failed to save guide progress' }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
    return NextResponse.json({
      workItem: {
        id:             updated.id,
        recFingerprint: updated.rec_fingerprint,
        scopeKey:       updated.scope_key,
        userStatus:     updated.user_status,
        guideProgress:  updated.guide_progress || null,
        updatedAt:      updated.updated_at,
      },
    });
  }

  const VALID_USER_STATUSES = ['open', 'in_progress', 'verify', 'dismissed'];
  if (!userStatus || !VALID_USER_STATUSES.includes(userStatus)) {
    return NextResponse.json(
      { error: `userStatus must be one of: ${VALID_USER_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  let updated;
  try {
    updated = await upsertWorkItem(userId, { recFingerprint, scopeKey, userStatus });
  } catch (e) {
    console.error('[work-items] upsert error:', e.message);
    return NextResponse.json({ error: 'Failed to save status' }, { status: 500 });
  }

  return NextResponse.json({
    workItem: {
      id:               updated.id,
      recFingerprint:   updated.rec_fingerprint,
      scopeKey:         updated.scope_key,
      userStatus:       updated.user_status,
      verifiedStatus:   updated.verified_status   || null,
      verifiedAt:       updated.verified_at       || null,
      verifiedReportId: updated.verified_report_id || null,
      guideProgress:    updated.guide_progress    || null,
      updatedAt:        updated.updated_at,
    },
  });
}
