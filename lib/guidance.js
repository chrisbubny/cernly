/**
 * lib/guidance.js
 *
 * Generates structured, role-stratified guidance plans for recommendation groups.
 * PoC scope: image-optimization only. The infrastructure is group-agnostic;
 * prompt tuning is the only per-group work needed to extend.
 *
 * Design principles (from approved PoC requirements):
 * - Evidence-grounded: measured values (specific KiB savings, image URLs) flow
 *   through to the prompt verbatim. No invented metrics.
 * - Confidence reflects measurement reliability, not finding severity.
 * - Plan is cached per recommendation row (not per user/session).
 * - Fallback is honest: returns actions[] from enrichment when generation fails.
 * - Content-based planFingerprint: derived from evidence + actions, not updated_at.
 */

import crypto from 'crypto';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GUIDANCE_MODEL     = 'claude-haiku-5-5';
const GUIDANCE_MAX_TOKENS = 2500;
const GUIDANCE_TIMEOUT_MS = 18000;

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Content-based plan fingerprint.
 * Derived from the recommendation's fingerprint, evidence, and action titles.
 * Changes when scan data changes — stable across re-enrichments with identical data.
 */
export function derivePlanFingerprint(rec) {
  const input = [
    rec.fingerprint || '',
    JSON.stringify(rec.evidence || {}),
    (rec.actions || []).map(a => a.title || '').join('|'),
  ].join('::');
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/**
 * Stable step ID: 8-char hash of (groupKey + step title, lowercased + trimmed).
 * Survives re-enrichments as long as the step title stays the same.
 */
export function deriveStepId(groupKey, stepTitle) {
  const input = `${groupKey}::${stepTitle.trim().toLowerCase()}`;
  return 'step-' + crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

// ---------------------------------------------------------------------------
// Evidence formatting — group-agnostic
// ---------------------------------------------------------------------------

/**
 * Human-readable labels for known evidence fields.
 * Any field NOT in this map is formatted as a title-cased key.
 */
const EVIDENCE_LABELS = {
  // image-optimization
  imageCount:       'Images with optimization potential',
  totalSavingsKib:  'Total potential savings (KiB)',
  lcpImageUrl:      'LCP image URL',
  lcpSavingsKib:    'LCP image savings (KiB)',
  imageUrls:        'Affected image URLs',
  modernFormats:    'Modern format opportunities',
  confidence:       'Measurement confidence',
  // performance metrics
  lcp:              'Largest Contentful Paint (LCP)',
  fcp:              'First Contentful Paint (FCP)',
  tbt:              'Total Blocking Time (TBT)',
  cls:              'Cumulative Layout Shift (CLS)',
  ttfb:             'Time to First Byte (TTFB)',
  si:               'Speed Index',
  // SEO
  titleLength:      'Title tag length (chars)',
  descLength:       'Meta description length (chars)',
  h1Count:          'H1 tag count',
  hasCanonical:     'Canonical tag present',
  schemaCount:      'Structured data schemas',
  hasViewport:      'Viewport meta present',
  // security
  isHttps:          'HTTPS enabled',
  hasHsts:          'HSTS header',
  hasCsp:           'Content-Security-Policy header',
  hasXfo:           'X-Frame-Options header',
  httpRedirects:    'HTTP→HTTPS redirects',
  // accessibility
  imgsNoAlt:        'Images missing alt text',
  emptyButtons:     'Buttons with no label',
  genericLinks:     'Generic link text ("click here")',
  hasLang:          'Language attribute set',
  hasSkipNav:       'Skip navigation link present',
};

/**
 * Format rec.evidence into a plain-language prompt block.
 * Works for any recommendation group — formats whatever fields are present.
 * No invented placeholders.
 */
function formatEvidenceBlock(evidence) {
  if (!evidence || Object.keys(evidence).length === 0) {
    return '  No measured evidence available.';
  }

  const lines = [];

  for (const [key, value] of Object.entries(evidence)) {
    if (value == null) continue;

    const label = EVIDENCE_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

    // Arrays (imageUrls, modernFormats, etc.)
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`  ${label}:`);
      value.slice(0, 5).forEach(v => lines.push(`    - ${v}`));
      if (value.length > 5) lines.push(`    (and ${value.length - 5} more)`);
      continue;
    }

    // Confidence string
    if (key === 'confidence') {
      lines.push(`  ${label}: ${value} — ${confidenceNote(value)}`);
      continue;
    }

    // Booleans
    if (typeof value === 'boolean') {
      lines.push(`  ${label}: ${value ? 'Yes' : 'No'}`);
      continue;
    }

    // Numbers with units
    if (key.endsWith('Kib') || key.endsWith('KiB')) {
      lines.push(`  ${label}: ${value} KiB`);
      continue;
    }
    if (key === 'lcp' || key === 'fcp' || key === 'ttfb' || key === 'tbt' || key === 'si') {
      lines.push(`  ${label}: ${value} ms`);
      continue;
    }

    lines.push(`  ${label}: ${value}`);
  }

  return lines.length > 0 ? lines.join('\n') : '  No measured evidence available.';
}

