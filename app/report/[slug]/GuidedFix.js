'use client';

/**
 * GuidedFix.js — Guided improvement panel for a single recommendation group.
 *
 * PoC scope: image-optimization. Infrastructure is group-agnostic.
 *
 * UX flow (per approved PoC architecture):
 * 1. Panel opens beside the recommendation card (no navigation away)
 * 2. Evidence summary shown at top — specific measured values from scan
 * 3. Role selector (owner / developer) — remembered across sessions
 * 4. Step-by-step display with role-appropriate instructions
 * 5. Mark-done per step, persisted to guide_progress via PATCH /api/work-items
 * 6. Inline "Ask Cernly" pre-seeded with step context
 * 7. "I've deployed — run a scan" triggers user_status: 'verify'
 */

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const FONT = 'var(--font-manrope, Manrope, sans-serif)';
const PURPLE = '#7948f6';
const BLUE   = '#3687fa';
const GREEN  = '#19b987';
const AMBER  = '#efa642';
const RED    = '#ef6473';
const BG     = '#f4f5fb';
const SURFACE = '#fff';
const BORDER = '#e9eaf2';
const TEXT   = '#151621';
const MUTED  = '#83899c';
const GRAD   = 'linear-gradient(135deg,#8a46f8,#3687fa)';

const STEP_STATES = {
  not_started: { label: 'Not started', color: MUTED },
  in_progress: { label: 'In progress', color: AMBER },
  marked_done: { label: 'Done',        color: GREEN },
};

function confidenceBadge(confidence) {
  const map = {
    high:   { label: 'High confidence',   bg: '#e8faf4', color: '#19b987', dot: GREEN },
    medium: { label: 'Medium confidence', bg: '#fff6e5', color: '#c97e0a', dot: AMBER },
    low:    { label: 'Low confidence',    bg: '#fef2f2', color: '#b91c1c', dot: RED },
  };
  return map[confidence] || map.low;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: '32px 0' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: `3px solid ${BORDER}`,
        borderTopColor: PURPLE,
        animation: 'spin .7s linear infinite',
      }} />
      <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT }}>
        Generating your personalized plan…
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step component
// ---------------------------------------------------------------------------
function GuidedStep({ step, stepIndex, total, role, stepState, onMarkDone, onAskCernly }) {
  const [expanded, setExpanded] = useState(true);
  const isDone = stepState === 'marked_done';
  const content = role === 'developer' ? step.developer : step.owner;

  return (
    <div style={{
      border: `1.5px solid ${isDone ? '#c7ede0' : BORDER}`,
      borderRadius: 12,
      background: isDone ? '#f0faf7' : SURFACE,
      overflow: 'hidden',
      transition: 'all .15s',
    }}>
      {/* Step header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
          cursor: 'pointer', userSelect: 'none' }}
      >
        {/* Step number / done indicator */}
        <div style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: isDone ? GREEN : '#f0ecff',
          display: 'grid', placeItems: 'center',
        }}>
          {isDone
            ? <CheckIcon size={12} color="#fff" />
            : <span style={{ fontSize: 11, fontWeight: 800, color: PURPLE }}>{stepIndex + 1}</span>
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TEXT,
            textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>
            {step.title}
          </div>
          {!expanded && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              {STEP_STATES[stepState]?.label || 'Not started'}
            </div>
          )}
        </div>

        <ChevronIcon size={14} color={MUTED} down={expanded} />
      </div>

      {/* Step body */}
      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {/* Main action */}
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, marginBottom: 10 }}>
            {content?.action}
          </div>

          {/* Delegation hint (owner only) */}
          {role === 'owner' && content?.delegation && (
            <div style={{ background: '#f8f5ff', borderRadius: 8, padding: '8px 12px',
              fontSize: 12, color: '#5b3da3', lineHeight: 1.5, marginBottom: 10 }}>
              <strong>To hand off:</strong> {content.delegation}
            </div>
          )}

          {/* Tooling (developer only) */}
          {role === 'developer' && content?.tooling && (
            <div style={{ background: '#f4f5fb', borderRadius: 8, padding: '8px 12px',
              fontFamily: 'monospace', fontSize: 12, color: '#3687fa',
              lineHeight: 1.5, marginBottom: 10, wordBreak: 'break-all' }}>
              {content.tooling}
            </div>
          )}

          {/* Developer notes */}
          {role === 'developer' && content?.notes && (
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginBottom: 10 }}>
              {content.notes}
            </div>
          )}

          {/* Why */}
          {content?.why && (
            <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginBottom: 12 }}>
              <em>{content.why}</em>
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {!isDone && (
              <button onClick={onMarkDone}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: GRAD, color: '#fff', border: 0, borderRadius: 8,
                  padding: '7px 14px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: FONT }}>
                <CheckIcon size={11} color="#fff" /> Mark done
              </button>
            )}
            <button onClick={onAskCernly}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'transparent', color: PURPLE,
                border: `1.5px solid #c9bcf7`, borderRadius: 8,
                padding: '6px 12px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: FONT }}>
              <span style={{ fontSize: 12 }}>✦</span> Ask Cernly
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fallback guide (uses actions[] when AI generation fails)
// ---------------------------------------------------------------------------
function FallbackGuide({ actions, rec, onAskCernly }) {
  return (
    <div>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
        padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 16, lineHeight: 1.5 }}>
        <strong>Basic guidance</strong> — we couldn't generate a personalized plan right now.
        Here are the recommended actions from your scan.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((action, i) => (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 10,
            padding: '12px 14px', background: SURFACE }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TEXT,
              marginBottom: action.description ? 6 : 0 }}>
              {action.title}
            </div>
            {action.description && (
              <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.55 }}>
                {action.description}
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onAskCernly}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
          background: 'transparent', color: PURPLE, border: `1.5px solid #c9bcf7`,
          borderRadius: 9, padding: '8px 14px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: FONT }}>
        <span style={{ fontSize: 12 }}>✦</span> Ask Cernly for help
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Props:
 *   rec           — recommendation object from report (has fingerprint, title, evidence, actions, etc.)
 *   reportId      — string
 *   pageUrl       — string (current page URL, for work-item scope key)
 *   workItem      — current work item DB row (may be null)
 *   onClose       — () => void
 *   onStatusChange — (recFp, newStatus) => void
 *   onAskCernly   — ({ title, category, detail, step? }) => void
 */
