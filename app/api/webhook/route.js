import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { markReportPaid } from '@/lib/store';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const body = await request.text();
  const sig  = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[Webhook] Signature error:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const reportId = session.metadata?.reportId;
    const userId   = session.client_reference_id || null;

    if (reportId) {
      await markReportPaid(reportId, userId).catch(e => {
        console.error('[Webhook] markReportPaid failed:', e.message);
      });
    }
  }

  return NextResponse.json({ received: true });
}

// App Router reads the raw body via request.text() — no config needed
