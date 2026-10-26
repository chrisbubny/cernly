/**
 * lib/ai-cost.js
 *
 * Shared Anthropic API cost estimation utilities.
 *
 * Rates are approximate and sourced from the Anthropic pricing page.
 * All values are for monitoring and observability ONLY — never use these
 * for billing, invoicing, or any financial decision.
 *
 * When the actual model returned by the API is not in this table, we return
 * { est_cost_usd_estimate: null, rateSource: 'unknown' } rather than silently
 * applying a default rate that may be wildly inaccurate for a new model.
 */

// USD per token (approximate). Updated: 2026-10.
export const MODEL_COST_RATES = {
  'claude-haiku-5-5':          { input: 0.0000008,   output: 0.000004   },
  'claude-sonnet-5-5':         { input: 0.000002,    output: 0.00001    },
  'claude-3-5-haiku-20241022': { input: 0.0000008,   output: 0.000004   },
  'claude-3-5-sonnet-20241022':{ input: 0.000003,    output: 0.000015   },
  'claude-3-haiku-20240307':   { input: 0.00000025,  output: 0.00000125 },
};

/**
 * Estimate the cost of a completed Anthropic API call.
 *
 * Returns null when token counts are unavailable.
 * Returns { est_cost_usd_estimate: null, rateSource: 'unknown', model } when
 * the model is not in our rate table — caller should log a warning but should
 * NOT fall back to a default rate, since the model's actual pricing is unknown.
 *
 * @param {string} model - Actual model ID from data.model in the Anthropic response
 * @param {number|null} inputTokens  - data.usage.input_tokens
 * @param {number|null} outputTokens - data.usage.output_tokens
 * @returns {{ est_cost_usd_estimate: string|null, rateSource: 'known'|'unknown', model?: string }|null}
 */
export function estimateCost(model, inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null;

  const rate = MODEL_COST_RATES[model];
  if (!rate) {
    return { est_cost_usd_estimate: null, rateSource: 'unknown', model };
  }

  return {
    est_cost_usd_estimate: ((inputTokens * rate.input) + (outputTokens * rate.output)).toFixed(6),
    rateSource: 'known',
  };
}
