/**
 * Stage 4 — Deterministic scan comparison engine.
 *
 * Design principles (per spec):
 * - URL matching is conservative and exact; case-sensitive paths are preserved
 * - www.example.com and example.com are NOT assumed equivalent
 * - Score thresholds are heuristics, never "verified improvement"
 * - Finding resolution requires a successful audit, not just absence
 * - Recommendation status derives from underlying finding fingerprints
 * - No AI calls — all output is deterministic prose
 */

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a URL for comparison.
 * - Lowercases scheme and hostname (case-insensitive per RFC)
 * - Preserves original path casing (paths ARE case-sensitive)
 * - Strips trailing slash from non-root paths
 * - Strips query string and fragment (comparison is about the page, not a specific state)
 * - Does NOT strip www — www.example.com and example.com may serve different content
 * Returns null if URL cannot be parsed.
 */
export function normalizeUrlForComparison(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    const scheme = u.protocol.toLowerCase();            // case-insensitive
    const host   = u.hostname.toLowerCase();            // case-insensitive
    const port   = u.port ? `:${u.port}` : '';          // keep explicit ports
    let   path   = u.pathname;                          // case-sensitive — do NOT lowercase
    // Strip trailing slash only when path is more than just "/"
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${scheme}//${host}${port}${path}`;
  } catch {
    return null;
  }
}

/**
 * Check whether two scan URLs represent the same page.
 * Returns { compatible: true } or { compatible: false, reason: string }.
 */
export function checkUrlCompatibility(urlA, urlB) {
  const normA = normalizeUrlForComparison(urlA);
  const normB = normalizeUrlForComparison(urlB);
  if (!normA || !normB) {
    return { compatible: false, reason: 'One or both scan URLs could not be parsed.' };
  }
  if (normA !== normB) {
    return {
      compatible: false,
      reason: `These scans are for different pages ("${normA}" vs "${normB}") and cannot be compared.`,
    };
  }
  return { compatible: true };
}

// ---------------------------------------------------------------------------
// Audit coverage helpers
// ---------------------------------------------------------------------------

const AUDIT_CATEGORIES = ['performance', 'seo', 'security', 'accessibility'];

/** True if the audit ran and produced a usable score. */
export function auditCompleted(auditStatuses, category) {
  return auditStatuses?.[category]?.status === 'completed';
}

/** True if the audit could not run (failed or blocked — results are absent or untrustworthy). */
export function auditFailed(auditStatuses, category) {
  const s = auditStatuses?.[category]?.status;
  return s === 'failed' || s === 'blocked';
}

/**
 * Map a fingerprintId prefix to its audit category.
 * lh:* → performance, seo:* → seo, ssl:* → security, a11y:* → accessibility
 * Returns null for unknown prefixes.
 */
export function categoryForFingerprint(fingerprintId) {
  if (!fingerprintId) return null;
  const prefix = fingerprintId.split(':')[0];
  return { lh: 'performance', seo: 'seo', ssl: 'security', a11y: 'accessibility' }[prefix] ?? null;
}

// ---------------------------------------------------------------------------
// Score delta analysis
// ---------------------------------------------------------------------------

/**
 * Conservative noise thresholds.
 * Changes within these bands should not be described as meaningful.
 * These are heuristics, not statistically derived significance levels.
 *
 * Performance and accessibility use wider bands because Lighthouse results
 * are known to fluctuate naturally by ~5–10 points between identical runs.
 * SEO and security checks are more deterministic, so use tighter bands.
 */
const SCORE_NOISE_BAND = {
  performance:   8,
  seo:           3,
  security:      3,
  accessibility: 8,
  ux:            5,
};

/**
 * Threshold above which a change is "notable" (worth calling out, but still
 * not "verified" — that requires repeated observations or finding evidence).
 */
const SCORE_NOTABLE_THRESHOLD = {
  performance:   15,
  seo:            8,
  security:       8,
  accessibility: 15,
  ux:            10,
};

/**
 * Analyze the score change between two scans for one category.
 *
 * significance levels:
 *  'noise'    — within normal variation; do not describe as meaningful
 *  'observed' — outside noise band; worth noting as an observed change
 *  'notable'  — large observed change; worth calling out prominently
 *
 * NOTE: Even 'notable' is an *observed* change, not a *verified* improvement.
 * Verification requires repeated observations or finding-level evidence.
 */
