/**
 * lib/priority-tasks.js
 *
 * Pure utility: builds the prioritized task list that drives the interactive
 * Action Plan and the PDF report.
 *
 * Rules:
 *  - Recommendations with at least one critical/warning supporting finding
 *    are surfaced first, in severity → rec-priority order.
 *  - Ungrouped critical/warning issues not covered by any recommendation
 *    are appended after rec-backed tasks.
 *  - Result is capped at 7 items to keep the Action Plan scannable.
 *  - The cap is intentionally NOT applied to the full findings list
 *    (use the raw issues/recommendations arrays for the technical section).
 *
 * This function is a pure transformation over its arguments; it has no
 * side effects and no React dependencies. It can be imported from API
 * routes, PDF components, and test files alike.
 */

/** Severity rank — lower is more severe */
export const SEV_ORDER = { critical: 0, warning: 1, info: 2, good: 3 };

/** Priority rank — lower is more urgent */
export const PRIO_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * @param {object[]} issues         - Flat issues array from report.issues
 * @param {object[]} recommendations - Grouped recs from report.recommendations
 * @returns {object[]}               - Up to 7 prioritized task objects
 */
export function buildPriorityTasks(issues, recommendations) {
  const recs = Array.isArray(recommendations) ? recommendations : [];
  const issuesArr = Array.isArray(issues) ? issues : [];

  // Track which issue fingerprints are covered by a rec
  const coveredFps = new Set();
  const tasks = [];

  for (const rec of recs) {
    const findings = Array.isArray(rec.supporting_findings) ? rec.supporting_findings : [];

    // Find highest severity among supporting findings
    let topSeverity = 'info';
    for (const f of findings) {
      if ((SEV_ORDER[f.severity] ?? 99) < (SEV_ORDER[topSeverity] ?? 99)) {
        topSeverity = f.severity;
      }
    }
    // Only surface recs that have at least one critical or warning finding
    if (topSeverity !== 'critical' && topSeverity !== 'warning') continue;

    // Mark all supporting finding fingerprints as covered
    if (Array.isArray(rec.finding_fingerprints)) {
      for (const fp of rec.finding_fingerprints) coveredFps.add(fp);
    }
    for (const f of findings) {
      const fp = f.fingerprintId || f.fingerprint || '';
      if (fp) coveredFps.add(fp);
    }

    // Pick the highest-severity finding as the representative issue.
    // Used for fix text and description only — NOT for fingerprintId.
    const repFinding = findings
      .filter(f => f.severity === 'critical' || f.severity === 'warning')
      .sort((a, b) => (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99))[0]
      || findings[0]
      || null;

    // Stable finding fingerprint for downstream code that expects a real finding ID
    // (GuidedFix affected-elements filter, /api/ask focusIssue lookup).
    // Intentionally null when no genuine finding exists — callers must handle null.
    // NEVER set to rec.fingerprint: rec fingerprints are not finding fingerprints.
    const repFindingFp = repFinding?.fingerprintId
      || repFinding?.canonicalFingerprintId
      || null;

    // Merge deduplicated affected resources from all supporting findings
    const seenUrls = new Set();
    const mergedItems = [];
    for (const f of findings) {
      for (const item of (f.items || [])) {
        const key = item.url || item.label || JSON.stringify(item);
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          mergedItems.push(item);
        }
      }
    }

    // Collect unique categories across supporting findings.
    // The rec's declared category (from RECOMMENDATION_GROUPS) is the primary
    // badge so it is always correct (e.g. 'Accessibility' for accessibility-barriers)
    // regardless of iteration order among supporting findings.
    const recCategory = rec.category || null;
    const findingCategories = [...new Set(findings.map(f => f.area || f.source || '').filter(Boolean))];
    // Primary category: rec.category first; fall back to finding areas
    const primaryCategory = recCategory || findingCategories[0] || 'Performance';
    // All categories for multi-badge: include rec category + all finding areas, deduped
    const allCategories = recCategory
      ? [recCategory, ...findingCategories.filter(c => c !== recCategory)]
      : findingCategories;

    tasks.push({
      // fingerprintId is a real finding fingerprint (or null) — never the rec fingerprint.
      // Used as additional context, but _isRecLevelContext controls downstream scope.
      fingerprintId:  repFindingFp,
      severity:       topSeverity,
      message:        rec.title || (repFinding?.message ?? ''),
      description:    rec.what_we_found || rec.explanation || (repFinding?.description ?? ''),
      fix:            repFinding?.fix ?? null,
      source:         repFinding?.source ?? 'lh',
      // Primary category from rec declaration (not from rep finding's area) so the
      // badge is always correct regardless of which supporting finding sorts first.
      area:           primaryCategory,
      items:          mergedItems,
      // Extras for the action plan
      _recFingerprint:    rec.fingerprint,
      _categories:        allCategories,
      _rec:               rec,
      // Explicit context marker: this task represents a recommendation, not a single
      // finding. Downstream code (GuidedFix affected-elements, Ask handlers) must use
      // rec-level scope (show all supporting findings, omit findingFingerprintId) when
      // this flag is true. Only finding-specific entries from the Findings tab have
      // _isRecLevelContext === false/undefined.
      _isRecLevelContext: true,
    });
  }

  // Ungrouped critical/warning findings not covered by any rec
  for (const issue of issuesArr) {
    if (issue.severity !== 'critical' && issue.severity !== 'warning') continue;
    const fp = issue.fingerprintId || issue.fingerprint || '';
    const cid = issue.canonicalFingerprintId || fp;
    if (coveredFps.has(fp) || coveredFps.has(cid)) continue;
    tasks.push({ ...issue, _recFingerprint: null, _categories: null, _rec: null });
  }

  // Priority order for secondary sort within a severity tier.
  // Recs carry a computed `priority` field from calcPriority (persisted to DB).
  // Ungrouped findings don't have this field; they fall through to 'medium'.
  const taskPrio = t => PRIO_ORDER[t._rec?.priority || t.priority || 'medium'] ?? 2;

  // Unified ranking: severity first (critical < warning), then rec priority within tier,
  // then insertion order (stable — preserves analyzer ordering within equal priority).
  tasks.sort((a, b) => {
    const sevDiff = (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    return taskPrio(a) - taskPrio(b);
  });

  return tasks.slice(0, 7);
}

/**
 * Returns the impact label for a task at position idx in the priority list.
 * Mirrors the getImpact() function in ReportClient.
 */
export function getImpact(task, idx) {
  return task.severity === 'critical' || idx < 2 ? 'high' : idx < 5 ? 'medium' : 'low';
}
