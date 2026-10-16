// AI analysis — structured discoveries, ranked actions, UX score, site type

const SITE_TYPES = ['Marketing', 'SaaS', 'E-commerce', 'Blog', 'Portfolio', 'Agency', 'Non-profit', 'Government', 'Healthcare', 'News/Media'];

export async function runAiSummary({ url, scores, issues }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return buildFallback({ scores, issues });

  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount  = issues.filter(i => i.severity === 'warning').length;

  const scoreLines = Object.entries(scores)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${v}/100`)
    .join(' | ');

  // Send all critical/warning issues for richer analysis (cap at 20)
  const significantIssues = issues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 20)
    .map(i => `[${i.severity.toUpperCase()}][${i.area}] ${i.message}${i.description ? ' — ' + i.description : ''}`)
    .join('\n');

  const prompt = `You are a senior web performance consultant analyzing a website audit for its owner. Return a JSON object with exactly these fields:

1. "summary": 2-3 sentence plain-English health summary. Mention specific scores. Name 1-2 key issues. End with the single most important action to take. Warm, direct, non-alarming. Under 70 words.

2. "siteType": one of: ${SITE_TYPES.join(', ')} — best fit for this domain.

3. "uxScore": integer 0-100. Estimate UX quality from performance, accessibility, and UX-related issues.

4. "uxInsights": {
   "conversion_focus": short phrase (e.g. "lead generation", "product purchases"),
   "top_recommendation": single most impactful UX improvement, 1 sentence
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

Group related issues into discoveries — don't just list individual findings. Prioritize by likely impact. For low-score categories (under 70), always include at least one discovery.

SITE: ${domain}
SCORES: ${scoreLines}
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
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (res.ok) {
      const data = await res.json();
      const raw  = data.content?.[0]?.text?.trim() || '';
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try {
        const parsed = JSON.parse(text);
        return {
          aiSummary:   parsed.summary    || getFallbackText({ scores, issues }),
          siteType:    parsed.siteType   || null,
          uxScore:     typeof parsed.uxScore === 'number' ? parsed.uxScore : null,
          uxInsights:  parsed.uxInsights || null,
          aiInsights:  Array.isArray(parsed.discoveries) ? parsed.discoveries : null,
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
  const uxComponents = [scores.performance, scores.accessibility].filter(v => v != null);
  const computedUxScore = uxComponents.length
    ? Math.round(uxComponents.reduce((a, b) => a + b, 0) / uxComponents.length)
    : null;

  return {
    aiSummary:  getFallbackText({ scores, issues }),
    siteType:   null,
    uxScore:    computedUxScore,
    uxInsights: null,
    aiInsights: null,
  };
}

function getFallbackText({ scores, issues }) {
  const criticals = issues.filter(i => i.severity === 'critical').length;
  const vals = Object.values(scores).filter(v => v != null);
  const avg  = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

  if (avg === null) return 'Analysis complete. Review the issues below for recommendations.';
  if (avg >= 80) return `Your site is performing well with an average score of ${avg}/100${criticals > 0 ? `, though ${criticals} critical issue${criticals > 1 ? 's' : ''} need${criticals === 1 ? 's' : ''} attention` : ''}. Review the details below to push your scores higher.`;
  if (avg >= 60) return `Your site scores ${avg}/100 on average — solid in some areas but with room to improve${criticals > 0 ? `, including ${criticals} critical issue${criticals > 1 ? 's' : ''}` : ''}. The full report shows you exactly what to fix first.`;
  return `Your site scores ${avg}/100 on average with ${criticals} critical issue${criticals !== 1 ? 's' : ''} that could be hurting your search rankings and user experience. Fixing these should be your first priority.`;
}
