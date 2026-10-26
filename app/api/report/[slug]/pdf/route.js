import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReport, getReportBySlug, getUserSubscription } from '@/lib/store';
import { isValidPaidStripeSession } from '@/lib/stripe-session';
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#151621',
    paddingTop: 48,
    paddingBottom: 52,
    paddingHorizontal: 48,
    backgroundColor: '#ffffff',
  },

  // Header
  header: {
    marginBottom: 28,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e9eaf2',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#151621',
    letterSpacing: 0.5,
  },
  reportTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#151621',
    marginBottom: 4,
  },
  reportUrl: {
    fontSize: 11,
    color: '#7948f6',
  },
  reportDate: {
    fontSize: 10,
    color: '#83899c',
    marginTop: 3,
  },

  // Scores row
  scoresRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  scoreTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e9eaf2',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#fafaff',
  },
  scoreNum: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.1,
    marginBottom: 4,
  },
  scoreLabel: {
    fontSize: 8,
    color: '#83899c',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Section
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#151621',
    marginBottom: 10,
    marginTop: 20,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: '#e9eaf2',
    marginTop: 4,
    marginBottom: 16,
  },

  // AI summary
  summaryBox: {
    backgroundColor: '#f7f4ff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#7948f6',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 11,
    color: '#333',
    lineHeight: 1.65,
  },

  // Issues
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 4,
    gap: 8,
  },
  issueDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 2,
    flexShrink: 0,
  },
  issueText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
    color: '#222',
  },
  issueBadge: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    flexShrink: 0,
  },

  // UX annotations
  annotationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f1f8',
    gap: 8,
  },
  annotationNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7948f6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  annotationNumText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#fff',
  },
  annotationLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#151621',
    marginBottom: 3,
  },
  annotationDetail: {
    fontSize: 9,
    color: '#4b5168',
    lineHeight: 1.55,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e9eaf2',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#b0b4c8',
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s == null) return '#b0b4c8';
  if (s >= 80) return '#19b987';
  if (s >= 60) return '#efa642';
  return '#ef6473';
}

function sevColor(sev) {
  return { critical: '#ef6473', warning: '#efa642', good: '#19b987', info: '#b0b4c8' }[sev] || '#b0b4c8';
}

function sevBg(sev) {
  return { critical: '#fff0f2', warning: '#fff8ed', good: '#edf9f4', info: '#f4f5fb' }[sev] || '#f4f5fb';
}

function sevLabel(sev) {
  return { critical: 'Critical', warning: 'Warning', good: 'Passed', info: 'Info' }[sev] || 'Info';
}

// Categorize issues same as frontend
const CATEGORIES = [
  { key: 'performance',    label: 'Performance',    accent: '#ef6473' },
  { key: 'seo',            label: 'SEO',             accent: '#efa642' },
  { key: 'accessibility',  label: 'Accessibility',   accent: '#7948f6' },
  { key: 'bestPractices',  label: 'Best Practices',  accent: '#19b987' },
  { key: 'ux',             label: 'UX',              accent: '#2563eb' },
  { key: 'security',       label: 'Security',        accent: '#e84393' },
];

