/**
 * lib/stripe-session.js
 *
 * Server-side Stripe session validation helper.
 *
 * Validates a Stripe checkout session_id by calling the Stripe API and
 * verifying that:
 *   1. The session exists and belongs to this Stripe account.
 *   2. The payment_status is 'paid'.
 *   3. The session metadata references the expected report (by slug or integer id).
 *
 * Fails closed: returns false on any error — missing API key, invalid session,
 * network error, metadata mismatch. Callers must not grant access on false.
 *
 * Latency: one Stripe API call (~100–400 ms). Only invoked when report.paid
 * is false AND a session_id query param is present (post-purchase race window).
 */

import Stripe from 'stripe';

/**
 * @param {string} sessionId   - Stripe checkout session ID (e.g. cs_live_...)
 * @param {string} reportSlug  - UUID slug of the report being accessed
 * @param {number|string} reportIntId - Integer ID of the report
 * @returns {Promise<boolean>}
 */
export async function isValidPaidStripeSession(sessionId, reportSlug, reportIntId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[stripe-session] STRIPE_SECRET_KEY not configured — session_id access denied');
    return false;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Must be a completed one-time payment (not a subscription session)
    if (session.payment_status !== 'paid') return false;
    if (session.mode !== 'payment') return false;

    // Verify this session was created for this specific report.
    // checkout/route.js sets metadata.reportSlug and metadata.reportId.
    const metaSlug = session.metadata?.reportSlug;
    const metaId   = session.metadata?.reportId;

    if (metaSlug && reportSlug && metaSlug !== String(reportSlug)) return false;
    if (metaId   && reportIntId && String(metaId) !== String(reportIntId)) return false;

    // At least one metadata field must match — reject sessions with no report metadata
    if (!metaSlug && !metaId) {
      console.warn('[stripe-session] session has no report metadata — denying access', sessionId.slice(0, 20));
      return false;
    }

    return true;
  } catch (e) {
    // StripeInvalidRequestError (invalid session ID), network errors, etc.
    console.warn('[stripe-session] validation failed:', e.message);
    return false;
  }
}
