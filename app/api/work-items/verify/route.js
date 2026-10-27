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

/**
 * Map the comparison engine's recommendation outcome for recFingerprint
 * to a verified_status enum value.
 *
 * compareRecommendations() returns items shaped { rec: { fingerprint, ... }, ... }.
 * The fingerprint is at r.rec.fingerprint — NOT r.fingerprint (which is always undefined).
 *
 * @param {string} recFingerprint
 * @param {object} comparison  - result of compareScans()
 * @returns {'likely_resolved'|'still_detected'|'partially_resolved'|'unable_to_verify'}
 */
function deriveVerifiedStatus(recFingerprint, comparison) {
  if (!comparison?.recommendations) return 'unable_to_verify';

  const { likely_resolved, still_open, partially_resolved, unable_to_verify } =
    comparison.recommendations;

  // Each array item is { rec: { fingerprint, ... }, resolvedFindings, total, ... }
  // from compareRecommendations() in lib/comparison.js.
  if (likely_resolved?.some(r => r.rec?.fingerprint === recFingerprint))   return 'likely_resolved';
  if (still_open?.some(r => r.rec?.fingerprint === recFingerprint))         return 'still_detected';
  if (partially_resolved?.some(r => r.rec?.fingerprint === recFingerprint)) return 'partially_resolved';
  if (unable_to_verify?.some(r => r.rec?.fingerprint === recFingerprint))   return 'unable_to_verify';

  // Recommendation not found in any bucket: treat as resolved ONLY when a full
  // comparable audit ran. Limited or incompatible comparability cannot confirm.
  if (comparison.isComparable && comparison.comparabilityLevel === 'full') {
    return 'likely_resolved';
  }

  return 'unable_to_verify';
}

/**
 * Extract individual finding outcomes relevant to a recommendation fingerprint.
 * Returns a summary array the client can use to display evidence.
 *
 * Recommendation fingerprints (e.g. 'image-optimization') and finding
 * fingerprints (e.g. 'lh:uses-optimized-images') share NO common prefix.
 * We must look up the rec's finding_fingerprints list from the comparison data.
 *
 * @param {string} recFingerprint
 * @param {object} comparison       - result of compareScans()
 */
function extractFindingOutcomes(recFingerprint, comparison) {
  if (!comparison?.findings) return [];

  // Locate the rec item in any recommendation bucket to get its finding_fingerprints.
  const allRecItems = [
    ...(comparison.recommendations?.likely_resolved    || []),
    ...(comparison.recommendations?.still_open         || []),
    ...(comparison.recommendations?.partially_resolved || []),
    ...(comparison.recommendations?.unable_to_verify   || []),
  ];
  const matchedItem = allRecItems.find(r => r.rec?.fingerprint === recFingerprint);
  const findingFps = new Set([
    ...(matchedItem?.rec?.finding_fingerprints || []),
    ...((matchedItem?.rec?.supporting_findings || []).map(f => f?.fingerprintId).filter(Boolean)),
  ]);

  const all = [
    ...(comparison.findings.likely_resolved   || []).map(f => ({ ...f, outcome: 'likely_resolved' })),
    ...(comparison.findings.still_detected    || []).map(f => ({ ...f, outcome: 'still_detected' })),
    ...(comparison.findings.unable_to_verify  || []).map(f => ({ ...f, outcome: 'unable_to_verify' })),
    ...(comparison.findings.new_since         || []).map(f => ({ ...f, outcome: 'new_since' })),
  ];

  // Filter to findings whose fingerprintId is in this recommendation's finding set.
  // If no finding fingerprints are available, return empty (no guessing).
  if (findingFps.size === 0) return [];
  return all.filter(f => findingFps.has(f.fingerprintId));
}
