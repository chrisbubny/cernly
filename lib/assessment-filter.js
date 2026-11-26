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
 * Status source: report.auditStatuses, keyed by canonical category
 * (performance | seo | security | accessibility), as produced by
 * /api/analyze and returned by lib/store.js mapRow(). Values:
 * 'completed' | 'failed' | 'blocked' | 'unavailable'.
 *
 * Rules:
 *   - A category is unavailable when its score is null, or when its
 *     auditStatuses entry exists with any status other than 'completed'.
 *   - assessment.concerns and assessment.strengths whose `area` maps to an
 *     unavailable category are removed.
 *   - assessment.top_opportunity is suppressed if its category resolves to
 *     an unavailable category.
 *   - assessment.headline and assessment.summary are free-form narrative and
 *     cannot be filtered claim-by-claim. They are shown only when the
 *     assessment's deterministic coverage record (assessment.coverage,
 *     attached by runAssessment, not AI-generated) shows the AI was told every
 *     currently unavailable category had failed. Otherwise — no coverage
 *     record, or coverage that lists an unavailable category as having run —
 *     both are withheld and _narrativeWithheld is set.
 *   - The returned object carries metadata fields for display logic:
 *       _unavailableCategories: string[]  — areas with no usable data
 *       _partialAnalysis: boolean         — true when any category is unavailable
 *       _narrativeWithheld: boolean       — true when headline/summary were withheld
 */

/** Canonical area → score key / auditStatuses key (four canonical scores) */
const AREA_TO_SCORE_KEY = {
  Performance:   'performance',
  SEO:           'seo',
  Security:      'security',
  Accessibility: 'accessibility',
};

/**
 * Returns true when the category for `area` has no usable data:
 *   - an auditStatuses entry exists with status other than 'completed', OR
 *   - corresponding score is null/undefined (implicit failure)
 *
 * Unknown area strings return false (we cannot prove unavailability).
 */
function isAreaUnavailable(area, scores, auditStatuses) {
  const key = AREA_TO_SCORE_KEY[area];
  if (!key) return false; // Unrecognised area — keep

  const status = auditStatuses?.[key]?.status;
  const explicitNotCompleted = status != null && status !== 'completed';
  const noScore = scores?.[key] == null;

  return explicitNotCompleted || noScore;
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
 * True when the assessment's deterministic coverage record shows every
 * unavailable category was reported to the AI as failed, so its narrative
 * was generated under the "zero claims about failed areas" rule.
 */
function narrativeCoversUnavailable(assessment, unavailableAreas) {
  if (unavailableAreas.length === 0) return true;
  const failed = assessment?.coverage?.audits_failed;
  if (!Array.isArray(failed)) return false; // legacy assessment — cannot verify
  const ran = Array.isArray(assessment.coverage.audits_ran) ? assessment.coverage.audits_ran : [];
  return unavailableAreas.every(area => {
    const key = AREA_TO_SCORE_KEY[area];
    return failed.includes(key) && !ran.includes(key);
  });
}

/**
 * Canonical areas with no usable data for this report. Independent of the
 * assessment, so it also works when no structured assessment exists.
 *
 * @returns {string[]} e.g. ['Performance']
 */
export function getUnavailableCategories(scores = {}, auditStatuses = {}) {
  return Object.keys(AREA_TO_SCORE_KEY).filter(
    area => isAreaUnavailable(area, scores, auditStatuses),
  );
}

/**
 * Returns a sanitized copy of `assessment` with content from unavailable
 * analyzers removed. Returns null when assessment is null/undefined.
 *
 * @param {object|null}  assessment       - report.assessment
 * @param {object}       scores           - report.scores (or {})
 * @param {object}       auditStatuses    - report.auditStatuses (or {})
 * @param {object[]}     recommendations  - recommendations for the report (or [])
 * @returns {object|null}
 */
export function filterAssessmentForDisplay(
  assessment,
  scores          = {},
  auditStatuses   = {},
  recommendations = [],
) {
  if (!assessment) return null;

  const keepByArea = item => {
    const area = item?.area;
    if (!area) return true; // No area specified — keep
    return !isAreaUnavailable(area, scores, auditStatuses);
  };

  const filteredConcerns  = (assessment.concerns  || []).filter(keepByArea);
  const filteredStrengths = (assessment.strengths || []).filter(keepByArea);

  // Suppress top_opportunity when its category is unavailable
  let filteredTopOpp = assessment.top_opportunity ?? null;
  if (filteredTopOpp) {
    const category = getTopOppCategory(filteredTopOpp, recommendations);
    if (category && isAreaUnavailable(category, scores, auditStatuses)) {
      filteredTopOpp = null;
    }
  }

  // Collect which canonical categories are unavailable, for display-layer warnings
  const _unavailableCategories = getUnavailableCategories(scores, auditStatuses);

  const _narrativeWithheld = !narrativeCoversUnavailable(assessment, _unavailableCategories);

  return {
    ...assessment,
    headline:              _narrativeWithheld ? null : (assessment.headline ?? null),
    summary:               _narrativeWithheld ? null : (assessment.summary  ?? null),
    concerns:              filteredConcerns,
    strengths:             filteredStrengths,
    top_opportunity:       filteredTopOpp,
    _unavailableCategories,
    _partialAnalysis:      _unavailableCategories.length > 0,
    _narrativeWithheld,
  };
}
