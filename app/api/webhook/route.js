import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { markReportPaid, upsertSubscription } from '@/lib/store';

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

  const { type, data } = event;

  // One-time report purchase
  if (type === 'checkout.session.completed') {
    const session = data.object;
    const reportId = session.metadata?.reportId;
    const userId   = session.client_reference_id || null;

    if (reportId) {
      await markReportPaid(reportId, userId).catch(e => {
        console.error('[Webhook] markReportPaid failed:', e.message);
      });
    }

    // Pro subscription checkout completed — subscription object is created separately
    // but we can capture the userId → stripeCustomerId mapping here
    if (session.mode === 'subscription' && userId && session.customer) {
      await upsertSubscription({
        userId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        plan: 'pro',
        status: 'active',
      }).catch(e => console.error('[Webhook] upsertSubscription (checkout) failed:', e.message));
    }
  }

  // Subscription lifecycle events
  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    const sub = data.object;
    const customerId = sub.customer;

    // Retrieve the customer to get their metadata / email
    let userId = sub.metadata?.userId || null;
    if (!userId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        userId = customer.metadata?.userId || null;
      } catch {}
    }

    if (userId) {
      await upsertSubscription({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        plan: 'pro',
        status: sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status,
      }).catch(e => console.error('[Webhook] upsertSubscription failed:', e.message));
    }
  }

  if (type === 'customer.subscription.deleted') {
    const sub = data.object;
    let userId = sub.metadata?.userId || null;
    if (!userId) {
      try {
        const customer = await stripe.customers.retrieve(sub.customer);
        userId = customer.metadata?.userId || null;
      } catch {}
    }
    if (userId) {
      await upsertSubscription({
        userId,
        stripeCustomerId: sub.customer,
        stripeSubscriptionId: sub.id,
        plan: 'pro',
        status: 'canceled',
      }).catch(e => console.error('[Webhook] upsertSubscription (cancel) failed:', e.message));
    }
  }

  return NextResponse.json({ received: true });
}

// App Router reads the raw body via request.text() — no config needed