export function analyzeScoreDelta(prev, curr, category) {
  if (prev == null || curr == null) {
    return {
      prev, curr,
      delta: null,
      direction: 'unknown',
      significance: 'noise',
      label: 'No data for comparison',
    };
  }
  const delta   = curr - prev;
  const abs     = Math.abs(delta);
  const noise   = SCORE_NOISE_BAND[category]       ?? 5;
  const notable = SCORE_NOTABLE_THRESHOLD[category] ?? 10;

  const direction    = abs <= noise ? 'unchanged'
                     : delta > 0   ? 'improved'
                     :               'regressed';

  const significance = abs <= noise  ? 'noise'
                     : abs >= notable ? 'notable'
                     :                  'observed';

  const sign  = delta > 0 ? '+' : '';
  const label = abs <= noise
    ? 'No meaningful change'
    : `${sign}${delta} pts (${significance === 'notable' ? 'notable' : 'observed'} change — not yet verified)`;

  return { prev, curr, delta, direction, significance, label };
}

// ---------------------------------------------------------------------------
// Finding-level comparison
// ---------------------------------------------------------------------------

/**
 * Compare issue fingerprints between two scans.
 *
 * Resolution of a finding requires that the relevant audit COMPLETED
 * successfully in the current scan. A missing finding without a successful
 * audit is "unable to verify" — never "likely resolved."
 *
 * @param {Array} prevIssues   Issues from the older scan (with fingerprintId)
 * @param {Array} currIssues   Issues from the newer scan (with fingerprintId)
 * @param {object} prevAudit   auditStatuses from the older scan
 * @param {object} currAudit   auditStatuses from the newer scan
 * @returns {{ still_detected, likely_resolved, unable_to_verify, new_since }}
 */
export function compareFindings(prevIssues, currIssues, prevAudit, currAudit) {
  const prevIds      = new Set((prevIssues || []).map(i => i.fingerprintId).filter(Boolean));
  const currIds      = new Set((currIssues || []).map(i => i.fingerprintId).filter(Boolean));
  const prevIssueMap = new Map((prevIssues || []).filter(i => i.fingerprintId).map(i => [i.fingerprintId, i]));
  const currIssueMap = new Map((currIssues || []).filter(i => i.fingerprintId).map(i => [i.fingerprintId, i]));

  const still_detected = [];
  const likely_resolved = [];
  const unable_to_verify = [];

  for (const id of prevIds) {
    const prevIssue = prevIssueMap.get(id);
    if (currIds.has(id)) {
      // Still present — same fingerprintId found in current scan
      still_detected.push({
        fingerprintId: id,
        issue: prevIssue,
        currentIssue: currIssueMap.get(id),
      });
    } else {
      // Not in current scan — check whether the audit actually ran
      const cat        = categoryForFingerprint(id);
      const auditOk    = cat != null ? auditCompleted(currAudit, cat) : null;
      const auditBad   = cat != null ? auditFailed(currAudit, cat)    : null;

      if (auditOk === true) {
        // Audit ran and completed — absence is meaningful evidence of resolution
        likely_resolved.push({ fingerprintId: id, issue: prevIssue, verifiedBy: cat });
      } else {
        // Audit failed, blocked, unavailable, or category unknown — cannot conclude
        const reason = cat == null
          ? 'Audit category unknown — cannot confirm resolution'
          : auditBad
          ? `${cat} audit failed or was blocked in the current scan — resolution cannot be confirmed`
          : `${cat} audit did not complete — resolution cannot be confirmed`;
        unable_to_verify.push({ fingerprintId: id, issue: prevIssue, reason });
      }
    }
  }

  // New findings that weren't in the previous scan (potential regressions)
  const new_since = [];
  for (const id of currIds) {
    if (!prevIds.has(id)) {
      const issue = currIssueMap.get(id);
      // Flag significant-severity new findings only
      if (issue?.severity === 'critical' || issue?.severity === 'warning') {
        new_since.push({ fingerprintId: id, issue });
      }
    }
  }

  return { still_detected, likely_resolved, unable_to_verify, new_since };
}

// ---------------------------------------------------------------------------
// Recommendation-level comparison
// ---------------------------------------------------------------------------

/**
 * Match previous recommendations against current scan evidence.
 *
 * Key rule: resolution is derived from the underlying finding fingerprints
 * and audit coverage — NOT from whether the recommendation group reappears
 * in the current scan's recommendations. A recommendation may disappear from
 * the current rec list simply because score thresholds changed; that does not
 * mean the issue is fixed.
 *
 * @param {Array}  prevRecs          Recommendations from the older scan
 * @param {Array}  currRecs          Recommendations from the newer scan
 * @param {Array}  currIssues        Issues from the newer scan (with fingerprintId)
 * @param {object} currAuditStatuses auditStatuses from the newer scan
 */
