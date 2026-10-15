// AI analysis — uses Claude to produce summary, UX score, and site type

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

  const topIssues = issues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 6)
    .map(i => `[${i.severity.toUpperCase()}] ${i.area}: ${i.message}`)
    .join('\n');

  const prompt = `You are a senior web consultant analyzing a website for its owner. Given the data below, return a JSON object with these fields:

1. "summary": 2-3 sentence plain-English health summary. Mention specific scores. Name 1-2 key issues. End with the most important action. Warm, direct, non-alarming. Under 65 words.
2. "siteType": one of: ${SITE_TYPES.join(', ')} — pick the best fit based on the domain name.
3. "uxScore": integer 0-100. Estimate UX quality based on performance, accessibility, and any UX-related issues. A fast, accessible, mobile-friendly site scores higher.
4. "uxInsights": object with:
   - "conversion_focus": short phrase describing what conversions matter for this site type (e.g. "lead generation", "product purchases", "newsletter signups")
   - "top_recommendation": single most impactful UX improvement in plain English, 1 sentence

SITE: ${domain}
SCORES: ${scoreLines}
KEY ISSUES (${criticalCount} critical, ${warningCount} warnings):
${topIssues || 'None found'}

Return ONLY valid JSON, no markdown, no explanation.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(18000),
    });

    if (res.ok) {
      const data = await res.json();
      const raw  = data.content?.[0]?.text?.trim() || '';
      // Strip markdown code fences if the model wraps its JSON output
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try {
        const parsed = JSON.parse(text);
        return {
          aiSummary:  parsed.summary || getFallbackText({ scores, issues }),
          siteType:   parsed.siteType || null,
          uxScore:    typeof parsed.uxScore === 'number' ? parsed.uxScore : null,
          uxInsights: parsed.uxInsights || null,
        };
      } catch {
        // JSON parse failed — use fallback text, never surface raw JSON/markdown
        return buildFallback({ scores, issues });
      }
    }
  } catch (e) {
    console.error('[AI Summary]', e.message);
  }

  return buildFallback({ scores, issues });
}

function buildFallback({ scores, issues }) {
  return {
    aiSummary: getFallbackText({ scores, issues }),
    siteType: null,
    uxScore: null,
    uxInsights: null,
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
