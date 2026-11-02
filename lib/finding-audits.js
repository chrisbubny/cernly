// A display ID may have an ordinal suffix; verification tracks the audit type.
// Preserve unknown IDs rather than guessing their source or audit.
export function canonicalFindingId(finding) {
  const id = typeof finding === 'string'
    ? finding
    : finding?.canonicalFingerprintId || finding?.fingerprintId;
  return typeof id === 'string' ? id.replace(/^((?:lh|seo|ssl|a11y):[^:]+):\d+$/, '$1') : null;
}

// Only call after these checks actually ran. Early exits have no passing checks.
export function completedCheckResults(source, checkIds, issues) {
  const failed = new Set(issues.map(i => i.checkId));
  return Object.fromEntries(checkIds.map(id => [`${source}:${id}`, {
    status: failed.has(id) ? 'failed' : 'passed',
  }]));
}
