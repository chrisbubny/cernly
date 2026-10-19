// AI analysis — structured discoveries, ranked actions, UX score, site type, assessment

import { buildScoreLines, normalizeScores, avgScore } from '@/lib/scoring';

const SITE_TYPES = ['Marketing', 'SaaS', 'E-commerce', 'Blog', 'Portfolio', 'Agency', 'Non-profit', 'Government', 'Healthcare', 'News/Media'];

export async function runAiSummary({ url, scores, auditStatuses = {}, issues, lhData = null, seoData = null, sslData = null, a11yData = null }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return buildFallback({ scores, issues });

  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount  = issues.filter(i => i.severity === 'warning').length;

  // Use buildScoreLines to safely format scores — excludes non-numeric fields
  // like auditStatuses and includes unavailability reasons for failed analyzers.
  const scoreLines = buildScoreLines(scores, auditStatuses);

  // Send all critical/warning issues for richer analysis (cap at 20)
  const significantIssues = issues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 20)
    .map(i => {
      const id = i.fingerprintId ? ` [id:${i.fingerprintId}]` : '';
      return `[${i.severity.toUpperCase()}][${i.area}]${id} ${i.message}${i.description ? ' — ' + i.description : ''}`;
    })
    .join('\n');

  // Structured evidence — actual measured values from analyzers.
  // The AI must only reference metrics that are present here; it must not
  // invent measurements, estimated improvements, or root causes.
  const evidenceLines = [];

  // Lighthouse Core Web Vitals
  if (lhData?.metrics) {
    const m = lhData.metrics;
    if (m.lcp)  evidenceLines.push(`LCP (Largest Contentful Paint): ${m.lcp}`);
    if (m.cls)  evidenceLines.push(`CLS (Cumulative Layout Shift): ${m.cls}`);
    if (m.tbt)  evidenceLines.push(`TBT (Total Blocking Time): ${m.tbt}`);
    if (m.fcp)  evidenceLines.push(`FCP (First Contentful Paint): ${m.fcp}`);
    if (m.ttfb) evidenceLines.push(`TTFB (Server Response Time): ${m.ttfb}`);
    if (m.si)   evidenceLines.push(`Speed Index: ${m.si}`);
  }

  // SEO checks — actual field values from seo.js checks object
  if (seoData?.checks) {
    const c = seoData.checks;
    if (c.title     != null) evidenceLines.push(`SEO: title tag = "${String(c.title).slice(0, 80)}" (${String(c.title).length} chars)`);
    if (c.metaDesc  != null) evidenceLines.push(`SEO: meta description length = ${String(c.metaDesc).length} chars`);
    if (c.h1Count   != null) evidenceLines.push(`SEO: H1 count = ${c.h1Count}`);
    if (c.canonical != null) evidenceLines.push(`SEO: canonical tag = ${c.canonical ? `"${c.canonical}"` : 'missing'}`);
    if (c.schemas   != null) evidenceLines.push(`SEO: structured data types = ${c.schemas.length > 0 ? c.schemas.join(', ') : 'none'}`);
    if (c.robotsMeta)        evidenceLines.push(`SEO: robots meta = "${c.robotsMeta}"`);
    if (c.viewport  != null) evidenceLines.push(`SEO: viewport meta = ${c.viewport}`);
  }

  // SSL / security header checks
  if (sslData?.checks) {
    const c = sslData.checks;
    if (c.isHttps != null) evidenceLines.push(`Security: HTTPS = ${c.isHttps}`);
    if (c.strict_transport_security != null) evidenceLines.push(`Security: HSTS header = ${c.strict_transport_security}`);
    if (c.content_security_policy   != null) evidenceLines.push(`Security: CSP header = ${c.content_security_policy}`);
    if (c.x_frame_options           != null) evidenceLines.push(`Security: X-Frame-Options = ${c.x_frame_options}`);
    if (c.httpRedirects             != null) evidenceLines.push(`Security: HTTP→HTTPS redirect = ${c.httpRedirects}`);
  }

  // Accessibility checks
  if (a11yData?.checks) {
    const c = a11yData.checks;
    if (c.imgsNoAlt  != null) evidenceLines.push(`A11y: images missing alt text = ${c.imgsNoAlt}`);
    if (c.hasLang    != null) evidenceLines.push(`A11y: html[lang] present = ${c.hasLang}`);
    if (c.hasSkipNav != null) evidenceLines.push(`A11y: skip-nav link present = ${c.hasSkipNav}`);
  }

  const evidenceBlock = evidenceLines.length
    ? `\nMEASURED EVIDENCE (use only these values — do not invent or estimate):\n${evidenceLines.join('\n')}`
    : '';

  const prompt = `You are a senior web performance consultant analyzing a website audit for its owner. Return a JSON object with exactly these fields:

1. "summary": 2-3 sentence plain-English health summary. Mention specific scores. Name 1-2 key issues. End with the single most important action to take. Warm, direct, non-alarming. Under 70 words.

2. "siteType": one of: ${SITE_TYPES.join(', ')} — best fit for this domain.

3. "uxScore": integer 0-100. Estimate UX quality from performance, accessibility, and UX-related issues.

4. "uxInsights": {
   "conversion_focus": short phrase describing what this site is trying to get visitors to do (e.g. "hire me", "buy products", "read content"),
   "top_recommendation": single most impactful UX improvement, 1 sentence,
   "observations": array of 3-5 objects covering the most important UX areas:
   {
     "area": one of: "Above the fold" | "Navigation" | "Calls to action" | "Mobile experience" | "Forms & inputs" | "Page speed feel" | "Content clarity" | "Visual hierarchy",
     "verdict": "good" | "warning" | "critical",
     "finding": 1 sentence describing what was found,
     "fix": 1 sentence describing the specific improvement to make (omit if verdict is "good")
   }
}

5. "discoveries": array of 2-4 objects, each representing a meaningful pattern across the findings:
{
  "title": short discovery name (5-8 words),
  "explanation": 1-2 sentences connecting related issues and explaining why they matter together,
  "confidence": "high" | "medium" | "low",
  "category": "Performance" | "SEO" | "Security" | "Accessibility" | "UX",
  "actions": array of 2-3 objects:
    {
      "title": concise action title (imperative, 4-7 words),
      "detail": 1 sentence of specific guidance,
      "impact": "high" | "medium" | "low",
      "effort": "low" | "medium" | "high"
    }
}

6. "sectionSummaries": object with keys for each category that has issues. Only include a key if that category has at least one issue. Each value is 1-2 sentences synthesizing the most important patterns in that category — what the issues mean together and what to focus on first. Keys: "performance" | "seo" | "accessibility" | "bestPractices" | "security". Example: { "performance": "Your page load is slowed by unoptimized images and render-blocking scripts — fixing these two things alone could lift your score by 15+ points.", "seo": "Missing meta descriptions and low-quality title tags are the main culprits here." }

Group related issues into discoveries — don't just list individual findings. Prioritize by likely impact. For low-score categories (under 70), always include at least one discovery.

SITE: ${domain}
SCORES: ${scoreLines}${evidenceBlock}
ISSUES (${criticalCount} critical, ${warningCount} warnings):
${significantIssues || 'None detected'}

Return ONLY valid JSON. No markdown, no explanation.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const data = await res.json();
      const raw  = data.content?.[0]?.text?.trim() || '';
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try {
        const parsed = JSON.parse(text);
        return {
          aiSummary:        parsed.summary    || getFallbackText({ scores, issues }),
          siteType:         parsed.siteType   || null,
          uxScore:          typeof parsed.uxScore === 'number' ? parsed.uxScore : null,
          uxInsights:       parsed.uxInsights || null,
          aiInsights:       Array.isArray(parsed.discoveries) ? parsed.discoveries : null,
          sectionSummaries: parsed.sectionSummaries && typeof parsed.sectionSummaries === 'object' ? parsed.sectionSummaries : null,
        };
      } catch {
        console.error('[AI Summary] JSON parse failed, raw:', raw.slice(0, 200));
        return buildFallback({ scores, issues });
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.error(`[AI Summary] API error ${res.status}: ${errText.slice(0, 300)}`);
    }
  } catch (e) {
    console.error('[AI Summary]', e.message);
  }

  return buildFallback({ scores, issues });
}

// =============================================================================
// Stage 2: Structured Assessment
// =============================================================================

/**
 * Build a deterministic coverage summary from auditStatuses.
 * This is not AI-generated — it's a factual record of which audits ran.
 * Exported for testing.
 *
 * @param {object} auditStatuses — from route.js classifyResult()
 * @returns {{ ran: string[], failed: string[], limitations: string|null }}
 */
export function buildCoverageSummary(auditStatuses = {}) {
  const ALL_AUDITS = ['performance', 'seo', 'security', 'accessibility'];
  const ran = [], failed = [];
  for (const key of ALL_AUDITS) {
    const s = auditStatuses[key];
    if (s?.status === 'completed') ran.push(key);
    else failed.push(key);
  }
  const limitations = failed.length > 0
    ? `${failed.join(', ')} audit${failed.length > 1 ? 's' : ''} could not complete — ` +
      `do not make any positive or negative claims about ${failed.length > 1 ? 'these areas' : 'this area'}.`
    : null;
  return { ran, failed, limitations };
}

/**
 * Compute confidence level based on evidence reliability — not issue severity.
 * A healthy site with all audits complete and measured metrics earns 'high'.
 * Exported for testing.
 *
 * Rubric:
 *   high   — ≥3 audits completed AND (measured LH metrics OR traceable rec findings)
 *   low    — ≤1 audit completed OR (≥1 rec exists but none have supporting_findings)
 *   medium — everything else
 *
 * @param {object}   auditStatuses
 * @param {object[]} recommendations — enriched recs from generateRecommendations
 * @param {object}   lhData          — raw Lighthouse data (for metrics check)
 * @returns {'high'|'medium'|'low'}
 */
export function computeConfidenceLevel(auditStatuses = {}, recommendations = [], lhData = null) {
  const completedAudits = Object.values(auditStatuses)
    .filter(s => s?.status === 'completed').length;

  // Evidence quality 1: do we have actual measured performance metrics?
  const hasMeasuredMetrics = !!(
    lhData?.metrics &&
    (lhData.metrics.lcp || lhData.metrics.fcp || lhData.metrics.tbt || lhData.metrics.si)
  );

  // Evidence quality 2: do recommendations have traceable findings (not just fingerprint IDs)?
  const recsWithFindings = recommendations.filter(r =>
    Array.isArray(r.supporting_findings) && r.supporting_findings.length > 0
  ).length;
  // Traceable = either no recs (healthy site — good evidence), or ≥1 rec has supporting_findings
  const traceable = recommendations.length === 0 || recsWithFindings > 0;

  if (completedAudits >= 3 && (hasMeasuredMetrics || traceable)) return 'high';
  if (completedAudits <= 1) return 'low';
  if (completedAudits === 2 && !hasMeasuredMetrics && !traceable) return 'low';
  return 'medium';
}

/**
 * Validate a parsed assessment object before persisting it.
 * Exported for testing.
 *
 * @param {object}  parsed            — AI-produced object after JSON.parse
 * @param {Set}     allowedFingerprints — Set of fingerprint strings from saved recs
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateAssessment(parsed, allowedFingerprints = new Set()) {
  if (!parsed || typeof parsed !== 'object') return { valid: false, reason: 'not an object' };

  if (typeof parsed.headline !== 'string' || !parsed.headline.trim())
    return { valid: false, reason: 'missing or empty headline' };

  if (typeof parsed.summary !== 'string' || !parsed.summary.trim())
    return { valid: false, reason: 'missing or empty summary' };

  if (!parsed.confidence || typeof parsed.confidence !== 'object')
    return { valid: false, reason: 'missing confidence object' };

  if (!['high', 'medium', 'low'].includes(parsed.confidence.level))
    return { valid: false, reason: `invalid confidence.level: ${parsed.confidence.level}` };

  if (!Array.isArray(parsed.strengths))
    return { valid: false, reason: 'strengths must be an array' };

  if (!Array.isArray(parsed.concerns))
    return { valid: false, reason: 'concerns must be an array' };

  if (!Array.isArray(parsed.next_steps))
    return { valid: false, reason: 'next_steps must be an array' };

  // top_opportunity: null is valid (healthy site / no clear winner)
  if (parsed.top_opportunity !== null && parsed.top_opportunity !== undefined) {
    const to = parsed.top_opportunity;
    if (typeof to !== 'object')
      return { valid: false, reason: 'top_opportunity must be null or an object' };

    const fps = to.recommendation_fingerprints;
    if (!Array.isArray(fps) || fps.length === 0)
      return { valid: false, reason: 'top_opportunity.recommendation_fingerprints must be a non-empty array' };

    for (const fp of fps) {
      if (!allowedFingerprints.has(fp))
        return { valid: false, reason: `top_opportunity references unknown fingerprint: "${fp}"` };
    }

    if (typeof to.rationale !== 'string' || !to.rationale.trim())
      return { valid: false, reason: 'top_opportunity.rationale must be a non-empty string' };
  }

  return { valid: true };
}

/**
 * Generate a structured website assessment after recommendations have been saved.
 *
 * This runs AFTER saveRecommendations so that top_opportunity.recommendation_fingerprints
 * can be validated against confirmed DB entries. Validated before saving.
 *
 * Timing: adds ~4-6s to the synchronous analyze pipeline (total ~25-30s, well within
 * 60s serverless budget). Kept synchronous in Stage 2 for simplicity; can be decoupled
 * in Stage 3 if latency becomes a concern.
 *
 * @param {object} opts
 * @param {string}   opts.url
 * @param {object[]} opts.recommendations — enriched recs (post-save, fingerprints confirmed)
 * @param {object}   opts.scores
 * @param {object}   opts.auditStatuses
 * @param {object[]} opts.issues
 * @param {object}   [opts.lhData]
 * @param {object}   [opts.seoData]
 * @param {object}   [opts.sslData]
 * @param {object}   [opts.a11yData]
 * @returns {Promise<object|null>} validated assessment or null on failure
 */
export async function runAssessment({
  url,
  recommendations = [],
  scores = {},
  auditStatuses = {},
  issues = [],
  lhData = null,
  seoData = null,
  sslData = null,
  a11yData = null,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  // ── Deterministic pre-computation (not AI-generated) ────────────────────────
  const coverage         = buildCoverageSummary(auditStatuses);
  const confidenceLevel  = computeConfidenceLevel(auditStatuses, recommendations, lhData);
  const allowedFingerprints = new Set(recommendations.map(r => r.fingerprint).filter(Boolean));

  // ── Score + evidence (reuse runAiSummary's buildScoreLines approach) ─────────
  const scoreLines = buildScoreLines(scores, auditStatuses);

  const evidenceLines = [];
  if (lhData?.metrics) {
    const m = lhData.metrics;
    if (m.lcp)  evidenceLines.push(`LCP: ${m.lcp}`);
    if (m.cls)  evidenceLines.push(`CLS: ${m.cls}`);
    if (m.tbt)  evidenceLines.push(`TBT (Total Blocking Time): ${m.tbt}`);
    if (m.fcp)  evidenceLines.push(`FCP: ${m.fcp}`);
    if (m.ttfb) evidenceLines.push(`TTFB: ${m.ttfb}`);
    if (m.si)   evidenceLines.push(`Speed Index: ${m.si}`);
  }
  if (sslData?.checks) {
    const c = sslData.checks;
    if (c.isHttps != null)                       evidenceLines.push(`HTTPS: ${c.isHttps}`);
    if (c.strict_transport_security != null)     evidenceLines.push(`HSTS: ${c.strict_transport_security}`);
    if (c.content_security_policy != null)       evidenceLines.push(`CSP: ${c.content_security_policy}`);
  }
  if (seoData?.checks) {
    const c = seoData.checks;
    if (c.title != null)     evidenceLines.push(`Title tag: "${String(c.title).slice(0, 60)}" (${String(c.title).length} chars)`);
    if (c.metaDesc != null)  evidenceLines.push(`Meta description: ${String(c.metaDesc).length} chars`);
    if (c.h1Count != null)   evidenceLines.push(`H1 count: ${c.h1Count}`);
    if (c.canonical != null) evidenceLines.push(`Canonical: ${c.canonical ? 'present' : 'missing'}`);
  }
  if (a11yData?.checks) {
    const c = a11yData.checks;
    if (c.imgsNoAlt != null)  evidenceLines.push(`Images missing alt text: ${c.imgsNoAlt}`);
    if (c.hasLang != null)    evidenceLines.push(`html[lang]: ${c.hasLang}`);
  }

  // ── Recommendation summary for prompt ────────────────────────────────────────
  // Fingerprint + title + top finding only — no full what_we_found text.
  // The AI must synthesize relationships, not copy recommendation content.
  const recSummaryLines = recommendations.slice(0, 10).map(r => {
    const topFinding = r.supporting_findings?.[0];
    const findingStr = topFinding
      ? `[${(topFinding.severity || 'info').toUpperCase()}] ${topFinding.message || ''}${topFinding.displayValue ? ' — ' + topFinding.displayValue : ''}`
      : '(no findings)';
    return `  ${r.fingerprint} | ${r.title} | ${findingStr}`;
  }).join('\n');

  const prompt = `You are a web performance consultant writing a structured website assessment for ${domain}.

