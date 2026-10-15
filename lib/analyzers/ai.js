// AI summary generator — uses Claude to produce a plain-English analysis

export async function runAiSummary({ url, scores, issues }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return getFallbackSummary({ scores, issues });

  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount  = issues.filter(i => i.severity === 'warning').length;

  const scoreLines = Object.entries(scores)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${v}/100`)
    .join(' | ');

  const topIssues = issues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 5)
    .map(i => `[${i.severity.toUpperCase()}] ${i.area}: ${i.message}`)
    .join('\n');

  const prompt = `You are a friendly website consultant. Write a 2-3 sentence summary of this website's health for a non-technical owner.

SITE: ${domain}
SCORES: ${scoreLines}
KEY ISSUES (${criticalCount} critical, ${warningCount} warnings):
${topIssues || 'None found'}

Rules:
- Use specific numbers from the scores
- Name 1-2 of the most important issues in plain English
- End with one clear action they should take first
- Warm, direct, professional tone — not alarming
- DO NOT use technical jargon without explanation
- Keep it under 60 words`;

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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      return data.content?.[0]?.text?.trim() || getFallbackSummary({ scores, issues });
    }
  } catch (e) {
    console.error('[AI Summary]', e.message);
  }

  return getFallbackSummary({ scores, issues });
}

function getFallbackSummary({ scores, issues }) {
  const criticals = issues.filter(i => i.severity === 'critical').length;
  const avg = Object.values(scores).filter(v => v != null);
  const avgScore = avg.length ? Math.round(avg.reduce((a, b) => a + b, 0) / avg.length) : null;

  if (avgScore === null) return 'Analysis complete. Review the issues below for recommendations.';

  if (avgScore >= 80) {
    return `Your site is performing well with an average score of ${avgScore}/100${criticals > 0 ? `, though ${criticals} critical issue${criticals > 1 ? 's' : ''} need${criticals === 1 ? 's' : ''} attention` : ''}. Review the details below to push your scores higher.`;
  }
  if (avgScore >= 60) {
    return `Your site scores ${avgScore}/100 on average — solid in some areas but with room to improve${criticals > 0 ? `, including ${criticals} critical issue${criticals > 1 ? 's' : ''}` : ''}. The full report shows you exactly what to fix first.`;
  }
  return `Your site scores ${avgScore}/100 on average with ${criticals} critical issue${criticals !== 1 ? 's' : ''} that could be hurting your search rankings and user experience. Fixing these should be your first priority.`;
}
