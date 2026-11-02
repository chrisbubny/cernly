import { canonicalFindingId } from './finding-audits.js';

function recommendationItems(comparison) {
  const recs = comparison?.recommendations || {};
  return ['likely_resolved', 'still_open', 'partially_resolved', 'unable_to_verify']
    .flatMap(status => (recs[status] || []).map(item => ({ ...item, status })));
}

function findingItems(comparison) {
  return ['likely_resolved', 'still_detected', 'unable_to_verify', 'new_since']
    .flatMap(outcome => (comparison?.findings?.[outcome] || []).map(f => ({ ...f, outcome })));
}

// Clients historically sent either identity in recFingerprint. Keep that API
// compatible while resolving findings by canonical ID and groups by exact ID.
export function extractFindingOutcomes(target, comparison) {
  if (!comparison?.isComparable) return [];
  const id = canonicalFindingId(target);
  const all = findingItems(comparison);
  if (/^(lh|seo|ssl|a11y):/.test(target)) {
    return all.filter(f => canonicalFindingId(f) === id);
  }
  const matched = recommendationItems(comparison).find(r => r.rec?.fingerprint === target);
  const ids = new Set([
    ...(matched?.rec?.finding_fingerprints || []).map(canonicalFindingId),
    ...(matched?.rec?.supporting_findings || []).map(canonicalFindingId),
  ].filter(Boolean));
  return all.filter(f => ids.has(canonicalFindingId(f)));
}

export function deriveVerifiedStatus(target, comparison) {
  if (!comparison?.isComparable) return 'unable_to_verify';
  if (/^(lh|seo|ssl|a11y):/.test(target)) {
    const finding = extractFindingOutcomes(target, comparison)[0];
    if (finding) return finding.outcome === 'new_since' ? 'still_detected' : finding.outcome;
  }
  // Finding-level recommendation rows can carry historical supporting evidence
  // even when the original report's issue list is missing that entry.
  const matched = recommendationItems(comparison).find(r =>
    r.rec?.fingerprint === target || r.rec?.fingerprint === canonicalFindingId(target));
  if (!matched) return 'unable_to_verify';
  return matched.status === 'still_open' ? 'still_detected' : matched.status;
}