export function compareRecommendations(prevRecs, currRecs, currIssues, currAuditStatuses) {
  const currFingerprintSet = new Set((currIssues || []).map(i => i.fingerprintId).filter(Boolean));
  const currRecMap         = new Map((currRecs || []).map(r => [r.fingerprint, r]));

  const still_open         = [];
  const likely_resolved    = [];
  const partially_resolved = [];
  const unable_to_verify   = [];
  const new_high_priority  = [];

  for (const prevRec of (prevRecs || [])) {
    // Gather all finding fingerprints this recommendation was based on
    const findingFps = [
      ...(prevRec.finding_fingerprints || []),
      ...((prevRec.supporting_findings || []).map(f => f?.fingerprintId).filter(Boolean)),
    ];
    const uniqueFps = [...new Set(findingFps)];

    if (uniqueFps.length === 0) {
      // No finding-level evidence available — fall back to group fingerprint presence
      // This can happen for historical recs generated before Stage 1
      if (currRecMap.has(prevRec.fingerprint)) {
        still_open.push({
          rec: prevRec,
          currentRec: currRecMap.get(prevRec.fingerprint),
          basis: 'group_fingerprint',
          note: 'No supporting finding fingerprints — comparison is approximate',
        });
      } else {
        unable_to_verify.push({
          rec: prevRec,
          reason: 'No supporting finding fingerprints available — resolution cannot be determined from finding-level evidence',
        });
      }
      continue;
    }

    let resolvedCount     = 0;
    let unverifiableCount = 0;
    let persistentCount   = 0;

    for (const fid of uniqueFps) {
      if (currFingerprintSet.has(fid)) {
        persistentCount++;
      } else {
        const cat     = categoryForFingerprint(fid);
        const auditOk = cat != null ? auditCompleted(currAuditStatuses, cat) : null;
        if (auditOk === true) {
          resolvedCount++;
        } else {
          unverifiableCount++;
        }
      }
    }

    const total = uniqueFps.length;

    if (persistentCount === total) {
      // All underlying findings still present
      still_open.push({ rec: prevRec, currentRec: currRecMap.get(prevRec.fingerprint) || null, persistentFindings: persistentCount, total });
    } else if (resolvedCount === total) {
      // All underlying findings gone, and the relevant audits confirmed it
      likely_resolved.push({ rec: prevRec, resolvedFindings: resolvedCount, total });
    } else if (persistentCount === 0 && unverifiableCount > 0) {
      // No findings still detected, but some couldn't be verified
      unable_to_verify.push({
        rec: prevRec,
        reason: `${unverifiableCount} of ${total} finding${unverifiableCount !== 1 ? 's' : ''} could not be verified — relevant audit${unverifiableCount !== 1 ? 's' : ''} did not complete`,
        resolvedCount,
        unverifiableCount,
        total,
      });
    } else {
      // Mixed: some resolved, some still present, possibly some unverifiable
      partially_resolved.push({
        rec: prevRec,
        currentRec: currRecMap.get(prevRec.fingerprint) || null,
        resolvedFindings:     resolvedCount,
        persistentFindings:   persistentCount,
        unverifiableFindings: unverifiableCount,
        total,
      });
    }
  }

  // New high-priority recs in current scan not present in the previous scan
  for (const currRec of (currRecs || [])) {
    const existedBefore = (prevRecs || []).some(r => r.fingerprint === currRec.fingerprint);
    if (!existedBefore && (currRec.priority === 'critical' || currRec.priority === 'high')) {
      new_high_priority.push({ rec: currRec });
    }
  }

  return { still_open, likely_resolved, partially_resolved, unable_to_verify, new_high_priority };
}

// ---------------------------------------------------------------------------
// Deterministic progress summary (no AI)
// ---------------------------------------------------------------------------

/**
 * Compose a plain-English summary from comparison data.
 * This is entirely deterministic — no AI, no external calls.
 * The summary sounds like a brief advisor note, not a score readout.
 */
