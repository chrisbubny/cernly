import { NextResponse } from 'next/server';
import { auth }         from '@clerk/nextjs/server';
import {
  ensureGuidanceColumns,
  getGuidancePlan,
  setGuidancePlan,
  getRecommendationsByReport,
} from '@/lib/store';
import { generateGuidancePlan, derivePlanFingerprint } from '@/lib/guidance';

// POST /api/guide-plan
// Body: { recFingerprint, reportId }
//
// Returns a cached or freshly generated guidance plan for the given
// recommendation. Cache key: recommendation row + content-based planFingerprint.
// If generation fails, returns { fallback: true, actions: [...] }.
export async function POST(request) {
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}

  const { recFingerprint, reportId } = body;

  if (!recFingerprint || typeof recFingerprint !== 'string') {
    return NextResponse.json({ error: 'recFingerprint is required' }, { status: 400 });
  }
  if (!reportId || typeof reportId !== 'string') {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
  }

  // Ensure DB columns exist (idempotent — safe to call on every request)
  await ensureGuidanceColumns();

  // Load the recommendation row for this user + report
  const recs = await getRecommendationsByReport(reportId).catch(() => []);
  const rec  = recs.find(r => r.fingerprint === recFingerprint);

  if (!rec) {
    console.error('[guide-plan] rec not found | fingerprint:', recFingerprint, '| reportId:', reportId, '| recs loaded:', recs.length, '| fingerprints:', recs.map(r => r.fingerprint).join(','));
    return NextResponse.json(
      { error: 'Recommendation not found for this user and report' },
      { status: 404 }
    );
  }

  // Check cache: compare current content-based fingerprint against stored plan
  const cached = await getGuidancePlan(recFingerprint, userId);
  const currentFp = derivePlanFingerprint(rec);

  if (cached?.plan && cached.plan.planFingerprint === currentFp) {
    // Cache hit — content has not changed since plan was generated
    return NextResponse.json({ plan: cached.plan, cached: true });
  }

  // Cache miss or stale — generate a new plan
  const domain = extractDomain(rec.page_url || rec.url || '');
  const plan   = await generateGuidancePlan(rec, domain);

  if (plan.fallback) {
    // Generation failed — return fallback without caching
    console.error('[guide-plan] fallback reason:', plan.reason || 'unknown', '| rec:', recFingerprint, '| report:', reportId);
    return NextResponse.json({ plan: null, fallback: true, actions: plan.actions, reason: plan.reason || 'unknown' });
  }

  // Persist to DB
  try {
    await setGuidancePlan(recFingerprint, userId, plan);
  } catch (e) {
    console.error('[guide-plan] failed to cache plan:', e.message);
    // Still return the plan even if caching fails
  }

  return NextResponse.json({ plan, cached: false });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
