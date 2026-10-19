// AI analysis — structured discoveries, ranked actions, UX score, site type

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
