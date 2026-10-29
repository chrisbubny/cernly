import { NextResponse } from 'next/server';
import { auth }         from '@clerk/nextjs/server';
import {
  ensureGuidanceColumns,
  getGuidancePlan,
  setGuidancePlan,
  getRecommendationsByReport,
  getReportBySlug,
} from '@/lib/store';
import { generateGuidancePlan, derivePlanFingerprint } from '@/lib/guidance';

// 'cms-admin' is the canonical value the frontend sends; 'cms' is a legacy alias
const VALID_PERSONAS = new Set(['owner', 'cms-admin', 'cms', 'developer']);

// POST /api/guide-plan
// Body: { recFingerprint, reportId, persona? }
//
// Returns a cached or freshly-generated guidance plan for the given
// recommendation × persona combination.
//
// Cache key: (fingerprint, userId, persona) × content-based planFingerprint.
// If AI generation fails, static evidence-based guidance is returned — the
// response is always meaningful, never empty.
export async function POST(request) {
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}

  const { recFingerprint, reportId, focusIssue } = body;
  // focusIssue is optional: { message, fingerprintId, description?, detail? }
  // When present, guidance generation is grounded in the specific selected finding.
  // Normalise persona — 'cms' is a legacy alias for 'cms-admin'; default to 'owner'
  const rawPersona = body.persona;
  const persona = VALID_PERSONAS.has(rawPersona)
    ? (rawPersona === 'cms' ? 'cms-admin' : rawPersona)
    : 'owner';

  if (!recFingerprint || typeof recFingerprint !== 'string') {
    return NextResponse.json({ error: 'recFingerprint is required' }, { status: 400 });
  }
  if (!reportId || typeof reportId !== 'string') {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
  }

  // Ensure DB columns exist (idempotent — safe to call on every request)
  await ensureGuidanceColumns();

  // reportId from the client is the URL slug (UUID string). Resolve it to the
  // integer PK so getRecommendationsByReport — which queries report_id INTEGER —
  // does not throw "invalid input syntax for type integer" and silently return [].
  // This is the same pattern used in /api/ask/route.js.
  let report = null;
  try {
    report = await getReportBySlug(reportId);
  } catch (e) {
    console.error('[guide-plan] failed to resolve slug to report:', e.message);
  }
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // Load the recommendation row for this user + report
  const recs = await getRecommendationsByReport(report.id).catch(() => []);
  const rec  = recs.find(r => r.fingerprint === recFingerprint);

  if (!rec) {
    console.error('[guide-plan] rec not found | fingerprint:', recFingerprint,
      '| reportId:', reportId, '| report.id:', report.id,
      '| recs loaded:', recs.length,
      '| fingerprints:', recs.map(r => r.fingerprint).join(','));
    return NextResponse.json(
      { error: 'Recommendation not found for this user and report' },
      { status: 404 }
    );
  }

  // ── Cache check ─────────────────────────────────────────────────────────────
  // The stored guidance_plan is a map keyed by persona (or persona::focusFingerprintId
  // when a specific finding was selected, so different findings in the same
  // recommendation group get distinct focused plans).
  //   { owner: { ... }, 'developer::lh:unused-css-rules': { ... }, ... }
  const focusFingerprintId = safeFocusIssue?.fingerprintId || null;
  const personaKey = focusFingerprintId ? `${persona}::${focusFingerprintId}` : persona;

  const cached      = await getGuidancePlan(recFingerprint, userId);
  const currentFp   = derivePlanFingerprint(rec);
  const cachedForPersona = cached?.plan?.[personaKey];

  if (cachedForPersona && cachedForPersona.planFingerprint === currentFp) {
    // Cache hit for this persona/focus combination — content has not changed
    return NextResponse.json({ plan: cachedForPersona, cached: true, persona });
  }

  // ── Generate ────────────────────────────────────────────────────────────────
  const rawUrl   = rec.page_url || rec.url || '';
  const domain   = extractDomain(rawUrl);
  const siteUrl  = extractSiteUrl(rawUrl);
  const siteType = report.siteType || report.site_type || null;
  // Sanitise focusIssue — only pass through safe string fields, never raw user input
  const safeFocusIssue = focusIssue && typeof focusIssue === 'object' ? {
    message:       typeof focusIssue.message       === 'string' ? focusIssue.message.slice(0, 300)       : undefined,
    fingerprintId: typeof focusIssue.fingerprintId === 'string' ? focusIssue.fingerprintId.slice(0, 100)  : undefined,
    description:   typeof focusIssue.description   === 'string' ? focusIssue.description.slice(0, 500)   : undefined,
    detail:        typeof focusIssue.detail        === 'string' ? focusIssue.detail.slice(0, 500)        : undefined,
  } : null;
  const plan     = await generateGuidancePlan(rec, domain, persona, siteType, safeFocusIssue, siteUrl);

  // generateGuidancePlan never returns an empty plan — it always falls back to
  // static guidance. The only case where fallback: true remains is an unknown
  // group key with no static template (extremely rare).
  if (plan.fallback) {
    console.error('[guide-plan] bare fallback (no static template) | reason:',
      plan.reason || 'unknown', '| rec:', recFingerprint, '| report:', reportId);
    return NextResponse.json({
      plan: null,
      fallback: true,
      actions: plan.actions || [],
      reason: plan.reason || 'unknown',
      persona,
    });
  }

  // ── Persist ─────────────────────────────────────────────────────────────────
  // Store all persona plans in a single JSONB map row.
  // Read → merge → write to avoid overwriting sibling personas.
  try {
    const existing     = cached?.plan || {};
    // Discard sibling plans if the content fingerprint changed (stale)
    const freshPersonas = {};
    for (const [p, pPlan] of Object.entries(existing)) {
      if (pPlan?.planFingerprint === currentFp) freshPersonas[p] = pPlan;
    }
    const updatedMap = { ...freshPersonas, [personaKey]: plan };
    await setGuidancePlan(recFingerprint, userId, updatedMap);
  } catch (e) {
    console.error('[guide-plan] failed to cache plan:', e.message);
    // Return the plan even if caching fails
  }

  return NextResponse.json({ plan, cached: false, persona });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Returns the canonical origin+path of the scanned URL, safe for display in guidance steps. */
function extractSiteUrl(url) {
  try {
    const u = new URL(url);
    // Return origin only (protocol + hostname, no auth) — path omitted unless non-trivial
    return u.origin;
  } catch {
    return '';
  }
}
