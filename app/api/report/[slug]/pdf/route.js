/**
 * GET /api/report/[slug]/pdf
 *
 * Access gate + PDF rendering. The access logic is unchanged from the previous
 * implementation. PDF rendering is now delegated to ReportPDF.js and its
 * component tree.
 *
 * Query parameters:
 *   session_id  — Stripe checkout session ID (post-purchase race window)
 *   size        — "letter" (default) | "a4"
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { getReport, getReportBySlug, getUserSubscription, getRecommendationsByReport } from '@/lib/store';
import { isValidPaidStripeSession } from '@/lib/stripe-session';
import ReportPDF, { resolvePageSize } from './ReportPDF.js';

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
  const sessionId  = searchParams.get('session_id');
  const sizeParam  = searchParams.get('size');

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

  // ── Render ────────────────────────────────────────────────────────────────────
  // Recommendations live in their own table and are not part of the report
  // row (same as GET /api/report). Without them the Action Plan has no
  // grouped guidance. A lookup failure is logged and the PDF still renders;
  // ungrouped tasks carry their own "no grouped guidance" disclosure.
  let recommendations = [];
  try {
    recommendations = await getRecommendationsByReport(report.id);
  } catch (e) {
    console.error('[PDF] Recommendations lookup failed:', e.message);
  }

  try {
    const pageSize  = resolvePageSize(sizeParam);
    const pdfBuffer = await renderToBuffer(
      React.createElement(ReportPDF, { report: { ...report, recommendations }, size: pageSize })
    );

    const domain   = (() => { try { return new URL(report.url).hostname.replace('www.', ''); } catch { return 'report'; } })();
    const filename = `cernly-report-${domain}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length':      String(pdfBuffer.length),
        'Cache-Control':       'private, no-store',
      },
    });
  } catch (e) {
    console.error('[PDF] Render error:', e.message);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
