/**
 * GET /api/debug-guidance?token=CERNLY_DEBUG
 *
 * Diagnostic endpoint for the guidance generation pipeline.
 * Tests the full path — API connectivity, model response, parsing, validation —
 * without requiring a UI interaction or a real recommendation in the database.
 *
 * Guarded by a static token to prevent public exposure.
 * REMOVE THIS FILE before any public launch.
 */
import { NextResponse } from 'next/server';

const ANTHROPIC_API_URL  = 'https://api.anthropic.com/v1/messages';
const GUIDANCE_MODEL     = 'claude-haiku-5-5';
const DEBUG_TOKEN        = 'CERNLY_DEBUG_2026';   // change to taste

// Minimal prompt — tests the round-trip without a real rec
const PING_PROMPT = `Return ONLY valid JSON with this exact shape, no explanation:
{"ok":true,"msg":"guidance pipeline operational"}`;

// Representative full prompt — mirrors real guidance generation
const FULL_PROMPT = `You are generating a step-by-step improvement guide for a website owner or developer. The website performance scanner found the following about example.com.

AUDIENCE: The primary reader is a developer who will implement the fix directly.

SCAN EVIDENCE (measured values — use these exactly; do not adjust or invent):
  HTTPS enabled: Yes
  HSTS header: No
  Content-Security-Policy header: No
  X-Frame-Options header: No
  HTTP→HTTPS redirects: Yes

FINDING SUMMARY:
The site is missing HSTS, CSP, and X-Frame-Options headers.

WHY IT MATTERS:
Missing security headers leave the site vulnerable to clickjacking, XSS, and downgrade attacks.

TECHNICAL ACTIONS IDENTIFIED BY SCANNER:
  1. Fix: Missing HSTS (Strict-Transport-Security) header: Add HSTS header with max-age=31536000
  2. Fix: Missing Content Security Policy (CSP) header: Add a CSP policy to prevent XSS
  3. Fix: Missing X-Frame-Options header: Add X-Frame-Options: DENY or SAMEORIGIN

TASK: Produce a JSON guidance plan with 3–5 steps. The plan must:
1. Quote specific measured values from the scan evidence.
2. Provide two instruction paths per step: "owner" and "developer".
3. Keep step titles short (≤8 words, imperative).
4. The "owner" path must tell the user what to do without assuming they can write code.
5. The "developer" path must include technical implementation steps.

Return ONLY valid JSON in this exact shape (no markdown, no explanation):
{
  "evidenceSummary": "<one to two sentences summarizing what was found>",
  "steps": [
    {
      "title": "<imperative title ≤8 words>",
      "owner": { "action": "<...>", "delegation": "<...>", "why": "<...>" },
      "developer": { "action": "<...>", "tooling": "<...>", "notes": "<...>" }
    }
  ]
}`;

async function callAnthropicRaw(prompt, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const start = Date.now();

  if (!apiKey) {
    return { error: 'ANTHROPIC_API_KEY not set in environment', elapsed: 0 };
  }

  let res, data, rawText;
  const result = {
    keyPresent: true,
    keyPrefix: apiKey.slice(0, 10) + '...',
    model: GUIDANCE_MODEL,
    maxTokens,
    promptLen: prompt.length,
    promptTokenEst: Math.round(prompt.length / 4),
  };

  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: GUIDANCE_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    result.fetchError = e.name === 'TimeoutError' ? 'timeout' : e.message;
    result.elapsed = Date.now() - start;
    return result;
  }

  result.elapsed = Date.now() - start;
  result.httpStatus = res.status;
  result.httpOk = res.ok;

  try {
    data = await res.json();
  } catch (e) {
    result.jsonDecodeError = e.message;
    return result;
  }

  result.responseType   = data.type;
  result.stopReason     = data.stop_reason;
  result.contentLen     = data.content?.length ?? null;
  result.content0Type   = data.content?.[0]?.type ?? null;
  result.usage          = data.usage ?? null;
  result.model          = data.model ?? null;

  if (!res.ok) {
    result.apiError = data.error?.message || JSON.stringify(data).slice(0, 200);
    return result;
  }

  rawText = data.content?.[0]?.text ?? null;
  result.rawTextLen = rawText?.length ?? null;
  result.rawTextPreview = rawText ? rawText.slice(0, 300) : null;

  if (!rawText) {
    result.stage = 'empty_response';
    // Surface every content block type to help diagnose
    result.allContentTypes = (data.content || []).map(b => b.type);
    return result;
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  result.cleanedPreview = cleaned.slice(0, 300);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
    result.stage = 'parsed';
    result.parsedKeys = Object.keys(parsed);
  } catch (e) {
    result.stage = 'json_parse_error';
    result.parseError = e.message;
    return result;
  }

  // Validate shape
  const errors = [];
  if (typeof parsed.evidenceSummary !== 'string' || parsed.evidenceSummary.trim().length < 5)
    errors.push('evidenceSummary missing');
  if (!Array.isArray(parsed.steps) || parsed.steps.length < 1)
    errors.push('steps empty');
  else {
    parsed.steps.forEach((s, i) => {
      if (!s.title)              errors.push(`step[${i}].title missing`);
      if (!s.owner?.action)     errors.push(`step[${i}].owner.action missing`);
      if (!s.developer?.action) errors.push(`step[${i}].developer.action missing`);
    });
  }

  result.validationErrors = errors;
  result.valid = errors.length === 0;
  result.stepCount = parsed.steps?.length ?? 0;
  if (result.valid) result.stage = 'success';
  else result.stage = 'validation_failed';

  return result;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (token !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {};

  // Test 1: minimal ping
  results.ping = await callAnthropicRaw(PING_PROMPT, 100);

  // Test 2: full guidance prompt (same as real generation)
  results.fullGuidance = await callAnthropicRaw(FULL_PROMPT, 2500);

  // Summary
  const pingOk = results.ping.stage === 'parsed' || results.ping.httpStatus === 200;
  const guidanceOk = results.fullGuidance.stage === 'success';

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env: {
      anthropicKeyPresent: !!process.env.ANTHROPIC_API_KEY,
      anthropicKeyPrefix: process.env.ANTHROPIC_API_KEY?.slice(0, 10) + '...',
      model: GUIDANCE_MODEL,
    },
    pingTest: results.ping,
    fullGuidanceTest: results.fullGuidance,
    summary: {
      apiReachable: pingOk,
      guidanceWorks: guidanceOk,
      overallOk: pingOk && guidanceOk,
    },
  }, { status: 200 });
}
