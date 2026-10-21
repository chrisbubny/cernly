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
            const dv = i.displayValue ? ` (${i.displayValue})` : '';
            return `[${i.severity.toUpperCase()}]${id} ${i.area}: ${i.message}${dv}${i.description ? ' — ' + i.description.slice(0, 80) : ''}`;
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

        // Focused recommendation context — used when a chip is clicked from
        // an Action Plan card. Gives the AI the full stored evidence for that
        // specific recommendation so it can answer grounded questions.
        let focusRecBlock = '';
        if (recFingerprint) {
          const focusRec = (report.recommendations || []).find(r => r.fingerprint === recFingerprint);
          if (focusRec) {
            const findingLines = (focusRec.supporting_findings || []).slice(0, 8).map(f => {
              const dv  = f.displayValue ? ` (${f.displayValue})` : '';
              const desc = f.description ? ' — ' + f.description.slice(0, 80) : '';
              // Surface up to 3 specific affected resources if captured.
              // Items may be resource-based (url + wastedMs) or element-based
              // (url from src extraction, label from filename or nodeLabel,
              // snippet from Lighthouse node audit details).
              const itemNote = f.items?.length
                ? ' [affected: ' + f.items.slice(0, 5).map(it => {
                    const name = it.label || (it.url ? it.url.split('/').pop().split('?')[0] || it.url : '');
                    const ms   = it.wastedMs != null ? `${it.wastedMs}ms wasted` : '';
                    // For element-based items from Lighthouse node audits
                    const loc  = it.selector ? `(${it.selector})` : '';
                    return [name, ms, loc].filter(Boolean).join(' ');
                  }).filter(Boolean).join(', ') + ']'
                : '';
              return `  - [${(f.severity || 'issue').toUpperCase()}] ${f.message}${dv}${desc}${itemNote}`;
            }).join('\n');

            const evidenceParts = focusRec.evidence
              ? Object.entries(focusRec.evidence).map(([k, v]) => `${k}: ${v}`).join(', ')
              : null;

            const actionLines = (focusRec.actions || []).slice(0, 3)
              .map(a => `  → ${a.title}: ${a.detail}`)
              .join('\n');

            focusRecBlock = `
RECOMMENDATION IN FOCUS: ${focusRec.title} [${focusRec.priority || 'medium'} priority]
${focusRec.what_we_found || focusRec.explanation ? `What we found: ${focusRec.what_we_found || focusRec.explanation}` : ''}
${focusRec.why_it_matters ? `Why it matters: ${focusRec.why_it_matters}` : ''}
${evidenceParts ? `Measured: ${evidenceParts}` : ''}
${focusRec.verification_approach ? `How to verify: ${focusRec.verification_approach}` : ''}
Supporting findings:
${findingLines || '  (see issues above)'}
${actionLines ? `Recommended actions:\n${actionLines}` : ''}
`;
          }
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
${focusBlock}${focusRecBlock}${stepBlock}${assessmentBlock}${recsBlock}${!assessmentBlock && report.aiSummary ? `\nAI Summary: ${report.aiSummary}` : ''}
`;
      }
    } catch {}
  }

  let systemPrompt = `You are Cernly AI, a helpful web performance and SEO assistant embedded in a website audit report. You have access to this site's structured assessment, recommendations, and audit data.

Be concise, practical, and friendly. Use plain English. When explaining a fix, give specific actionable steps — not generic advice. Keep answers under 150 words unless the question needs more detail. Refer to the site's actual findings and priorities rather than giving generic advice. When the assessment identifies a top opportunity, treat it as the established priority unless the user asks about something else specifically.${reportContext ? `\n${reportContext}` : ''}`;

  // Guard: Haiku has a ~200K token context window but very large system prompts
  // (assessments + recommendations + full rec focus block) can approach practical
  // limits and cause empty responses. Trim to ~12 000 chars (~3 000 tokens) if
  // needed — that covers all critical context with room for the conversation.
  const SYSTEM_PROMPT_CHAR_LIMIT = 12000;
  if (systemPrompt.length > SYSTEM_PROMPT_CHAR_LIMIT) {
    systemPrompt = systemPrompt.slice(0, SYSTEM_PROMPT_CHAR_LIMIT) + '\n[context trimmed for length]';
    console.warn('[Ask API] System prompt trimmed from', systemPrompt.length, 'chars');
  }

  // Convert prior messages to Anthropic format
  const priorMessages = messages.slice(-6).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  // Model preference order — try the latest Haiku first, fall back to a known-
  // good model if the API key doesn't have access to the newest generation.
  const MODEL_PREFERENCE = ['claude-haiku-5-5', 'claude-3-5-haiku-20241022', 'claude-haiku-3-5'];

  async function tryModel(model) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          ...priorMessages,
          { role: 'user', content: question },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    return res;
  }

  try {
    let res = null;
    let lastErr = '';

    for (const model of MODEL_PREFERENCE) {
      try {
        res = await tryModel(model);
        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text?.trim();
          if (text) {
            return NextResponse.json({ answer: text });
          }
          // 200 but empty content — log the full response for diagnosis
          console.error('[Ask API] Empty content from', model, '— response:', JSON.stringify(data).slice(0, 500));
          lastErr = `model ${model} returned empty content`;
          continue; // try next model
        }
        // Non-200 — check if it's a model-not-found error (try next) vs a real error
        const errBody = await res.text().catch(() => '');
        console.error('[Ask API]', model, res.status, errBody.slice(0, 300));
        if (res.status === 400 || res.status === 404) {
          // Likely model unavailable — try next
          lastErr = `${res.status} from ${model}: ${errBody.slice(0, 100)}`;
          continue;
        }
        // Rate limit, auth error, etc — no point trying another model
        return NextResponse.json({ answer: 'Something went wrong — please try again.' });
      } catch (modelErr) {
        lastErr = modelErr.message;
        if (modelErr.name === 'TimeoutError') {
          // Don't retry on timeout — next model would likely time out too
          console.error('[Ask API] Timeout on', model);
          return NextResponse.json({ answer: 'The assistant took too long to respond — please try again.' });
        }
        console.error('[Ask API] Error on', model, ':', modelErr.message);
        // Network error — try next model
      }
    }

    console.error('[Ask API] All models failed. Last error:', lastErr);
    return NextResponse.json({ answer: 'Something went wrong — please try again.' });
  } catch (e) {
    console.error('[Ask API] Unexpected error:', e.message);
    return NextResponse.json({ answer: 'Something went wrong — please try again.' });
  }
}
