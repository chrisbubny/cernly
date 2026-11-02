// Supports Lighthouse's current network-tree and legacy criticalrequestchain
// detail schemas, including trees nested inside list details. Timing meanings
// differ: navStartToEndTime is a path duration in ms; legacy end-start is seconds.
export const DEPENDENCY_AUDITS = new Set(['network-dependency-tree-insight', 'critical-request-chains']);

export function extractDependencyEvidence(details, { maxItems = 20, maxVisited = 1000, maxDepth = 100 } = {}) {
  const items = [];
  const seen = new WeakSet();
  let visited = 0, total = 0, limited = false, longestChainMs = null;
  const stack = [{ details, depth: 0 }];
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  while (stack.length) {
    if (visited >= maxVisited) { limited = true; break; }
    const entry = stack.pop();
    const value = entry.details || entry.node;
    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) { limited = true; continue; }
    seen.add(value); visited++;
    if (entry.depth > maxDepth) { limited = true; continue; }
    if (entry.details) {
      if (value.type === 'list' && Array.isArray(value.items)) {
        for (const child of value.items.slice(0, maxVisited).reverse()) stack.push({ details: child, depth: entry.depth + 1 });
        if (value.items.length > maxVisited) limited = true;
      } else if (['network-tree', 'criticalrequestchain'].includes(value.type) && value.chains) {
        if (finite(value.longestChain?.duration)) longestChainMs = Math.max(longestChainMs || 0, value.longestChain.duration);
        for (const [id, node] of Object.entries(value.chains).slice(0, maxVisited).reverse()) {
          stack.push({ node, id, parentId: null, parentUrl: null, depth: 0 });
        }
        if (Object.keys(value.chains).length > maxVisited) limited = true;
      }
      continue;
    }
    const request = value.request || value;
    const url = typeof request.url === 'string' ? request.url : null;
    if (url) {
      total++;
      if (items.length < maxItems) {
        const item = { url: url.slice(0, 2048), requestId: String(entry.id).slice(0, 100),
          parentRequestId: entry.parentId, parentUrl: entry.parentUrl, depth: entry.depth };
        if (url.length > 2048) { item.urlTruncated = true; limited = true; }
        if (finite(value.navStartToEndTime)) item.chainDurationMs = value.navStartToEndTime;
        if (finite(request.startTime) && finite(request.endTime) && request.endTime >= request.startTime) {
          item.requestDurationMs = Math.round((request.endTime - request.startTime) * 1000);
        }
        if (finite(request.transferSize)) item.transferSize = request.transferSize;
        if (value.isLongest === true) item.isLongest = true;
        items.push(item);
      }
    }
    const children = Object.entries(value.children || {});
    if (children.length > maxVisited) limited = true;
    for (const [id, node] of children.slice(0, maxVisited).reverse()) {
      stack.push({ node, id, parentId: String(entry.id).slice(0, 100), parentUrl: url?.slice(0, 2048) || null, depth: entry.depth + 1 });
    }
  }
  const truncated = limited || total > items.length;
  return { items: items.length ? items : null, totalDetected: limited ? null : total,
    evidenceTruncated: truncated,
    evidenceLimitations: truncated ? 'Dependency evidence is partial: request count, depth, or field length was capped.' : null,
    longestChainMs };
}
