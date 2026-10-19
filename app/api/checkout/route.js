import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@clerk/nextjs/server';
import { getReport, getReportBySlug } from '@/lib/store';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function getAppUrl(request) {
  const host = request.headers.get('host') || '';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : 'https://cernly.ai');
}

// GET /api/checkout?plan=pro  — subscription checkout
export async function GET(request) {
  const { userId } = await auth();
  const plan = new URL(request.url).searchParams.get('plan');

  if (plan !== 'pro') {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  if (!process.env.STRIPE_PRO_PRICE_ID) {
    // Stripe not configured — redirect to pricing with a note
    return NextResponse.redirect(new URL('/pricing?error=not_configured', request.url));
  }

  const appUrl = getAppUrl(request);

  try {
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appUrl}/dashboard?upgraded=1`,
      cancel_url: `${appUrl}/pricing`,
      allow_promotion_codes: true,
    };

    // Attach Clerk userId so the webhook can link the subscription
    if (userId) {
      sessionParams.client_reference_id = userId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.redirect(session.url);
  } catch (e) {
    console.error('[Checkout/Pro]', e.message);
    return NextResponse.redirect(new URL('/pricing?error=stripe', request.url));
  }
}

// POST /api/checkout  — one-time report purchase
// Body: { reportId, url? }
// reportId may be a UUID slug or legacy integer — we resolve both
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}

  const { reportId: reportRef } = body;
  if (!reportRef) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

  // Resolve report to get integer id (for webhook) and slug (for success URL)
  const isSlug = /[a-f0-9-]{36}/.test(String(reportRef)) && !(/^\d+$/.test(String(reportRef)));
  const report = isSlug
    ? await getReportBySlug(String(reportRef)).catch(() => null)
    : await getReport(String(reportRef)).catch(() => null);

  // Fall back gracefully — use whatever was passed if lookup fails
  const intId   = report?.id   ?? reportRef;
  const urlSlug = report?.slug ?? reportRef;

  const appUrl = getAppUrl(request);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Cernly Full Site Report',
          description: 'Detailed website analysis with AI recommendations, prioritized fixes, and a shareable PDF report.',
          images: [`${appUrl}/og-report.png`],
        },
        unit_amount: 499, // $4.99
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${appUrl}/report/${urlSlug}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/analyze?url=${encodeURIComponent(body.url || '')}`,
    metadata: {
      reportId: String(intId), // integer ID for webhook → markReportPaid
      reportSlug: String(urlSlug), // UUID slug for reference
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
