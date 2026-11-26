/**
 * PDF evidence helpers (plain JS — no JSX, importable from tests).
 *
 * Field names match what the analyzers persist on report.issues[].items:
 *   lib/analyzers/a11y.js, seo.js       → { url, label }
 *   lib/analyzers/lighthouse.js         → { url, label, selector, snippet, totalBytes, wastedBytes, wastedMs, ... }
 *   lib/lighthouse-evidence.js          → { url, transferSize, requestDurationMs, ... }
 *   lib/insight-evidence.js             → { url, line, column, reflowTime, ... }
 * and the finding-level counts { totalDetected, evidenceTruncated, evidenceLimitations }.
 *
 * Nothing here caps, invents, or summarises items.
 */

export function truncateUrl(url, maxLen = 70) {
  if (!url || url.length <= maxLen) return url;
  return url.slice(0, 32) + '…' + url.slice(-(maxLen - 33));
}

export function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return null;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000)     return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

/**
 * Display text for one stored evidence item. Returns null only when the item
 * has no displayable field.
 */
export function evidenceDisplay(item) {
  if (!item || typeof item !== 'object') return null;
  const text = item.url ? truncateUrl(item.url)
    : (item.label || item.selector || (item.snippet ? truncateUrl(item.snippet, 90) : null));
  if (!text) return null;
  const size = item.totalBytes ?? item.transferSize ?? null;
  return { text, size: size != null ? formatBytes(size) : null };
}

/**
 * Disclosure when the scanner detected more elements than it recorded.
 * Uses only stored counts — never invents paths or counts.
 */
export function evidenceCoverageNote(finding, shown) {
  const total = Number.isFinite(finding?.totalDetected) ? finding.totalDetected : null;
  if (total != null && total > shown) {
    return shown > 0
      ? `${shown} of ${total} detected elements listed. The rest had no recorded source path or exceeded the scan's per-finding evidence limit.`
      : `${total} element${total === 1 ? '' : 's'} detected; no source paths were recorded for ${total === 1 ? 'it' : 'them'}.`;
  }
  if (finding?.evidenceTruncated && shown > 0) {
    return finding.evidenceLimitations || 'Evidence is partial: the scan capped the number of recorded items.';
  }
  return null;
}

/** Rows + note for a finding, as rendered by the Findings page. */
export function buildEvidence(finding) {
  const rows = (Array.isArray(finding?.items) ? finding.items : [])
    .map(evidenceDisplay).filter(Boolean);
  return { rows, note: evidenceCoverageNote(finding, rows.length) };
}
