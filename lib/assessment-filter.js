/**
 * lib/assessment-filter.js
 *
 * Pure utility: filters structured assessment content to remove claims
 * that originate from analyzers that failed or produced no data.
 *
 * Production use: the PDF cover page, and any other presentation layer
 * that surfaces assessment content.
 *
 * This is a presentation-layer concern only. The stored report data is
 * never modified; this filter runs at render time.
 *
 * Rules:
 *   - assessment.concerns whose `area` maps to a failed/unavailable analyzer
 *     are removed.
 *   - assessment.top_opportunity is suppressed if its category resolves to
 *     a failed/unavailable analyzer.
 *   - assessment.strengths, headline, and summary are NOT filtered — they
 *     are AI-generated narrative text without direct measurement references
 *     (the AI prompt already restricts measurements to available evidence).
 *   - The returned object carries two metadata fields for display logic:
 *       _unavailableCategories: string[]  — areas with no usable data
 *       _partialAnalysis: boolean         — true when any category is unavailable
 *
 * Canonical area → score key mapping (matches the four canonical scores):
 *   Performance   → scores.performance  / analyzerStatuses.lighthouse
 *   SEO           → scores.seo          / analyzerStatuses.seo
 *   Security      → scores.security     / analyzerStatuses.ssl
 *   Accessibility → scores.accessibility / analyzerStatuses.a11y
 */

/** Canonical area → score key (four canonical scores) */
const AREA_TO_SCORE_KEY = {
  Performance:   'performance',
  SEO:           'seo',
  Security:      'security',
  Accessibility: 'accessibility',
};

/** Canonical area → analyzerStatuses key */
const AREA_TO_ANALYZER_KEY = {
  Performance:   'lighthouse',
  SEO:           'seo',
  Security:      'ssl',
  Accessibility: 'a11y',
};

/**
 * Returns true when the analyzer for `area` has no usable data:
 *   - explicit status 'failed' or 'error' in analyzerStatuses, OR
 *   - corresponding score is null/undefined (implicit failure)
 *
 * Unknown area strings return false (we cannot prove unavailability).
 */
function isAreaUnavailable(area, scores, analyzerStatuses) {
  const scoreKey    = AREA_TO_SCORE_KEY[area];
  const analyzerKey = AREA_TO_ANALYZER_KEY[area];
  if (!scoreKey) return false; // Unrecognised area — keep

  const explicitFail =
    analyzerKey &&
    analyzerStatuses[analyzerKey] != null &&
    (analyzerStatuses[analyzerKey].status === 'failed' ||
     analyzerStatuses[analyzerKey].status === 'error');

  const noScore = scores[scoreKey] == null;

  return explicitFail || noScore;
}

/**
 * Infers the primary category of a top_opportunity entry.
 * Checks the referenced recommendations first, then falls back to
 * fingerprint-prefix heuristics. Returns null if undetermined.
 */
function getTopOppCategory(topOpp, recommendations) {
  if (!topOpp) return null;

  const fps = new Set(topOpp.recommendation_fingerprints || []);

  // Look up category from referenced recommendations
  for (const rec of recommendations) {
    if (fps.has(rec.fingerprint) && rec.category) {
      return rec.category;
    }
  }

  // Fallback: infer from fingerprint prefix
  for (const fp of fps) {
    if (fp.startsWith('performance'))                      return 'Performance';
    if (fp.startsWith('seo'))                              return 'SEO';
    if (fp.startsWith('security') || fp.startsWith('ssl')) return 'Security';
    if (fp.startsWith('accessibility') || fp.startsWith('a11y')) return 'Accessibility';
  }

  return null;
}

/**
 * Returns a sanitized copy of `assessment` with content from unavailable
 * analyzers removed. Returns null when assessment is null/undefined.
 *
 * @param {object|null}  assessment        - report.assessment
 * @param {object}       scores            - report.scores (or {})
 * @param {object}       analyzerStatuses  - report.analyzerStatuses (or {})
 * @param {object[]}     recommendations   - report.recommendations (or [])
 * @returns {object|null}
 */
export function filterAssessmentForDisplay(
  assessment,
  scores           = {},
  analyzerStatuses = {},
  recommendations  = [],
) {
  if (!assessment) return null;

  // Filter concerns whose area maps to an unavailable analyzer
  const filteredConcerns = (assessment.concerns || []).filter(concern => {
    const area = concern?.area;
    if (!area) return true; // No area specified — keep
    return !isAreaUnavailable(area, scores, analyzerStatuses);
  });

  // Suppress top_opportunity when its category is unavailable
  let filteredTopOpp = assessment.top_opportunity ?? null;
  if (filteredTopOpp) {
    const category = getTopOppCategory(filteredTopOpp, recommendations);
    if (category && isAreaUnavailable(category, scores, analyzerStatuses)) {
      filteredTopOpp = null;
    }
  }

  // Collect which canonical categories are unavailable, for display-layer warnings
  const _unavailableCategories = Object.keys(AREA_TO_SCORE_KEY).filter(
    area => isAreaUnavailable(area, scores, analyzerStatuses),
  );

  return {
    ...assessment,
    concerns:              filteredConcerns,
    top_opportunity:       filteredTopOpp,
    _unavailableCategories,
    _partialAnalysis:      _unavailableCategories.length > 0,
  };
}
