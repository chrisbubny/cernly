/**
 * scoring.js — Centralized score normalization and issue fingerprinting utilities.
 *
 * All consumers of scan scores and issue identifiers should import from here.
 * This prevents NaN/contamination bugs from spreading across the codebase.
 */

// ─── Score normalization ──────────────────────────────────────────────────────

/**
 * Normalize a raw score value to a finite integer in [0, 100] or null.
 * Handles: NaN, Infinity, negative, out-of-range, string "100", null, undefined.
 *
 * @param {*} v
 * @returns {number|null}
 */
export function normalizeScore(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Return a clean scores object with only finite numeric category scores.
 * Strips auditStatuses and any non-numeric fields. Missing categories become null.
 *
 * The canonical category keys are: performance, seo, security, accessibility, ux.
 *
 * @param {object} raw — scores object as stored in the DB or returned by the API
 * @returns {{ performance: number|null, seo: number|null, security: number|null, accessibility: number|null, ux: number|null }}
 */
export function normalizeScores(raw) {
  const s = raw || {};
  return {
    performance:   normalizeScore(s.performance),
    seo:           normalizeScore(s.seo),
    security:      normalizeScore(s.security),
    accessibility: normalizeScore(s.accessibility),
    ux:            normalizeScore(s.ux),
  };
}

/**
 * Compute the average of available numeric scores (excluding ux by default,
 * since ux is a derived estimate rather than a direct audit score).
 *
 * @param {object} scores — normalized or raw scores object
 * @param {string[]} [keys] — which categories to include; defaults to the four audited categories
 * @returns {number|null}
 */
export function avgScore(scores, keys = ['performance', 'seo', 'security', 'accessibility']) {
  const vals = keys.map(k => normalizeScore(scores?.[k])).filter(v => v != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Build the score lines string for AI prompts, using only valid numeric scores.
 *
 * @param {object} scores — raw or normalized scores
 * @param {object} [auditStatuses] — optional auditStatuses to append unavailability reason
 * @returns {string}  e.g. "Performance: 72/100 | SEO: 61/100 | Security: unavailable (fetch failed)"
 */
export function buildScoreLines(scores, auditStatuses = {}) {
  const normalized = normalizeScores(scores);
  const labels = {
    performance:   'Performance',
    seo:           'SEO',
    security:      'Security',
    accessibility: 'Accessibility',
    ux:            'UX',
  };
  const parts = [];
  for (const [key, label] of Object.entries(labels)) {
    if (key === 'ux') continue; // ux is a derived estimate, not a direct audit
    const score = normalized[key];
    const status = auditStatuses[key];
    if (score != null) {
      parts.push(`${label}: ${score}/100`);
    } else if (status?.status && status.status !== 'completed') {
      const reason = status.error?.message || status.status;
      parts.push(`${label}: unavailable (${reason})`);
    }
  }
  // Include UX only if it has a valid value
  if (normalized.ux != null) {
    parts.push(`UX: ${normalized.ux}/100 (estimated)`);
  }
  return parts.join(' | ') || 'No scores available';
}


// ─── Issue fingerprinting ─────────────────────────────────────────────────────

/**
 * Generate a stable cross-scan fingerprint for a finding.
 *
 * Rules:
 *  - Lighthouse issues: use the native Lighthouse audit ID (e.g. "render-blocking-resources")
 *  - SEO/SSL/A11y issues: use the analyzer-assigned checkId (e.g. "meta_desc_missing")
 *  - Fallback: normalize the message text to a slug (strips variable numbers)
 *
 * The fingerprint identifies "this type of issue" — two scans of the same site
 * with the same underlying problem will produce the same fingerprint, enabling
 * cross-scan tracking and regression detection.
 *
 * @param {{ source: string, auditId?: string, checkId?: string, message?: string, area?: string }} issue
 * @returns {string}
 */
export function generateIssueFingerprint(issue) {
  const source = issue.source || 'unknown';

  // Lighthouse: native audit ID is the most stable identifier
  if (issue.auditId) {
    return `lh:${issue.auditId}`;
  }

  // SEO / SSL / A11y: use the checkId assigned by the analyzer
  if (issue.checkId) {
    return `${source}:${issue.checkId}`;
  }

  // Fallback: normalize message — strip numeric values that change per-scan
  // (e.g. "Title too short (22 chars)" → "title_too_short_N_chars")
  const normalized = (issue.message || '')
    .toLowerCase()
    .replace(/\d+/g, 'N')            // replace numbers with N
    .replace(/[^a-z\s_]/g, '')       // strip punctuation
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);

  return `${source}:${normalized || 'unknown'}`;
}

/**
 * Assign stable fingerprint IDs to all issues in an array.
 * Returns a new array — does not mutate the originals.
 * Handles the case where a fingerprint would be non-unique within a scan
 * by appending a disambiguating suffix.
 *
 * @param {Array<object>} issues
 * @returns {Array<object>}
 */
export function assignIssueFingerprintIds(issues) {
  const seen = new Map(); // fingerprint → count
  return issues.map(issue => {
    const fp = generateIssueFingerprint(issue);
    const count = (seen.get(fp) || 0) + 1;
    seen.set(fp, count);
    // fingerprintId is unique within this scan: second occurrence of the same audit
    // gets a ':2' suffix so that multiple entries can coexist in one report without
    // colliding.  canonicalFingerprintId is always the base form — the stable identity
    // of the audit type across rescans.  Group matching, finding-rec fingerprints, and
    // remediation records all use the canonical form; display and dedup use fingerprintId.
    const fingerprintId = count > 1 ? `${fp}:${count}` : fp;
    return { ...issue, canonicalFingerprintId: fp, fingerprintId };
  });
}