STRICT RULES:
1. The recommendations system already contains all findings, actions, and fixes.
   Do NOT copy or restate them. SYNTHESIZE: explain relationships, reason about priority,
   describe the overall pattern of what is affecting this site.
2. Reference recommendations by fingerprint ID only (e.g. "js-overhead") — never copy their titles into the assessment prose (top_opportunity.title IS the title, that's the only exception).
3. Do NOT invent measurements, estimated improvements, or root causes not in the evidence.
4. For any audit listed under FAILED — make ZERO claims about that area, positive or negative.
5. top_opportunity MUST be null if no recommendation clearly deserves first priority.
6. next_steps MUST be [] if no well-supported actions exist.
7. For a healthy site with few or no issues, strengths should reflect the evidence; concerns and next_steps may be empty or sparse.

SITE: ${domain}
SCORES: ${scoreLines}

MEASURED EVIDENCE:
${evidenceLines.length ? evidenceLines.join('\n') : '(no measured values available)'}

AUDIT COVERAGE:
  Completed: ${coverage.ran.join(', ') || 'none'}
  Failed/unavailable: ${coverage.failed.join(', ') || 'none'}
${coverage.limitations ? `  LIMITATION: ${coverage.limitations}` : ''}

RECOMMENDATIONS (fingerprint | title | top finding):
${recSummaryLines || '  (none — this site may have few or no issues)'}

CONFIDENCE LEVEL: ${confidenceLevel} — this is pre-determined from evidence completeness.
Write only the explanation for why this level was assigned.

Return a JSON object with EXACTLY these fields (no others):

{
  "headline": "<≤15 words — the single most important conclusion about this site, site-specific>",
  "summary": "<2-3 sentences synthesizing what the findings mean together — not a list of issues>",
  "strengths": [
    { "area": "<category>", "finding": "<1 sentence citing actual evidence>", "evidence": "<measured value or finding ID>" }
  ],
  "concerns": [
    { "area": "<category>", "finding": "<1 sentence>", "severity": "high|medium|low", "evidence": "<finding ID or metric>" }
  ],
  "top_opportunity": null,
  "next_steps": [],
  "confidence": {
    "level": "${confidenceLevel}",
    "explanation": "<1 sentence citing which evidence supports or limits this confidence>"
  }
}

For top_opportunity, use this shape when a clear first priority exists:
  "top_opportunity": {
    "title": "<recommendation title>",
    "rationale": "<2-3 sentences: WHY this first? How does it relate to other concerns? What evidence supports urgency?>",
    "recommendation_fingerprints": ["<fingerprint-id>"]
  }

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[Assessment] API error ${res.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text?.trim() || '';
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[Assessment] JSON parse failed, raw:', raw.slice(0, 300));
      return null;
    }

    // Enforce pre-computed confidence level — AI must not override it
    if (parsed.confidence) parsed.confidence.level = confidenceLevel;

    // Attach deterministic coverage block (not AI-generated)
    parsed.coverage = {
      audits_ran:    coverage.ran,
      audits_failed: coverage.failed,
      limitations:   coverage.limitations,
    };

    const validation = validateAssessment(parsed, allowedFingerprints);
    if (!validation.valid) {
      console.error(`[Assessment] Validation failed: ${validation.reason}`);
      return null;
    }

    return parsed;

  } catch (e) {
    console.error('[Assessment]', e.message);
    return null;
  }
}

