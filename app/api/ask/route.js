import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReportBySlug, getRecommendationsByReport, reserveAskSlot } from '@/lib/store';
import { buildScoreLines } from '@/lib/scoring';
import { estimateCost } from '@/lib/ai-cost';

// POST /api/ask
// Body: { question, reportId, messages?, findingFingerprintId?, recFingerprint?, activeStep?, elementContext? }
// Returns: { answer }
export async function POST(request) {
  // ── Correlation ID ────────────────────────────────────────────────────────
  // Every log line in this handler is tagged with reqId so a single failed
  // request can be traced end-to-end in production logs.
  // Search server logs for "[Ask API] [<reqId>]" to follow a request.
  const reqId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Authentication required — unauthenticated callers cannot trigger AI calls.
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // ── Ask usage ceiling (all plans) ────────────────────────────────────────────
  // Atomic quota reservation: increment the counter first, then check whether
  // the new value exceeds the ceiling.  Both steps happen in a single DB
  // round-trip (INSERT … ON CONFLICT DO UPDATE … RETURNING), eliminating the
  // race window that existed between a pre-flight read and a post-success write.
  //
  // Failed AI calls are NOT refunded — the slot is consumed on reservation.
  // This prevents unlimited free retries from hammering the Anthropic API.
  //
  // BYPASS_SCAN_LIMIT=true skips enforcement for dev/test; must never be set
  // in production.
  const bypassAskLimit = process.env.BYPASS_SCAN_LIMIT === 'true';
  let askSlotReserved = false;
  if (!bypassAskLimit) {
    let reservation;
    try {
      reservation = await reserveAskSlot(userId);
    } catch (e) {
      // DB unavailable — fail open (don't block the user) but log loudly
      console.error(`[Ask API] [${reqId}] reserveAskSlot DB error — proceeding without quota check: ${e.message}`);
      reservation = null;
    }
    if (reservation && !reservation.allowed) {
      console.warn(
        `[Ask API] [${reqId}] ask_limit_reached userId=${userId} ` +
        `count=${reservation.count} limit=${reservation.limit}`
      );
      return NextResponse.json(
        {
          error: 'ask_limit_reached',
          message: `You've reached the ${reservation.limit} Ask Cernly requests allowed this month.`,
          used: reservation.count,
          limit: reservation.limit,
        },
        { status: 429 }
      );
    }
    askSlotReserved = true;
    console.log(
      `[Ask API] [${reqId}] ask_slot_reserved count=${reservation?.count ?? '?'}/${reservation?.limit ?? '?'}`
    );
  }
  // ── End Ask usage ceiling ────────────────────────────────────────────────────

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[Ask API] [${reqId}] ANTHROPIC_API_KEY not configured — aborting`);
    return NextResponse.json({ answer: "AI assistant isn't available right now — API key not configured." });
  }

  let body = {};
  try { body = await request.json(); } catch {}

  const {
    question,
    reportId,
    messages      = [],
    findingFingerprintId,
    recFingerprint,
    activeStep,
    elementContext,
  } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: 'question required' }, { status: 400 });
  }

  console.log(
    `[Ask API] [${reqId}] request ` +
    `reportId=${reportId || 'none'} ` +
    `findingFingerprintId=${findingFingerprintId || 'none'} ` +
    `recFingerprint=${recFingerprint || 'none'} ` +
    `questionLen=${question.trim().length}`
  );

  // ── Build report context ──────────────────────────────────────────────────
  let reportContext = '';
  let effectiveRecFingerprint = recFingerprint || null; // may be overridden below
  let contextStage = 'init';

  if (reportId) {
    try {
      contextStage = 'getReport';
      // reportId is the URL slug (UUID string) — use getReportBySlug, not getReport,
      // which queries by integer PK and would throw "invalid input syntax for integer"
      // when given a slug, causing the catch block to swallow all context silently.
      const report = await getReportBySlug(reportId);

      if (!report) {
        console.warn(`[Ask API] [${reqId}] getReport(${reportId}) returned null — proceeding without site context`);
      } else {
        // CRITICAL: getReport() only returns the reports row (no recommendations).
        // Fetch recommendations separately so focusRecBlock / recsBlock work.
        contextStage = 'getRecommendationsByReport';
        try {
          const recs = await getRecommendationsByReport(report.id);
          report.recommendations = recs || [];
          console.log(`[Ask API] [${reqId}] fetched ${report.recommendations.length} recommendations`);
        } catch (recErr) {
          console.error(`[Ask API] [${reqId}] getRecommendationsByReport failed: ${recErr.message}`);
          report.recommendations = [];
        }

        contextStage = 'buildContext';
        const domain = (() => { try { return new URL(report.url).hostname; } catch { return report.url; } })();
        const scoreLines = buildScoreLines(report.scores || {}, report.auditStatuses || {});
        const allIssues  = report.issues || [];

        // Surface the specific finding the chip was clicked on
        const focusIssue = findingFingerprintId
          ? allIssues.find(i => i.fingerprintId === findingFingerprintId)
          : null;

        // Auto-resolve recFingerprint from findingFingerprintId when the client
        // didn't (or couldn't) send one — e.g. matchedRec was null client-side.
        if (!effectiveRecFingerprint && findingFingerprintId) {
          const autoRec = (report.recommendations || []).find(r =>
            Array.isArray(r.finding_fingerprints) &&
            r.finding_fingerprints.includes(findingFingerprintId)
          );
          if (autoRec?.fingerprint) {
            effectiveRecFingerprint = autoRec.fingerprint;
            console.log(`[Ask API] [${reqId}] auto-resolved recFingerprint=${effectiveRecFingerprint} from findingFingerprintId`);
          }
        }

        console.log(
          `[Ask API] [${reqId}] context built ` +
          `issues=${allIssues.length} ` +
          `recs=${report.recommendations.length} ` +
          `effectiveRecFingerprint=${effectiveRecFingerprint || 'none'} ` +
          `assessmentStatus=${report.assessmentStatus || 'none'}`
        );

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

        // Assessment context
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

        // Top recommendations
        let recsBlock = '';
        const topRecs = (report.recommendations || []).slice(0, 6);
        if (topRecs.length > 0) {
          const recLines = topRecs.map((r, i) => {
            const why = r.why_it_matters || r.what_we_found || r.explanation || '';
            return `  ${i + 1}. [${r.priority || 'medium'}/${r.category || 'general'}] ${r.title}${why ? ': ' + why.slice(0, 120) : ''}`;
          }).join('\n');
          recsBlock = `\nKEY RECOMMENDATIONS (${topRecs.length} of ${(report.recommendations || []).length} total):\n${recLines}`;
        }

        // Focused recommendation block — full evidence for the clicked chip
        let focusRecBlock = '';
        if (effectiveRecFingerprint) {
          const focusRec = (report.recommendations || []).find(r => r.fingerprint === effectiveRecFingerprint);
          if (focusRec) {
            const findingLines = (focusRec.supporting_findings || []).slice(0, 8).map(f => {
              const dv   = f.displayValue ? ` (${f.displayValue})` : '';
              const desc = f.description ? ' — ' + f.description.slice(0, 80) : '';
              const itemNote = f.items?.length
                ? ' [affected: ' + f.items.slice(0, 5).map(it => {
                    const name = it.label || (it.url ? it.url.split('/').pop().split('?')[0] || it.url : '');
                    const ms   = it.wastedMs != null ? `${it.wastedMs}ms wasted` : '';
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
          } else {
            console.warn(`[Ask API] [${reqId}] effectiveRecFingerprint=${effectiveRecFingerprint} not found in ${report.recommendations.length} recs`);
          }
        }

        // Active guided fix step context
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

        // Element-specific context
        let elementBlock = '';
        if (elementContext && typeof elementContext === 'object') {
          const el = elementContext;
          const elLines = [
            el.label    ? `  Filename/label: ${el.label}` : '',
            el.url      ? `  URL: ${el.url}` : '',
            el.selector ? `  Selector: ${el.selector}` : '',
            el.snippet  ? `  HTML: ${el.snippet.slice(0, 300)}` : '',
            el.wastedMs != null ? `  Wasted: ${el.wastedMs}ms` : '',
          ].filter(Boolean).join('\n');
          if (elLines) {
            elementBlock = `\nFOCUS ELEMENT (the user is asking about this specific item):\n${elLines}\n`;
          }
        }

        reportContext = `
SITE CONTEXT:
Domain: ${domain}
Scores: ${scoreLines}
Key issues:
${issueLines || 'None found'}
${focusBlock}${elementBlock}${focusRecBlock}${stepBlock}${assessmentBlock}${recsBlock}${!assessmentBlock && report.aiSummary ? `\nAI Summary: ${report.aiSummary}` : ''}
`;
      }
    } catch (contextErr) {
      // Surface DB and context-build failures — previously these were swallowed silently.
      console.error(`[Ask API] [${reqId}] Context build failed at stage=${contextStage}: ${contextErr.message}`);
      // Continue without context rather than returning an error to the user.
    }
  }

  const hasFocusContext = !!(effectiveRecFingerprint || findingFingerprintId || elementContext);
  let systemPrompt = `You are Cernly AI, a helpful web performance and SEO assistant embedded in a website audit report. You have access to this site's structured assessment, recommendations, and audit data.

Be concise, practical, and friendly. Use plain English. When explaining a fix, give specific actionable steps — not generic advice. Keep answers under 250 words unless the question needs more detail. Refer to the site's actual findings and priorities rather than giving generic advice.${hasFocusContext ? `

When RECOMMENDATION IN FOCUS, FOCUS FINDING, or FOCUS ELEMENT is present in the context, answer specifically about that finding or recommendation. Stay grounded in its supporting evidence and do not drift to other recommendations.` : ` When the assessment identifies a top opportunity, treat it as the established priority unless the user asks about something else specifically.`}${reportContext ? `\n${reportContext}` : ''}`;

  // Guard against very large system prompts — Haiku handles them but long prompts
  // can cause empty responses near the context limit.
  const SYSTEM_PROMPT_CHAR_LIMIT = 12000;
  const originalPromptLength = systemPrompt.length;
  if (originalPromptLength > SYSTEM_PROMPT_CHAR_LIMIT) {
    systemPrompt = systemPrompt.slice(0, SYSTEM_PROMPT_CHAR_LIMIT) + '\n[context trimmed for length]';
    console.warn(`[Ask API] [${reqId}] System prompt trimmed from ${originalPromptLength} → ${systemPrompt.length} chars`);
  } else {
    console.log(`[Ask API] [${reqId}] System prompt ${originalPromptLength} chars (within limit)`);
  }

  // Convert prior messages to Anthropic format
  const priorMessages = messages.slice(-6).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  // ── Model preference order ─────────────────────────────────────────────────
  // Try the newest Haiku first; fall back to confirmed-valid older model IDs.
  // Each model is tried in turn unless the error is non-retriable (auth/key error).
  //
  // Retryable across models: 400 (model not found), 404, 429 (rate limit),
  //   503 (Service Unavailable), 529 (Anthropic overloaded)
  // Non-retriable (same API key will fail on any model): 401 (invalid key),
  //   403 (permissions), other unexpected 4xx
  const MODEL_PREFERENCE = [
    'claude-haiku-5-5',           // Claude Haiku 5.5 — try first; 400/404 if key lacks access
    'claude-3-5-haiku-20241022',  // Claude 3.5 Haiku — known-valid, widely accessible
    'claude-3-haiku-20240307',    // Claude 3 Haiku — final fallback
  ];

  // Statuses that are transient — worth trying the next model in the list.
  // 400/404 mean model unavailable for this key; 429/503/529 are server-side load issues.
  const RETRIABLE_STATUSES = new Set([400, 404, 429, 503, 529]);

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
        max_tokens: 600,
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
    let lastErr  = '';
    let lastStatus = null;

    for (const model of MODEL_PREFERENCE) {
      try {
        console.log(`[Ask API] [${reqId}] trying model=${model}`);
        const res = await tryModel(model);
        lastStatus = res.status;

        if (res.ok) {
          const data = await res.json();
          const text = data.content?.[0]?.text?.trim();
          if (text) {
            // ── Token instrumentation ─────────────────────────────────────────
            // Cost estimate uses the rate for the actual model that responded.
            // Rates are approximate and for monitoring only — not billing records.
            const inTok  = data.usage?.input_tokens  ?? null;
            const outTok = data.usage?.output_tokens ?? null;
            const costInfo = estimateCost(model, inTok, outTok);
            if (costInfo?.rateSource === 'unknown') {
              console.warn(`[Ask API] [${reqId}] unknown model in rate table: ${costInfo.model} — tokens logged, cost omitted`);
            }
            const estCostUsd = costInfo?.est_cost_usd_estimate ?? null;
            console.log(
              `[Ask API] [${reqId}] ai_success model=${model} ` +
              `answerLen=${text.length} ` +
              `input_tokens=${inTok ?? 'unknown'} ` +
              `output_tokens=${outTok ?? 'unknown'}` +
              (estCostUsd != null ? ` est_cost_usd_estimate=${estCostUsd}` : '') +
              (askSlotReserved ? ' quota_slot=consumed' : ' quota_slot=bypassed')
            );
            // Quota slot was already consumed atomically by reserveAskSlot() above.
            // No further counter write needed here.
            return NextResponse.json({ answer: text });
          }
          // 200 OK but empty content — log full response for diagnosis
          const stopReason = data.stop_reason || 'unknown';
          console.error(
            `[Ask API] [${reqId}] empty content from model=${model} ` +
            `stop_reason=${stopReason} ` +
            `response=${JSON.stringify(data).slice(0, 500)}`
          );
          lastErr = `model ${model} returned empty content (stop_reason=${stopReason})`;
          continue; // try next model
        }

        // Non-200 — read the error body for diagnosis
        const errBody = await res.text().catch(() => '');
        let errType = '';
        try {
          const parsed = JSON.parse(errBody);
          errType = parsed?.error?.type || parsed?.type || '';
        } catch {}

        console.error(
          `[Ask API] [${reqId}] model=${model} status=${res.status} ` +
          `errorType=${errType || 'unknown'} ` +
          `body=${errBody.slice(0, 300)}`
        );

        if (RETRIABLE_STATUSES.has(res.status)) {
          // Model unavailable, rate-limited, or server-side overload — try next
          lastErr = `${res.status} (${errType || 'retriable'}) from ${model}`;
          continue;
        }

        // 401 (invalid key), 403 (permissions), or unexpected 4xx — the same key
        // will fail on every model, so stop the loop immediately.
        console.error(
          `[Ask API] [${reqId}] non-retriable error status=${res.status} on model=${model} — aborting loop`
        );
        return NextResponse.json({
          answer: 'Something went wrong — please try again.',
          _debug: { reqId, stage: 'anthropic_error', status: res.status, errorType: errType },
        });

      } catch (modelErr) {
        lastErr = modelErr.message;
        if (modelErr.name === 'TimeoutError') {
          console.error(`[Ask API] [${reqId}] timeout on model=${model} after 25s`);
          // Timeout is model-specific; try remaining models before giving up
          continue;
        }
        console.error(`[Ask API] [${reqId}] fetch error on model=${model}: ${modelErr.message}`);
        // Network-level error — try next model
      }
    }

    // All models exhausted
    console.error(
      `[Ask API] [${reqId}] all models failed ` +
      `lastErr=${lastErr} ` +
      `lastStatus=${lastStatus}`
    );
    return NextResponse.json({
      answer: 'Something went wrong — please try again.',
      _debug: { reqId, stage: 'all_models_failed', lastErr, lastStatus },
    });

  } catch (e) {
    console.error(`[Ask API] [${reqId}] unexpected outer error: ${e.message}`);
    return NextResponse.json({
      answer: 'Something went wrong — please try again.',
      _debug: { reqId, stage: 'unexpected_error', error: e.message },
    });
  }
}
