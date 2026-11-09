// Extraction of diagnostic evidence from Lighthouse insight-class audits.
//
// Insight audits have scoreDisplayMode: 'informative' and score: null — they
// do not contribute to the category score and are recorded as 'unavailable'
// in auditResults. They are retained here as diagnostic findings only;
// severity is ALWAYS 'info' and is never escalated based on evidence content.
//
// Each extractor is specific to a confirmed audit shape (verified from
// lighthouse@13.6.0 source). Unknown audits return null so we never
// inadvertently store arbitrary nested structures.

// Insight audit IDs with extractable diagnostic evidence.
// Only 'list'-type audits that need special extraction are listed here.
// Table-type insight audits (render-blocking-insight, font-display-insight,
// image-delivery-insight, cache-insight) are handled by the existing table
// extractor in lighthouse.js once the score==null filter is relaxed for them.
export const INSIGHT_LIST_AUDITS = new Set([
  'forced-reflow-insight', // list → tables → source-location + reflowTime (ms)
]);

// Table-type insight audits whose items are compatible with the existing
// opportunity/table extractor in lighthouse.js. The filter relaxation
// uses this set to identify which score==null audits to allow through.
export const INSIGHT_TABLE_AUDITS = new Set([
  'render-blocking-insight', // table: url, totalBytes, wastedMs
  'font-display-insight',    // table: url, wastedMs
  'image-delivery-insight',  // table: url, totalBytes, wastedBytes
  'cache-insight',           // table: url, cacheLifetimeMs, totalBytes
]);

// All insight audits with extractable evidence (union of both sets).
export const INSIGHT_AUDITS = new Set([
  ...INSIGHT_LIST_AUDITS,
  ...INSIGHT_TABLE_AUDITS,
]);

/**
 * Extract diagnostic items from a list-type insight audit.
 *
 * @param {string} auditId
 * @param {object|null} details - audit.details from PSI response
 * @returns {{ items: Array|null, totalDetected: number|null, diagnostic: true }}
 */
export function extractInsightEvidence(auditId, details) {
  if (!details) return { items: null, totalDetected: null, diagnostic: true };

  if (auditId === 'forced-reflow-insight' && details.type === 'list') {
    return extractForcedReflowEvidence(details);
  }

  // Table-type insight audits are handled by the existing extractor; return
  // the diagnostic marker only so callers can flag the issue correctly.
  return { items: null, totalDetected: null, diagnostic: true };
}

/**
 * Extract source locations and reflow timings from forced-reflow-insight.
 *
 * Shape (from lighthouse@13.6.0 forced-reflow-insight.js):
 *   details.type = 'list'
 *   details.items = [
 *     { type: 'table', items: [{ source: source-location, reflowTime: ms }] },  // top function
 *     { type: 'table', items: [{ source: source-location, reflowTime: ms }] },  // bottom-up
 *   ]
 *
 * source-location shape:
 *   { type: 'source-location', url: '...', line: N, column: N,
 *     original: { url: '...', line: N, column: N } }  // source map location when available
 *
 * reflowTime is in milliseconds (Lighthouse stores trace microseconds /1000).
 */
function extractForcedReflowEvidence(details) {
  const items = [];
  let totalDetected = 0;

  for (const table of (details.items || [])) {
    if (!table || table.type !== 'table' || !Array.isArray(table.items)) continue;

    for (const row of table.items) {
      totalDetected++;
      if (items.length >= 20) continue; // cap at 20 items

      const src = row.source;
      // source-location entries always have type: 'source-location'
      if (!src || src.type !== 'source-location' || !src.url) continue;

      const item = {
        url: src.url.slice(0, 2048),
      };
      if (src.line   != null) item.line   = src.line;
      if (src.column != null) item.column = src.column;
      // Source map original location (present when the browser has source maps)
      if (src.original?.url)       item.originalUrl  = src.original.url.slice(0, 2048);
      if (src.original?.line != null) item.originalLine = src.original.line;
      // Reflow time in milliseconds, rounded to 1 decimal
      if (row.reflowTime != null && Number.isFinite(row.reflowTime)) {
        item.reflowTime = Math.round(row.reflowTime * 10) / 10;
      }

      items.push(item);
    }
  }

  return {
    items:          items.length ? items : null,
    totalDetected:  totalDetected || null,
    diagnostic:     true,
    // Surface to AI context: this is timing evidence, not proof of cause.
    // A source location identifies WHERE a reflow was triggered; the DOM
    // read/write pattern that caused it may be in calling code, not at this URL.
    evidenceLimitations: items.length
      ? 'Forced reflow source locations show where reflow was triggered, not necessarily the DOM read/write pattern causing it. The calling stack may be in a different file.'
      : null,
  };
}
