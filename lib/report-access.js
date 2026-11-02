import { getReport, getReportBySlug } from '@/lib/store';

// The owner/public-sharing policy used by GET /api/report. Authentication for
// AI generation is a separate route requirement. A paid checkout session is
// still validated separately by the report-read endpoint.
export function canReadReport(report, userId) {
  return !!report && (report.isPublic === true || !!(userId && report.userId === userId));
}

export async function authorizeReport({ slug, id }, userId) {
  let report;
  try {
    report = slug ? await getReportBySlug(slug) : await getReport(id);
  } catch {
    return { status: 503, error: 'Report access could not be checked. Please try again.' };
  }
  if (!report) return { status: 404, error: 'Report not found' };
  if (!canReadReport(report, userId)) return { status: 403, error: 'This report is private.' };
  return { report };
}