// ── PDF Document ─────────────────────────────────────────────────────────────
function ReportPDF({ report }) {
  const { url, scores = {}, issues = [], aiSummary, uxAnnotations, createdAt } = report;
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const dateStr = createdAt ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  // Group issues by category
  const byCategory = {};
  for (const cat of CATEGORIES) byCategory[cat.key] = [];
  for (const issue of issues) {
    const k = issue.source || issue.category || 'bestPractices';
    if (byCategory[k]) byCategory[k].push(issue);
    else byCategory['bestPractices'].push(issue);
  }

  const scoreEntries = [
    { label: 'PERFORMANCE', value: scores.performance ?? null },
    { label: 'SEO', value: scores.seoScore ?? scores.seo ?? null },
    { label: 'ACCESSIBILITY', value: scores.accessibility ?? null },
    { label: 'BEST PRACTICES', value: scores.bestPractices ?? null },
  ];

  return (
    <Document title={`Cernly Report — ${domain}`} author="Cernly.ai">
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.brandName}>Cernly</Text>
          </View>
          <Text style={styles.reportTitle}>Website Analysis Report</Text>
          <Text style={styles.reportUrl}>{url}</Text>
          {dateStr ? <Text style={styles.reportDate}>Generated {dateStr}</Text> : null}
        </View>

        {/* ── Scores ── */}
        <View style={styles.scoresRow}>
          {scoreEntries.map(({ label, value }) => (
            <View key={label} style={styles.scoreTile}>
              <Text style={[styles.scoreNum, { color: scoreColor(value) }]}>
                {value != null ? String(value) : '—'}
              </Text>
              <Text style={styles.scoreLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── AI Summary ── */}
        {aiSummary ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>✦ AI Summary</Text>
            <Text style={styles.summaryText}>{aiSummary}</Text>
          </View>
        ) : null}

        {/* ── Issues by category ── */}
        <Text style={styles.sectionTitle}>Findings</Text>
        <View style={styles.sectionDivider} />

        {CATEGORIES.map(cat => {
          const catIssues = byCategory[cat.key] || [];
          if (catIssues.length === 0) return null;
          const critCount = catIssues.filter(i => i.severity === 'critical').length;
          const warnCount = catIssues.filter(i => i.severity === 'warning').length;
          return (
            <View key={cat.key} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat.accent }} />
                <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#151621', flex: 1 }}>{cat.label}</Text>
                <Text style={{ fontSize: 9, color: '#83899c' }}>
                  {[critCount > 0 && `${critCount} critical`, warnCount > 0 && `${warnCount} warnings`].filter(Boolean).join(' · ') || `${catIssues.length} items`}
                </Text>
              </View>
              {catIssues.slice(0, 12).map((issue, i) => (
                <View key={i} style={[styles.issueRow, { backgroundColor: sevBg(issue.severity) }]}>
                  <View style={[styles.issueDot, { backgroundColor: sevColor(issue.severity) }]} />
                  <Text style={styles.issueText}>
                    {issue.message || issue.title || ''}
                    {issue.displayValue ? `  (${issue.displayValue})` : ''}
                  </Text>
                  <Text style={[styles.issueBadge, { backgroundColor: sevBg(issue.severity), color: sevColor(issue.severity) }]}>
                    {sevLabel(issue.severity)}
                  </Text>
                </View>
              ))}
              {catIssues.length > 12 && (
                <Text style={{ fontSize: 9, color: '#83899c', marginLeft: 16 }}>+ {catIssues.length - 12} more findings</Text>
              )}
            </View>
          );
        })}

        {/* ── UX Annotations ── */}
        {uxAnnotations?.annotations?.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>UX Design Review</Text>
            <View style={styles.sectionDivider} />
            {uxAnnotations.annotations.map((ann, i) => (
              <View key={i} style={styles.annotationRow}>
                <View style={styles.annotationNum}>
                  <Text style={styles.annotationNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.annotationLabel}>{ann.label}</Text>
                  {ann.area ? <Text style={{ fontSize: 9, color: '#7948f6', marginBottom: 3 }}>{ann.area}</Text> : null}
                  {ann.detail ? <Text style={styles.annotationDetail}>{ann.detail}</Text> : null}
                </View>
                <Text style={[styles.issueBadge, { backgroundColor: sevBg(ann.severity), color: sevColor(ann.severity) }]}>
                  {ann.severity === 'good' ? 'Good' : ann.severity === 'critical' ? 'Critical' : 'Warning'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>cernly.ai — Website Analysis Report</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request, { params }) {
  const { slug } = params;

  if (!slug) {
    return NextResponse.json({ error: 'Invalid report slug' }, { status: 400 });
  }

  // Support both UUID slugs and legacy integer IDs
  const report = /^\d+$/.test(slug) ? await getReport(slug) : await getReportBySlug(slug);
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // ── Access gate ───────────────────────────────────────────────────────────────
  // PDF access is granted when any ONE of the following holds:
  //   1. report.paid is true (single-report purchase confirmed by webhook)
  //   2. The caller is the report owner AND has an active Pro subscription
  //   3. A valid Stripe session_id is supplied (post-purchase race window before
  //      the webhook fires; validated against the Stripe API — arbitrary strings denied)
  //
  // Authentication is required for checks 2 and 3. Check 1 (report.paid) is a
  // property of the report row and does not require the caller to be authenticated,
  // but without auth there is no ownership verification, so unauthenticated callers
  // can only access reports that have been explicitly marked paid by the webhook.
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');

  let viewerUserId = null;
  try { const { userId } = await auth(); viewerUserId = userId || null; } catch {}

  const isOwner = !!(viewerUserId && report.userId && viewerUserId === report.userId);

  // Check 1: webhook-confirmed purchase
  if (report.paid) {
    // Paid flag set — no further checks needed; continue to PDF generation below.
  } else if (isOwner) {
    // Check 2: owner with active Pro subscription
    const subscription = await getUserSubscription(viewerUserId).catch(() => null);
    if (!subscription) {
      // Not paid and not Pro — check for a valid post-purchase session_id
      if (sessionId) {
        const validSession = await isValidPaidStripeSession(sessionId, report.slug, report.id);
        if (!validSession) {
          return NextResponse.json({ error: 'Purchase required to download PDF', purchaseRequired: true }, { status: 403 });
        }
        // Valid session — allow; the webhook will set paid=true shortly
      } else {
        return NextResponse.json({ error: 'Purchase required to download PDF', purchaseRequired: true }, { status: 403 });
      }
    }
    // Has Pro subscription — allow
  } else if (sessionId) {
    // Check 3: non-owner with a session_id (unauthenticated or different user just purchased)
    const validSession = await isValidPaidStripeSession(sessionId, report.slug, report.id);
    if (!validSession) {
      return NextResponse.json({ error: 'Purchase required to download PDF', purchaseRequired: true }, { status: 403 });
    }
    // Valid session — allow
  } else {
    return NextResponse.json({ error: 'Purchase required to download PDF', purchaseRequired: true }, { status: 403 });
  }

  try {
    const pdfBuffer = await renderToBuffer(<ReportPDF report={report} />);
    const domain = (() => { try { return new URL(report.url).hostname.replace('www.', ''); } catch { return 'report'; } })();
    const filename = `cernly-report-${domain}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[PDF] Render error:', e.message);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