export default function GuidedFix({
  rec,
  reportId,
  pageUrl,
  workItem,
  onClose,
  onStatusChange,
  onAskCernly,
}) {
  const recFp   = rec?.fingerprint || '';
  const evidence = rec?.evidence   || {};

  // ------ state ------
  const [plan,        setPlan]        = useState(null);
  const [fallback,    setFallback]    = useState(false);
  const [fallbackActs, setFallbackActs] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [role,        setRole]        = useState('owner'); // 'owner' | 'developer'
  const [progress,    setProgress]    = useState({});     // stepId → stepState
  const [planFp,      setPlanFp]      = useState(null);
  const [allDone,     setAllDone]     = useState(false);
  const [deployedSent, setDeployedSent] = useState(false);

  // Restore progress from workItem.guideProgress
  useEffect(() => {
    const gp = workItem?.guideProgress;
    if (gp) {
      if (gp.guidanceLevel) setRole(gp.guidanceLevel);
      if (gp.stepProgress)  setProgress(gp.stepProgress);
      if (gp.planFingerprint) setPlanFp(gp.planFingerprint);
      if (gp.workMarkedComplete) setAllDone(true);
    }
  }, [workItem]);

  // Fetch or generate plan
  useEffect(() => {
    if (!recFp || !reportId) { setLoading(false); return; }

    fetch('/api/guide-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recFingerprint: recFp, reportId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.plan) {
          setPlan(data.plan);
          setPlanFp(data.plan.planFingerprint);
          // Stale progress: keep steps whose IDs exist in the new plan
          if (planFp && planFp !== data.plan.planFingerprint) {
            const validIds = new Set((data.plan.steps || []).map(s => s.id));
            setProgress(prev => {
              const next = {};
              for (const [id, state] of Object.entries(prev)) {
                if (validIds.has(id)) next[id] = state;
              }
              return next;
            });
          }
        } else if (data.fallback) {
          setFallback(true);
          setFallbackActs(data.actions || rec?.actions || []);
        }
      })
      .catch(() => {
        setFallback(true);
        setFallbackActs(rec?.actions || []);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recFp, reportId]);

  // Persist progress patch
  const persistProgress = useCallback(async (nextProgress, nextRole, nextAllDone) => {
    if (!recFp || !pageUrl) return;
    const guideProgress = {
      planFingerprint:    planFp || plan?.planFingerprint,
      guidanceLevel:      nextRole   !== undefined ? nextRole   : role,
      stepProgress:       nextProgress !== undefined ? nextProgress : progress,
      workMarkedComplete: nextAllDone !== undefined ? nextAllDone : allDone,
      lastStepAt:         new Date().toISOString(),
    };
    try {
      await fetch('/api/work-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recFingerprint: recFp, pageUrl, guideProgress }),
      });
    } catch {}
  }, [recFp, pageUrl, planFp, plan, role, progress, allDone]);

  // Role selection
  function handleRoleSelect(newRole) {
    setRole(newRole);
    persistProgress(undefined, newRole, undefined);
  }

  // Mark step done
  function handleMarkDone(stepId) {
    const next = { ...progress, [stepId]: 'marked_done' };
    setProgress(next);
    // Auto-advance userStatus to in_progress on first step
    if (!workItem || workItem.userStatus === 'open') {
      onStatusChange?.(recFp, 'in_progress');
    }
    persistProgress(next, undefined, undefined);
  }

  // All steps done — show deploy prompt
  const handleWorkComplete = () => {
    setAllDone(true);
    persistProgress(undefined, undefined, true);
  };

  // User says they've deployed — request verification
  const handleDeployed = () => {
    setDeployedSent(true);
    onStatusChange?.(recFp, 'verify');
  };

  // Ask Cernly wired to current step
  function handleAskForStep(step) {
    onAskCernly?.({
      title:    `${rec?.title}: ${step.title}`,
      category: rec?.category || 'image-optimization',
      detail:   step.owner?.action || step.developer?.action || '',
      recFingerprint: recFp,
      activeStep: step,
    });
  }

  // Check all-done state from progress
  const computedAllDone = plan && plan.steps.length > 0 &&
    plan.steps.every(s => progress[s.id] === 'marked_done');

  const conf = evidence?.confidence;
  const confBadge = conf ? confidenceBadge(conf) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: '#0d102040', zIndex: 49 }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420, maxWidth: '95vw',
        background: SURFACE, borderLeft: `1px solid ${BORDER}`,
        boxShadow: '-8px 0 40px #1b1d3215',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        animation: 'slideIn .22s ease',
        fontFamily: FONT,
      }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
        `}</style>

        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: GRAD, display: 'grid', placeItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>✦</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: TEXT }}>Guided Fix</div>
            <div style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis' }}>
              {rec?.title || 'Image Optimization'}
            </div>
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer',
              padding: 6, color: MUTED, borderRadius: 6 }}
            aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Evidence summary */}
          {(evidence?.totalSavingsKib || evidence?.imageCount || evidence?.lcpImageUrl) && (
            <div style={{ background: 'linear-gradient(145deg,#f7f4ff,#eef6ff 90%)',
              border: '1px solid #e5deff', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: PURPLE,
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                What we found on your site
              </div>
              {evidence.totalSavingsKib != null && (
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
                  {evidence.totalSavingsKib} KiB of image savings available
                  {evidence.imageCount ? ` across ${evidence.imageCount} image${evidence.imageCount > 1 ? 's' : ''}` : ''}
                </div>
              )}
              {evidence.lcpImageUrl && (
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 4, wordBreak: 'break-all' }}>
                  LCP image: <code style={{ background: '#ece8ff', borderRadius: 4, padding: '1px 5px',
                    color: PURPLE, fontSize: 11 }}>{evidence.lcpImageUrl}</code>
                </div>
              )}
              {evidence.imageUrls?.length > 0 && (
                <div style={{ fontSize: 11, color: MUTED }}>
                  {evidence.imageUrls.length} affected image{evidence.imageUrls.length > 1 ? 's' : ''} identified
                </div>
              )}
              {confBadge && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
                  background: confBadge.bg, borderRadius: 6, padding: '3px 8px' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: confBadge.dot }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: confBadge.color }}>
                    {confBadge.label}
                  </span>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <Spinner />
          ) : fallback ? (
            <FallbackGuide
              actions={fallbackActs}
              rec={rec}
              onAskCernly={() => onAskCernly?.({
                title: rec?.title || 'Image Optimization',
                category: rec?.category || 'image-optimization',
                detail: rec?.what_we_found || '',
                recFingerprint: recFp,
              })}
            />
          ) : plan ? (
            <>
              {/* Evidence summary from AI */}
              {plan.evidenceSummary && (
                <div style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.6,
                  paddingBottom: 4, borderBottom: `1px solid ${BORDER}` }}>
                  {plan.evidenceSummary}
                </div>
              )}

              {/* Role selector */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED,
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Who's doing this fix?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'owner',     label: 'I manage the site',   desc: 'Less technical' },
                    { key: 'developer', label: 'I\'m the developer',  desc: 'Technical steps' },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => handleRoleSelect(opt.key)}
                      style={{
                        flex: 1, border: `2px solid ${role === opt.key ? PURPLE : BORDER}`,
                        background: role === opt.key ? '#f7f4ff' : SURFACE,
                        borderRadius: 10, padding: '9px 12px', cursor: 'pointer',
                        fontFamily: FONT, textAlign: 'left', transition: 'all .12s',
                      }}>
                      <div style={{ fontWeight: 700, fontSize: 12,
                        color: role === opt.key ? PURPLE : TEXT }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED,
                  textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Steps · {plan.steps.filter(s => progress[s.id] === 'marked_done').length}/{plan.steps.length} done
                </div>
                {plan.steps.map((step, i) => (
                  <GuidedStep
                    key={step.id}
                    step={step}
                    stepIndex={i}
                    total={plan.steps.length}
                    role={role}
                    stepState={progress[step.id] || 'not_started'}
                    onMarkDone={() => handleMarkDone(step.id)}
                    onAskCernly={() => handleAskForStep(step)}
                  />
                ))}
              </div>

              {/* All-done confirmation */}
              {(allDone || computedAllDone) && !deployedSent && (
                <div style={{ background: '#f0faf7', border: '1.5px solid #c7ede0',
                  borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#145c43', marginBottom: 6 }}>
                    You've marked all steps complete
                  </div>
                  <div style={{ fontSize: 12, color: '#1d7a56', marginBottom: 12, lineHeight: 1.5 }}>
                    Once you've deployed your changes, run a new scan to verify the fix.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleDeployed}
                      style={{ background: GREEN, color: '#fff', border: 0,
                        borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: FONT }}>
                      I've deployed — run a scan
                    </button>
                    <button onClick={() => setAllDone(false)}
                      style={{ background: 'transparent', color: MUTED,
                        border: `1.5px solid ${BORDER}`, borderRadius: 8,
                        padding: '7px 14px', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: FONT }}>
                      Not yet
                    </button>
                  </div>
                </div>
              )}

              {deployedSent && (
                <div style={{ background: '#eff8ff', border: '1.5px solid #bfdbfe',
                  borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#1e40af', marginBottom: 4 }}>
                    Verification scan requested
                  </div>
                  <div style={{ fontSize: 12, color: '#3b82f6', lineHeight: 1.5 }}>
                    We'll compare your changes against the original findings when the scan completes.
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${BORDER}`,
          flexShrink: 0, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: MUTED }}>
            Cernly AI · based on this scan
          </div>
          <button
            onClick={() => onAskCernly?.({
              title: rec?.title || 'Image Optimization',
              category: rec?.category || 'image-optimization',
              detail: rec?.what_we_found || '',
              recFingerprint: recFp,
            })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'transparent', color: PURPLE,
              border: `1.5px solid #c9bcf7`, borderRadius: 8,
              padding: '6px 12px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: FONT }}>
            <span style={{ fontSize: 12 }}>✦</span> Ask Cernly
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------
function CheckIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function ChevronIcon({ size = 14, color = 'currentColor', down = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: down ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function CloseIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