// =============================================================================
// End Stage 2
// =============================================================================

function buildFallback({ scores, issues }) {
  // Use normalizeScores to strip non-numeric fields (e.g. auditStatuses) before
  // computing the UX score — prevents NaN from contaminated input.
  const normalized = normalizeScores(scores);
  const uxComponents = [normalized.performance, normalized.accessibility].filter(v => v != null);
  const computedUxScore = uxComponents.length
    ? Math.round(uxComponents.reduce((a, b) => a + b, 0) / uxComponents.length)
    : null;

  return {
    aiSummary:        getFallbackText({ scores, issues }),
    siteType:         null,
    uxScore:          computedUxScore,
    uxInsights:       null,
    aiInsights:       null,
    sectionSummaries: null,
  };
}

function getFallbackText({ scores, issues }) {
  const criticals = issues.filter(i => i.severity === 'critical').length;
  // avgScore uses normalizeScores internally — safe against auditStatuses contamination
  // and NaN values; returns null when no valid numeric scores are available.
  const avg = avgScore(scores);

  if (avg === null) return 'Analysis complete. Review the issues below for recommendations.';
  if (avg >= 80) return `Your site is performing well with an average score of ${avg}/100${criticals > 0 ? `, though ${criticals} critical issue${criticals > 1 ? 's' : ''} need${criticals === 1 ? 's' : ''} attention` : ''}. Review the details below to push your scores higher.`;
  if (avg >= 60) return `Your site scores ${avg}/100 on average — solid in some areas but with room to improve${criticals > 0 ? `, including ${criticals} critical issue${criticals > 1 ? 's' : ''}` : ''}. The full report shows you exactly what to fix first.`;
  return `Your site scores ${avg}/100 on average with ${criticals} critical issue${criticals !== 1 ? 's' : ''} that could be hurting your search rankings and user experience. Fixing these should be your first priority.`;
}
