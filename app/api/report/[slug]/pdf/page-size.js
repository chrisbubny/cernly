/**
 * Page-size utilities — pure JS, no JSX, importable from tests.
 * Re-exported by ReportPDF.js for convenience.
 */

/** Supported size identifiers passed to react-pdf <Page size="…"> */
export const PAGE_SIZES = {
  letter: 'LETTER',  // US Letter — 8.5 × 11 in (default)
  a4:     'A4',      // ISO A4 — 210 × 297 mm
};

/**
 * Map a ?size= query param string to a react-pdf page-size identifier.
 * Defaults to US Letter.
 */
export function resolvePageSize(sizeParam) {
  const key = (sizeParam || '').toLowerCase();
  return PAGE_SIZES[key] ?? PAGE_SIZES.letter;
}
