/**
 * ReportPDF — Document wrapper with font registration.
 *
 * Font registration happens once per process (react-pdf caches it).
 * Fonts are loaded from the local public/fonts/ directory — no network calls.
 * Files were copied from @fontsource/inter (SIL OFL license, see public/fonts/LICENSE.txt).
 *
 * Usage:
 *   const pdfBuffer = await renderToBuffer(
 *     <ReportPDF report={report} size="LETTER" />
 *   );
 */
import React from 'react';
import path from 'node:path';
import { Document, Font } from '@react-pdf/renderer';
import CoverPage      from './components/CoverPage.js';
import ActionPlanPage from './components/ActionPlanPage.js';
export { resolvePageSize, PAGE_SIZES } from './page-size.js';

// ── Font registration ─────────────────────────────────────────────────────────
// Called once at module load. react-pdf ignores duplicate registerFont calls
// for the same family name, so this is safe to run on every cold start.

const fontsDir = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(fontsDir, 'Inter-Regular.woff'),  fontWeight: 400 },
    { src: path.join(fontsDir, 'Inter-Medium.woff'),   fontWeight: 500 },
    { src: path.join(fontsDir, 'Inter-SemiBold.woff'), fontWeight: 600 },
    { src: path.join(fontsDir, 'Inter-Bold.woff'),     fontWeight: 700 },
  ],
});

// Convenience aliases used by StyleSheet definitions in styles.js.
// react-pdf matches these aliases via fontFamily name in StyleSheet.
Font.register({
  family: 'Inter-Medium',
  src: path.join(fontsDir, 'Inter-Medium.woff'),
});
Font.register({
  family: 'Inter-SemiBold',
  src: path.join(fontsDir, 'Inter-SemiBold.woff'),
});
Font.register({
  family: 'Inter-Bold',
  src: path.join(fontsDir, 'Inter-Bold.woff'),
});

// Disable hyphenation — Inter is a UI font; hyphens look wrong in a report
Font.registerHyphenationCallback(w => [w]);

// ── Document ──────────────────────────────────────────────────────────────────
export default function ReportPDF({ report, size = 'LETTER' }) {
  const domain = (() => {
    try { return new URL(report.url).hostname; } catch { return report.url; }
  })();

  return (
    <Document
      title={`Cernly Report — ${domain}`}
      author="Cernly.ai"
      creator="Cernly"
      producer="Cernly / @react-pdf/renderer"
    >
      <CoverPage     report={report} pageSize={size} />
      <ActionPlanPage report={report} pageSize={size} />
    </Document>
  );
}
