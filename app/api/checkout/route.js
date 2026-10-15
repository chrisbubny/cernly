import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/checkout
// Body: { reportId }
// Returns: { url } — Stripe checkout URL
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}

  const { reportId } = body;
  if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

  // Derive base URL from the incoming request so redirects work on any host
  const host = request.headers.get('host') || '';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : 'https://cernly.ai');

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
    success_url: `${appUrl}/report/${reportId}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/analyze?url=${encodeURIComponent(body.url || '')}`,
    metadata: {
      reportId: String(reportId),
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