export function buildProgressSummary(comparison) {
  const { scoreDelta, findings, recommendations, verificationLimitations, comparabilityLevel } = comparison;

  const improvedCats  = Object.entries(scoreDelta).filter(([, d]) => d.direction === 'improved'  && d.significance !== 'noise');
  const regressedCats = Object.entries(scoreDelta).filter(([, d]) => d.direction === 'regressed' && d.significance !== 'noise');

  const resolvedRecs  = recommendations.likely_resolved.length;
  const persistRecs   = recommendations.still_open.length + recommendations.partially_resolved.length;
  const partialRecs   = recommendations.partially_resolved.length;
  const newIssues     = recommendations.new_high_priority.length;

  const parts = [];

  const nothingMeaningful =
    improvedCats.length === 0 &&
    regressedCats.length === 0 &&
    resolvedRecs === 0 &&
    newIssues === 0 &&
    findings.likely_resolved.length === 0;

  if (nothingMeaningful) {
    parts.push('No meaningful changes were detected between these scans.');
  } else {
    if (improvedCats.length > 0) {
      const cats = improvedCats.map(([cat]) => cat);
      const label = cats.length === 1 ? cats[0] : cats.slice(0, -1).join(', ') + ' and ' + cats.at(-1);
      parts.push(`${label.charAt(0).toUpperCase() + label.slice(1)} score${cats.length > 1 ? 's' : ''} improved since the previous scan.`);
    }
    if (regressedCats.length > 0) {
      const cats = regressedCats.map(([cat]) => cat);
      const label = cats.length === 1 ? cats[0] : cats.slice(0, -1).join(', ') + ' and ' + cats.at(-1);
      parts.push(`${label.charAt(0).toUpperCase() + label.slice(1)} score${cats.length > 1 ? 's' : ''} declined — investigate what changed.`);
    }
    if (resolvedRecs > 0) {
      parts.push(`${resolvedRecs} previously recommended ${resolvedRecs === 1 ? 'fix appears' : 'fixes appear'} to have been addressed.`);
    }
    if (partialRecs > 0) {
      parts.push(`${partialRecs} ${partialRecs === 1 ? 'fix is' : 'fixes are'} partially addressed.`);
    }
    if (newIssues > 0) {
      parts.push(`${newIssues} new high-priority ${newIssues === 1 ? 'issue has' : 'issues have'} appeared since the last scan.`);
    }
    if (persistRecs > 0 && resolvedRecs === 0 && newIssues === 0) {
      parts.push('Previously identified issues are still present.');
    }
  }

  if (comparabilityLevel === 'limited') {
    parts.push('Note: Audit status metadata was incomplete — some comparisons are approximate.');
  } else if (verificationLimitations.length > 0) {
    parts.push(`Note: ${verificationLimitations[0]}`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compare two scan reports. prevScan is the older scan, currScan is the newer one.
 * Both must have: url, scores, auditStatuses, issues (with fingerprintId), recommendations
 *
 * @returns {ComparisonResult}
 */
export function compareScans(prevScan, currScan) {
  // 1. URL compatibility check — conservative; different paths are not comparable
  const urlCheck = checkUrlCompatibility(prevScan.url, currScan.url);
  if (!urlCheck.compatible) {
    return {
      isComparable: false,
      incompatibilityReason: urlCheck.reason,
      comparabilityLevel: 'incompatible',
      scoreDelta: {},
      findings:        { still_detected: [], likely_resolved: [], unable_to_verify: [], new_since: [] },
      recommendations: { still_open: [], likely_resolved: [], partially_resolved: [], unable_to_verify: [], new_high_priority: [] },
      verificationLimitations: [urlCheck.reason],
      summary: `These scans cannot be compared. ${urlCheck.reason}`,
      comparedAt: new Date().toISOString(),
    };
  }

  const prevAudit = prevScan.auditStatuses || {};
  const currAudit = currScan.auditStatuses || {};

  // 2. Determine comparability level
  const hasAuditData = Object.keys(currAudit).length > 0 && Object.keys(prevAudit).length > 0;
  const comparabilityLevel = hasAuditData ? 'full' : 'limited';

  // 3. Score deltas — all five categories
  const ALL_CATS = ['performance', 'seo', 'security', 'accessibility', 'ux'];
  const scoreDelta = {};
  for (const cat of ALL_CATS) {
    scoreDelta[cat] = analyzeScoreDelta(
      prevScan.scores?.[cat] ?? null,
      currScan.scores?.[cat] ?? null,
      cat,
    );
  }

  // 4. Finding-level comparison
  const findings = compareFindings(
    prevScan.issues || [],
    currScan.issues || [],
    prevAudit,
    currAudit,
  );

  // 5. Recommendation-level comparison
  const recommendations = compareRecommendations(
    prevScan.recommendations || [],
    currScan.recommendations || [],
    currScan.issues || [],
    currAudit,
  );

  // 6. Collect verification limitations
  const verificationLimitations = [];
  const failedCats = AUDIT_CATEGORIES.filter(cat => auditFailed(currAudit, cat));
  if (failedCats.length > 0) {
    const noun = failedCats.length > 1 ? 'audits' : 'audit';
    verificationLimitations.push(
      `${failedCats.join(', ')} ${noun} failed in the current scan — resolution of findings in ${failedCats.length > 1 ? 'these areas' : 'this area'} cannot be confirmed.`
    );
  }
  if (findings.unable_to_verify.length > 0) {
    verificationLimitations.push(
      `${findings.unable_to_verify.length} finding${findings.unable_to_verify.length > 1 ? 's' : ''} could not be verified because relevant audits did not complete.`
    );
  }
  if (comparabilityLevel === 'limited') {
    verificationLimitations.push(
      'Audit status metadata is absent from one or both scans — comparison accuracy is limited.'
    );
  }

  const result = {
    isComparable: true,
    comparabilityLevel,
    incompatibilityReason: null,
    scoreDelta,
    findings,
    recommendations,
    verificationLimitations,
    comparedAt: new Date().toISOString(),
  };

  result.summary = buildProgressSummary(result);
  return result;
}
