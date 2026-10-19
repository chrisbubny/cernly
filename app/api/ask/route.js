import { NextResponse } from 'next/server';
import { getReport } from '@/lib/store';
import { buildScoreLines } from '@/lib/scoring';

// POST /api/ask
// Body: { question, reportId, messages?, findingFingerprintId? }
// Returns: { answer }
export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ answer: "AI assistant isn't available right now — API key not configured." });
  }

  let body = {};
  try { body = await request.json(); } catch {}

  const { question, reportId, messages = [], findingFingerprintId } = body;
  if (!question?.trim()) {
    return NextResponse.json({ error: 'question required' }, { status: 400 });
  }

  // Build report context
  let reportContext = '';
  if (reportId) {
    try {
      const report = await getReport(reportId);
      if (report) {
        const domain = (() => { try { return new URL(report.url).hostname; } catch { return report.url; } })();
        // buildScoreLines uses normalizeScores — safe against auditStatuses contamination
        const scoreLines = buildScoreLines(report.scores || {}, report.auditStatuses || {});

        const allIssues = report.issues || [];

        // If caller passes a fingerprintId, surface that specific finding first
        // so the AI has full context for targeted questions.
        const focusIssue = findingFingerprintId
          ? allIssues.find(i => i.fingerprintId === findingFingerprintId)
          : null;

        const issueLines = allIssues
          .filter(i => i.severity === 'critical' || i.severity === 'warning')
          .slice(0, 10)
          .map(i => {
            const id = i.fingerprintId ? ` [id:${i.fingerprintId}]` : '';
            return `[${i.severity.toUpperCase()}]${id} ${i.area}: ${i.message}${i.description ? ' — ' + i.description.slice(0, 120) : ''}`;
          })
          .join('\n');

        const focusBlock = focusIssue
          ? `\nFOCUS FINDING [${focusIssue.fingerprintId}]:
Area: ${focusIssue.area}
Message: ${focusIssue.message}
${focusIssue.description ? 'Description: ' + focusIssue.description : ''}
${focusIssue.fix ? 'Recommended fix: ' + focusIssue.fix : ''}
`
          : '';

        reportContext = `
SITE CONTEXT:
Domain: ${domain}
Scores: ${scoreLines}
Key issues:
${issueLines || 'None found'}
${focusBlock}${report.aiSummary ? `\nAI Summary: ${report.aiSummary}` : ''}
`;
      }
    } catch {}
  }

  const systemPrompt = `You are Cernly AI, a helpful web performance and SEO assistant embedded in a website audit report. You have access to this site's audit data and help website owners understand their results and fix issues.

Be concise, practical, and friendly. Use plain English. When explaining a fix, give specific actionable steps — not generic advice. Keep answers under 150 words unless the question needs more detail.${reportContext ? `\n${reportContext}` : ''}`;

  // Convert prior messages to Anthropic format
  const priorMessages = messages.slice(-6).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

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
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          ...priorMessages,
          { role: 'user', content: question },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) {
      const data = await res.json();
      const answer = data.content?.[0]?.text?.trim() || 'Sorry, I couldn\'t generate a response.';
      return NextResponse.json({ answer });
    }

    const errText = await res.text().catch(() => '');
    console.error('[Ask API]', res.status, errText);
    return NextResponse.json({ answer: 'Something went wrong — please try again.' });
  } catch (e) {
    console.error('[Ask API]', e.message);
    return NextResponse.json({ answer: 'Something went wrong — please try again.' });
  }
}
