import { NextResponse } from 'next/server';
import { getReport } from '@/lib/store';
import { buildScoreLines } from '@/lib/scoring';

// POST /api/ask
// Body: { question, reportId, messages?, findingFingerprintId?, recFingerprint?, activeStep? }
// Returns: { answer }
export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ answer: "AI assistant isn't available right now — API key not configured." });
  }

  let body = {};
  try { body = await request.json(); } catch {}

  const { question, reportId, messages = [], findingFingerprintId, recFingerprint, activeStep } = body;
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

        // Assessment context — structured website-level interpretation from Stage 2
        let assessmentBlock = '';
        if (report.assessmentStatus === 'completed' && report.assessment) {
          const a = report.assessment;
          const strengths = (a.strengths || []).slice(0, 3).map(s => `  - ${s.finding}${s.impact ? ` (${s.impact})` : ''}`).join('\n');
          const concerns  = (a.concerns  || []).slice(0, 3).map(c => `  - ${c.finding}${c.impact ? ` (${c.impact})` : ''}`).join('\n');
          const nextSteps = (a.next_steps || []).slice(0, 3).join('; ');
          const auditRan  = (a.coverage?.audits_ran    || []).join(', ') || 'unknown';
          const auditFail = (a.coverage?.audits_failed || []).join(', ');
          assessmentBlock = `
WEBSITE ASSESSMENT:
Headline: ${a.headline}
Summary: ${a.summary}
${a.top_opportunity ? `Top Opportunity: ${a.top_opportunity.title} — ${a.top_opportunity.rationale}` : 'Top Opportunity: none identified'}
What's working:
${strengths || '  (none noted)'}
What's holding it back:
${concerns || '  (none noted)'}
Recommended next steps: ${nextSteps || 'none'}
Confidence: ${a.confidence?.level || 'unknown'} — ${a.confidence?.explanation || ''}
Audit coverage: ran [${auditRan}]${auditFail ? `, failed [${auditFail}]` : ''}
${a.coverage?.limitations && !a.coverage.limitations.match(/^no significant/i) ? `Limitations: ${a.coverage.limitations}` : ''}`;
        }

        // Top recommendations — gives the AI full context for targeted questions
        let recsBlock = '';
        const topRecs = (report.recommendations || []).slice(0, 6);
        if (topRecs.length > 0) {
          const recLines = topRecs.map((r, i) => {
            const why = r.why_it_matters || r.what_we_found || r.explanation || '';
            return `  ${i + 1}. [${r.priority || 'medium'}/${r.category || 'general'}] ${r.title}${why ? ': ' + why.slice(0, 120) : ''}`;
          }).join('\n');
          recsBlock = `\nKEY RECOMMENDATIONS (${topRecs.length} of ${(report.recommendations || []).length} total):\n${recLines}`;
        }

        // Active guided fix step context — wires Ask Cernly to the specific
        // recommendation and step the user is currently working on.
        let stepBlock = '';
        if (recFingerprint && activeStep) {
          const activeRec = (report.recommendations || []).find(r => r.fingerprint === recFingerprint);
          stepBlock = `
ACTIVE GUIDED FIX:
Recommendation: ${activeRec?.title || recFingerprint}
Current step: "${activeStep.title}"
Step guidance: ${activeStep.owner?.action || activeStep.developer?.action || ''}
${activeStep.developer?.tooling ? `Tooling: ${activeStep.developer.tooling}` : ''}
${activeStep.developer?.notes ? `Notes: ${activeStep.developer.notes}` : ''}
`;
        }

        reportContext = `
SITE CONTEXT:
Domain: ${domain}
Scores: ${scoreLines}
Key issues:
${issueLines || 'None found'}
${focusBlock}${stepBlock}${assessmentBlock}${recsBlock}${!assessmentBlock && report.aiSummary ? `\nAI Summary: ${report.aiSummary}` : ''}
`;
      }
    } catch {}
  }

  const systemPrompt = `You are Cernly AI, a helpful web performance and SEO assistant embedded in a website audit report. You have access to this site's structured assessment, recommendations, and audit data.

Be concise, practical, and friendly. Use plain English. When explaining a fix, give specific actionable steps — not generic advice. Keep answers under 150 words unless the question needs more detail. Refer to the site's actual findings and priorities rather than giving generic advice. When the assessment identifies a top opportunity, treat it as the established priority unless the user asks about something else specifically.${reportContext ? `\n${reportContext}` : ''}`;

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
        model: 'claude-haiku-5-5',
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