function confidenceNote(confidence) {
  if (confidence === 'high')   return 'byte-exact savings measured per image from completed audit';
  if (confidence === 'medium') return 'savings estimated; audit completed but per-image data partial';
  return 'audit incomplete or evidence inferred from secondary signals only';
}

function formatActionsBlock(actions) {
  if (!actions || actions.length === 0) return '  No actions identified.';
  return actions.map((a, i) => `  ${i + 1}. ${a.title}${a.description ? ': ' + a.description : ''}`).join('\n');
}

// ---------------------------------------------------------------------------
// Generation prompt
// ---------------------------------------------------------------------------

function buildPrompt(rec, domain) {
  const evidenceBlock = formatEvidenceBlock(rec.evidence);
  const actionsBlock  = formatActionsBlock(rec.actions);

  return `You are generating a step-by-step improvement guide for a website owner or developer. The website performance scanner found the following about ${domain || 'their site'}.

SCAN EVIDENCE (measured values — use these exactly; do not adjust or invent):
${evidenceBlock}

FINDING SUMMARY:
${rec.what_we_found || 'Performance issues were detected on this site.'}

WHY IT MATTERS:
${rec.why_it_matters || 'Large images slow down page load times, especially on mobile.'}

TECHNICAL ACTIONS IDENTIFIED BY SCANNER:
${actionsBlock}

TASK: Produce a JSON guidance plan with 3–5 steps. The plan must:
1. Quote specific measured values from the scan evidence (e.g. "your hero image is ${rec.evidence?.lcpSavingsKib != null ? rec.evidence.lcpSavingsKib + ' KiB' : 'the largest image'}"). If a value was not measured, say "not measured in this scan" rather than inventing a number.
2. Provide two instruction paths per step: "owner" (for a non-technical site owner who may delegate) and "developer" (technical implementation).
3. Keep step titles short (≤8 words, imperative).
4. The "owner" path must tell the user what to do without assuming they can write code. Include specific tool names (e.g. Squoosh at squoosh.app) where appropriate.
5. The "developer" path must reference the specific image URLs from the scan evidence where available.
6. Do not mention tools or frameworks (WordPress, Shopify, Next.js, etc.) unless the scan evidence mentions them.

Return ONLY valid JSON in this exact shape (no markdown, no explanation):
{
  "evidenceSummary": "<one to two sentences summarizing what was found, using specific measured values>",
  "steps": [
    {
      "title": "<imperative title ≤8 words>",
      "owner": {
        "action": "<what the site owner should do>",
        "delegation": "<how to hand this off to a developer if needed>",
        "why": "<one sentence: why this step matters>"
      },
      "developer": {
        "action": "<technical implementation step>",
        "tooling": "<specific tools or commands>",
        "notes": "<any caveats or scan-specific observations>"
      }
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Server-side plan validation
// ---------------------------------------------------------------------------

/**
 * Validates the shape of a generated plan before caching.
 * Rejects plans that are missing required structure or reference values
 * that are not present in the actual evidence.
 */
export function validatePlan(plan, rec) {
  const errors = [];

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['plan is not an object'] };
  }
  if (typeof plan.evidenceSummary !== 'string' || plan.evidenceSummary.trim().length < 10) {
    errors.push('evidenceSummary missing or too short');
  }
  if (!Array.isArray(plan.steps) || plan.steps.length < 1) {
    errors.push('steps must be a non-empty array');
  } else {
    plan.steps.forEach((step, i) => {
      if (!step.title || typeof step.title !== 'string') {
        errors.push(`step[${i}].title missing`);
      }
      if (!step.owner || typeof step.owner.action !== 'string') {
        errors.push(`step[${i}].owner.action missing`);
      }
      if (!step.developer || typeof step.developer.action !== 'string') {
        errors.push(`step[${i}].developer.action missing`);
      }
    });
  }

  // Check for invented byte-size savings not present in evidence.
  // Only applies when no KiB-based measurements exist in the evidence at all.
  const evidenceStr = JSON.stringify(rec.evidence || {});
  const evidenceHasBytes = /\d+\s*(KiB|KB|MB|kB)/.test(evidenceStr);
  if (!evidenceHasBytes && plan.evidenceSummary) {
    const fabricatedPattern = /\d+\s*(KiB|KB|MB|kB)/;
    if (fabricatedPattern.test(plan.evidenceSummary)) {
      errors.push('evidenceSummary contains byte measurements not present in scan evidence');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

/**
 * generateGuidancePlan(rec, domain)
 *
 * Calls claude-haiku-5-5 to produce a structured guidance plan for the given
 * recommendation. Returns the plan with stable step IDs and planFingerprint.
 *
 * On any failure, returns { fallback: true, actions: rec.actions }.
 */
export async function generateGuidancePlan(rec, domain) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[guidance] ANTHROPIC_API_KEY not set');
    return { fallback: true, reason: 'no_api_key', actions: rec.actions || [] };
  }

  const groupKey  = rec.group_key || rec.fingerprint || 'unknown';
  const planFp    = derivePlanFingerprint(rec);
  const prompt    = buildPrompt(rec, domain);

  let rawText;
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      GUIDANCE_MODEL,
        max_tokens: GUIDANCE_MAX_TOKENS,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(GUIDANCE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || 'unknown';
      console.error('[guidance] API error:', res.status, msg);
      return { fallback: true, reason: `api_${res.status}:${msg}`, actions: rec.actions || [] };
    }

    const data = await res.json();
    rawText = data.content?.[0]?.text;
    if (!rawText) {
      const detail = `stop_reason=${data.stop_reason} content_len=${data.content?.length} content0_type=${data.content?.[0]?.type} usage=${JSON.stringify(data.usage)}`;
      console.error('[guidance] empty response from API:', detail);
      return { fallback: true, reason: `empty_response:${detail}`, actions: rec.actions || [] };
    }
  } catch (e) {
    const isTimeout = e.name === 'TimeoutError' || e.message?.includes('timed out');
    const reason = isTimeout ? 'timeout' : `fetch_error:${e.message}`;
    console.error('[guidance] fetch error:', reason);
    return { fallback: true, reason, actions: rec.actions || [] };
  }

  // Parse JSON — strip markdown fences if present
  let parsed;
  try {
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[guidance] JSON parse error:', e.message, rawText.slice(0, 200));
    return { fallback: true, reason: `json_parse:${e.message}`, actions: rec.actions || [] };
  }

  // Server-side validation
  const { valid, errors } = validatePlan(parsed, rec);
  if (!valid) {
    console.error('[guidance] plan validation failed:', errors);
    return { fallback: true, reason: `validation:${errors.join('; ')}`, actions: rec.actions || [] };
  }

  // Assign stable step IDs
  const stepsWithIds = parsed.steps.map(step => ({
    ...step,
    id: deriveStepId(groupKey, step.title),
  }));

  const plan = {
    planFingerprint:  planFp,
    generatedAt:      new Date().toISOString(),
    recUpdatedAt:     rec.updated_at || null,
    evidenceSummary:  parsed.evidenceSummary,
    steps:            stepsWithIds,
  };

  return plan;
}
