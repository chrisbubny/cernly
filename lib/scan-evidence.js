// Bounded structured evidence shared by Ask and Guided Fix. Preserve complete
// captured URLs and timing units; never turn path latency into "wasted time".
//
// Key allowlist covers:
//   - Standard resource items: url, wastedMs, wastedBytes, totalBytes, blockingTime, etc.
//   - Dependency chain items: requestId, parentRequestId, parentUrl, depth, chainDurationMs, etc.
//   - Node/element items: label, selector, snippet
//   - Source-location items (insight audits, e.g. forced-reflow-insight):
//       line, column — position in the compiled file
//       originalUrl, originalLine — source-mapped original location (when available)
//       reflowTime — measured forced-reflow duration in ms (the primary diagnostic value)
export function formatEvidenceItems(items, { limit = 5, maxChars = 3000 } = {}) {
  if (!Array.isArray(items) || !items.length) return '';
  const lines = [];
  let length = 0;
  for (const item of items.slice(0, limit)) {
    const record = {};
    for (const key of [
      // Resource/dependency chain fields
      'url', 'urlTruncated', 'label', 'selector', 'snippet',
      'requestId', 'parentRequestId', 'parentUrl', 'depth',
      'chainDurationMs', 'requestDurationMs', 'transferSize',
      'wastedMs', 'wastedBytes', 'totalBytes', 'blockingTime', 'isLongest',
      // Source-location fields (insight-class audits: forced-reflow-insight etc.)
      'line', 'column', 'originalUrl', 'originalLine', 'reflowTime',
    ]) {
      if (item?.[key] != null) record[key] = typeof item[key] === 'string' ? item[key].slice(0, key === 'snippet' ? 300 : 2048) : item[key];
    }
    const line = JSON.stringify(record);
    if (length + line.length > maxChars) break;
    lines.push(line); length += line.length;
  }
  if (lines.length < items.length) lines.push(`[partial evidence: ${lines.length} of ${items.length} captured items shown]`);
  return lines.join('\n');
}
