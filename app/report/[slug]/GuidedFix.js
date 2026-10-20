'use client';

/**
 * GuidedFix.js — 4-step guided improvement wizard
 *
 * User journey: Understand → Prepare → Fix → Verify
 *
 * Design principles:
 * - Evidence-grounded: only measured values shown, never invented
 * - Role-stratified: instructions adapted to owner / cms-admin / developer
 * - Progress persistent: saved to guide_progress via PATCH /api/work-items
 * - Graceful degradation: fallback + retry when AI plan unavailable
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const FONT   = 'var(--font-manrope, Manrope, sans-serif)';
const PURPLE = '#7948f6';
const BLUE   = '#3687fa';
const GREEN  = '#19b987';
const AMBER  = '#efa642';
const RED    = '#ef6473';
const DARK_BG     = 'linear-gradient(145deg,#16102b,#0f1f3d)';
const DARK_SURFACE = 'rgba(255,255,255,.05)';
const DARK_BORDER  = 'rgba(255,255,255,.10)';
const GRAD   = 'linear-gradient(135deg,#8a46f8,#3687fa)';

// Step definitions
const STEPS = [
  { id: 'understand', label: 'Understand' },
  { id: 'prepare',    label: 'Prepare'    },
  { id: 'fix',        label: 'Fix'        },
  { id: 'verify',     label: 'Verify'     },
];

// Role definitions
const ROLES = [
  {
    id: 'owner',
    label: 'Website owner',
    icon: '👤',
    desc: "I manage the site but don't write code",
  },
  {
    id: 'cms-admin',
    label: 'CMS administrator',
    icon: '🛠',
    desc: 'I manage plugins, themes, and settings',
  },
  {
    id: 'developer',
    label: 'Developer',
    icon: '💻',
    desc: 'I can write code and edit config files',
  },
];

// Perf metric fields to display as tiles on Understand step
const PERF_METRICS = [
  { key: 'lcp',  label: 'LCP',  unit: 'ms', title: 'Largest Contentful Paint' },
  { key: 'fcp',  label: 'FCP',  unit: 'ms', title: 'First Contentful Paint'   },
  { key: 'tbt',  label: 'TBT',  unit: 'ms', title: 'Total Blocking Time'      },
  { key: 'cls',  label: 'CLS',  unit: '',   title: 'Cumulative Layout Shift'   },
  { key: 'ttfb', label: 'TTFB', unit: 'ms', title: 'Time to First Byte'       },
  { key: 'si',   label: 'SI',   unit: 'ms', title: 'Speed Index'               },
];

function metricStatus(key, value) {
  if (value == null) return 'neutral';
  if (key === 'lcp')  return value > 4000 ? 'poor' : value > 2500 ? 'needs-work' : 'good';
  if (key === 'fcp')  return value > 3000 ? 'poor' : value > 1800 ? 'needs-work' : 'good';
  if (key === 'tbt')  return value > 600  ? 'poor' : value > 200  ? 'needs-work' : 'good';
  if (key === 'cls')  return value > 0.25 ? 'poor' : value > 0.1  ? 'needs-work' : 'good';
  if (key === 'ttfb') return value > 1800 ? 'poor' : value > 800  ? 'needs-work' : 'good';
  if (key === 'si')   return value > 5800 ? 'poor' : value > 3400 ? 'needs-work' : 'good';
  return 'neutral';
}

const STATUS_COLOR = {
  poor:       RED,
  'needs-work': AMBER,
  good:       GREEN,
  neutral:    'rgba(255,255,255,.5)',
};

// Category badge colors
const CAT_COLORS = {
  performance:   { bg: 'rgba(54,135,250,.18)',  color: '#7ab4fd' },
  seo:           { bg: 'rgba(239,166,66,.18)',   color: '#fbbf6a' },
  security:      { bg: 'rgba(239,100,115,.18)',  color: '#f89aa3' },
  accessibility: { bg: 'rgba(25,185,135,.18)',   color: '#3fe8b9' },
  best_practices:{ bg: 'rgba(121,72,246,.18)',   color: '#c5b4fa' },
};

function categoryColor(cat) {
  if (!cat) return { bg: 'rgba(121,72,246,.18)', color: '#c5b4fa' };
  const key = cat.toLowerCase().replace(/[\s-]/g, '_');
  return CAT_COLORS[key] || { bg: 'rgba(121,72,246,.18)', color: '#c5b4fa' };
}

// ---------------------------------------------------------------------------
// Small shared sub-components
// ---------------------------------------------------------------------------

function Spinner({ label = 'Loading…' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      gap:12, padding:'40px 0' }}>
      <div style={{
        width:28, height:28, borderRadius:'50%',
        border:'3px solid rgba(255,255,255,.12)',
        borderTopColor: PURPLE,
        animation:'spin .7s linear infinite',
      }}/>
      <span style={{ fontSize:12, color:'rgba(255,255,255,.45)', fontFamily:FONT }}>{label}</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function MetricTile({ label, title, value, unit, status }) {
  const col = STATUS_COLOR[status] || STATUS_COLOR.neutral;
  return (
    <div style={{
      flex:'1 1 calc(50% - 6px)', minWidth:120,
      background:'rgba(255,255,255,.04)', border:`1px solid ${DARK_BORDER}`,
      borderRadius:10, padding:'12px 14px',
      borderTop:`2px solid ${col}`,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:4 }}>
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:'.06em',
          textTransform:'uppercase', color: col }}>{label}</span>
        <span style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>measured</span>
      </div>
      <div style={{ fontSize:22, fontWeight:800, color:'#fff', lineHeight:1.1 }}>
        {value != null ? value : '—'}
        {value != null && unit && (
          <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.45)',
            marginLeft:3 }}>{unit}</span>
        )}
      </div>
      <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:3 }}>{title}</div>
    </div>
  );
}

// Role selector card
function RoleCard({ role, selected, onClick }) {
  const active = selected === role.id;
  return (
    <button
      onClick={() => onClick(role.id)}
      style={{
        display:'flex', alignItems:'flex-start', gap:12, width:'100%',
        background: active ? 'rgba(121,72,246,.18)' : 'rgba(255,255,255,.04)',
        border: active ? '1.5px solid rgba(121,72,246,.6)' : `1px solid ${DARK_BORDER}`,
        borderRadius:12, padding:'14px 16px', cursor:'pointer', textAlign:'left',
        transition:'all .15s',
        fontFamily: FONT,
      }}
    >
      <span style={{ fontSize:22, lineHeight:1, flexShrink:0 }}>{role.icon}</span>
      <div>
        <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:2 }}>
          {role.label}
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', lineHeight:1.5 }}>
          {role.desc}
        </div>
      </div>
      {active && (
        <div style={{ marginLeft:'auto', flexShrink:0, width:20, height:20,
          borderRadius:'50%', background:GRAD,
          display:'grid', placeItems:'center' }}>
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </button>
  );
}

// Fix step instruction card (role-adapted)
function FixStepCard({ step, index, role, completedSteps, onToggleComplete, onAskCernly }) {
  const instructions = role === 'developer'
    ? step.developer
    : role === 'cms-admin'
      ? (step['cms-admin'] || step.owner)
      : step.owner;

  if (!instructions) return null;

  const isDone = completedSteps.includes(step.id || String(index));
  const stepKey = step.id || String(index);

  return (
    <div style={{
      background: isDone ? 'rgba(25,185,135,.07)' : 'rgba(255,255,255,.04)',
      border: isDone ? '1px solid rgba(25,185,135,.25)' : `1px solid ${DARK_BORDER}`,
      borderRadius:12, padding:'16px', marginBottom:10,
      transition:'all .2s',
    }}>
      {/* Step header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
        <div style={{
          width:24, height:24, borderRadius:8, flexShrink:0,
          background: isDone ? GREEN : 'rgba(121,72,246,.25)',
          border: isDone ? 'none' : '1.5px solid rgba(121,72,246,.5)',
          display:'grid', placeItems:'center',
        }}>
          {isDone ? (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M1 5l3 3 7-7" stroke="#fff" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <span style={{ fontSize:11, fontWeight:800, color:'rgba(255,255,255,.7)' }}>
              {index + 1}
            </span>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:isDone ? '#3fe8b9' : '#fff',
            lineHeight:1.3, marginBottom:4 }}>
            {step.title}
          </div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', lineHeight:1.6 }}>
            {instructions.action}
          </div>
        </div>
      </div>

      {/* Why it matters */}
      {instructions.why && (
        <div style={{ background:'rgba(54,135,250,.08)', border:'1px solid rgba(54,135,250,.2)',
          borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:11,
          color:'rgba(255,255,255,.55)', lineHeight:1.6 }}>
          <strong style={{ color:'rgba(54,135,250,.9)' }}>Why: </strong>
          {instructions.why}
        </div>
      )}

      {/* Tooling / delegation note */}
      {(instructions.tooling || instructions.delegation) && (
        <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', lineHeight:1.6,
          marginBottom:10, fontStyle:'italic' }}>
          {instructions.tooling || instructions.delegation}
        </div>
      )}

      {/* Caution / notes */}
      {instructions.notes && (
        <div style={{ background:'rgba(239,166,66,.08)', border:'1px solid rgba(239,166,66,.2)',
          borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:11,
          color:'#fbbf6a', lineHeight:1.6 }}>
          <strong>Note: </strong>{instructions.notes}
        </div>
      )}

      {/* Actions row */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
        <button
          onClick={() => onToggleComplete(stepKey)}
          style={{
            display:'flex', alignItems:'center', gap:6,
            background: isDone ? 'rgba(25,185,135,.15)' : 'rgba(255,255,255,.08)',
            border: isDone ? '1px solid rgba(25,185,135,.35)' : `1px solid ${DARK_BORDER}`,
            borderRadius:7, padding:'5px 12px', cursor:'pointer',
            fontSize:11, fontWeight:700, color: isDone ? '#3fe8b9' : 'rgba(255,255,255,.6)',
            fontFamily: FONT,
          }}
        >
          {isDone ? '✓ Marked done' : 'Mark complete'}
        </button>
        {onAskCernly && (
          <button
            onClick={() => onAskCernly({ title: step.title, detail: instructions.action })}
            style={{
              background:'transparent', border:'none', cursor:'pointer',
              fontSize:11, color:PURPLE, fontWeight:600, fontFamily:FONT,
              padding:'5px 8px',
            }}
          >
            Ask Cernly →
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function GuidedFix({
  rec,
  reportId,
  pageUrl,
  workItem,
  onClose,
  onStatusChange,
  onAskCernly,
}) {
  // ── wizard state ───────────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);

  // ── AI plan state ──────────────────────────────────────────────────────────
  const [plan, setPlan]           = useState(null);
  const [planStatus, setPlanStatus] = useState('idle'); // idle | loading | ready | fallback | error
  const [fallbackActions, setFallbackActions] = useState([]);
  const planFetched = useRef(false);

  // ── restore persisted progress ────────────────────────────────────────────
  useEffect(() => {
    const progress = workItem?.guide_progress;
    if (!progress) return;
    if (progress.step != null)           setCurrentStep(progress.step);
    if (progress.role)                   setSelectedRole(progress.role);
    if (progress.completedSteps?.length) setCompletedSteps(progress.completedSteps);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── background AI plan fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (planFetched.current || !rec?.fingerprint || !reportId) return;
    planFetched.current = true;
    setPlanStatus('loading');

    fetch('/api/guide-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recFingerprint: rec.fingerprint, reportId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.plan) {
          setPlan(data.plan);
          setPlanStatus('ready');
        } else if (data.fallback) {
          setFallbackActions(data.actions || []);
          setPlanStatus('fallback');
        } else {
          setPlanStatus('error');
        }
      })
      .catch(() => setPlanStatus('error'));
  }, [rec?.fingerprint, reportId]);

  // ── persist progress ───────────────────────────────────────────────────────
  const persistProgress = useCallback(async (updates) => {
    if (!workItem?.id) return;
    const current = workItem?.guide_progress || {};
    const next = { ...current, ...updates };
    try {
      await fetch('/api/work-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workItem.id, guide_progress: next }),
      });
    } catch {}
  }, [workItem?.id, workItem?.guide_progress]);

  // ── navigation ─────────────────────────────────────────────────────────────
  const goTo = useCallback((idx) => {
    setCurrentStep(idx);
    persistProgress({ step: idx, role: selectedRole, completedSteps });
  }, [selectedRole, completedSteps, persistProgress]);

  const canContinue = useCallback(() => {
    if (currentStep === 1 && !selectedRole) return false;
    return true;
  }, [currentStep, selectedRole]);

  // ── mark step complete/incomplete ──────────────────────────────────────────
  const toggleComplete = useCallback((stepKey) => {
    setCompletedSteps(prev => {
      const next = prev.includes(stepKey)
        ? prev.filter(k => k !== stepKey)
        : [...prev, stepKey];
      persistProgress({ step: currentStep, role: selectedRole, completedSteps: next });
      return next;
    });
  }, [currentStep, selectedRole, persistProgress]);

  // ── retry plan fetch ───────────────────────────────────────────────────────
  const retryPlan = useCallback(() => {
    planFetched.current = false;
    setPlanStatus('idle');
    setPlan(null);
    // trigger re-fetch via useEffect below
    setTimeout(() => {
      planFetched.current = false;
      setPlanStatus('loading');
      fetch('/api/guide-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recFingerprint: rec.fingerprint, reportId }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.plan) { setPlan(data.plan); setPlanStatus('ready'); }
          else if (data.fallback) { setFallbackActions(data.actions || []); setPlanStatus('fallback'); }
          else setPlanStatus('error');
        })
        .catch(() => setPlanStatus('error'));
    }, 0);
  }, [rec?.fingerprint, reportId]);

  // ── Ask Cernly handler ─────────────────────────────────────────────────────
  const handleAskCernly = useCallback((context) => {
    if (!onAskCernly) return;
    onAskCernly({
      title: rec?.title || 'Guided fix',
      category: rec?.category || '',
      detail: context?.detail || '',
      step: STEPS[currentStep]?.label,
    });
  }, [onAskCernly, rec, currentStep]);

  // ── derived evidence ───────────────────────────────────────────────────────
  const evidence = rec?.evidence || {};
  const measuredMetrics = PERF_METRICS.filter(m => evidence[m.key] != null);
  const catColors = categoryColor(rec?.category);
  const hasAiPlan = planStatus === 'ready' && plan?.steps?.length;

  // ── rescan handler ─────────────────────────────────────────────────────────
  const handleRescan = useCallback(() => {
    if (onStatusChange) onStatusChange(rec?.fingerprint, 'verify');
    onClose();
  }, [onStatusChange, rec?.fingerprint, onClose]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div style={{
      position:'fixed', inset:0,
      display:'flex', alignItems:'stretch', justifyContent:'flex-end',
      zIndex:1000,
      fontFamily: FONT,
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.45)', backdropFilter:'blur(2px)' }}
      />

      {/* Panel */}
      <div style={{
        position:'relative', zIndex:1,
        width:'100%', maxWidth:540,
        background: DARK_BG,
        boxShadow:'0 0 0 1px rgba(121,72,246,.2), -4px 0 40px rgba(0,0,0,.5)',
        display:'flex', flexDirection:'column',
        overflowY:'auto',
        // mobile: full screen
      }}
      // prevent click-through
      onClick={e => e.stopPropagation()}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div style={{
          padding:'16px 20px 0',
          borderBottom:`1px solid ${DARK_BORDER}`,
          paddingBottom:14,
          flexShrink:0,
        }}>
          {/* Top row: label + close */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            marginBottom:8 }}>
            <span style={{ fontSize:9, fontWeight:900, letterSpacing:'.15em',
              textTransform:'uppercase', color:'rgba(255,255,255,.3)' }}>
              Cernly Guided Fix
            </span>
            <button
              onClick={onClose}
              style={{ background:'rgba(255,255,255,.08)', border:`1px solid ${DARK_BORDER}`,
                borderRadius:6, width:28, height:28, cursor:'pointer',
                display:'grid', placeItems:'center', color:'rgba(255,255,255,.55)' }}
              aria-label="Close"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Rec title + category badge */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:10,
            flexWrap:'wrap', marginBottom:14 }}>
            <h2 style={{ fontSize:16, fontWeight:800, color:'#fff', margin:0,
              flex:'1 1 200px', lineHeight:1.3 }}>
              {rec?.title || 'Improve your site'}
            </h2>
            {rec?.category && (
              <span style={{
                fontSize:10, fontWeight:800, letterSpacing:'.06em',
                textTransform:'uppercase', borderRadius:6,
                padding:'3px 8px', flexShrink:0,
                background: catColors.bg, color: catColors.color,
              }}>
                {rec.category.replace(/_/g,' ')}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ display:'flex', gap:0 }}>
            {STEPS.map((s, i) => {
              const active  = i === currentStep;
              const done    = i < currentStep;
              return (
                <div key={s.id} style={{ flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', gap:5 }}>
                  {/* line + dot */}
                  <div style={{ width:'100%', display:'flex', alignItems:'center' }}>
                    {i > 0 && (
                      <div style={{ flex:1, height:2,
                        background: done ? PURPLE : 'rgba(255,255,255,.12)' }}/>
                    )}
                    <div style={{
                      width:20, height:20, borderRadius:'50%', flexShrink:0,
                      background: done ? PURPLE : active ? 'rgba(121,72,246,.35)' : 'rgba(255,255,255,.08)',
                      border: active ? '2px solid ' + PURPLE : done ? 'none' : `1.5px solid rgba(255,255,255,.15)`,
                      display:'grid', placeItems:'center',
                    }}>
                      {done ? (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5l2 2 5-4" stroke="#fff" strokeWidth="1.6"
                            strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span style={{ fontSize:9, fontWeight:800,
                          color: active ? '#fff' : 'rgba(255,255,255,.3)' }}>{i+1}</span>
                      )}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ flex:1, height:2,
                        background: done ? PURPLE : 'rgba(255,255,255,.12)' }}/>
                    )}
                  </div>
                  <span style={{ fontSize:10, fontWeight: active ? 800 : 600,
                    color: active ? '#fff' : done ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.3)' }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP CONTENT ───────────────────────────────────────────────── */}
        <div style={{ flex:1, padding:'20px 20px 0', overflowY:'auto' }}>

          {/* ── STEP 0: UNDERSTAND ────────────────────────────────────────── */}
          {currentStep === 0 && (
            <div>
              <h3 style={{ fontSize:18, fontWeight:800, color:'#fff', margin:'0 0 8px',
                lineHeight:1.3 }}>
                Here's what we found
              </h3>

              {/* what_we_found or explanation */}
              {(rec?.what_we_found || rec?.explanation) && (
                <p style={{ fontSize:13, lineHeight:1.75,
                  color:'rgba(255,255,255,.7)', margin:'0 0 18px' }}>
                  {rec.what_we_found || rec.explanation}
                </p>
              )}

              {/* Perf metric tiles */}
              {measuredMetrics.length > 0 && (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                    textTransform:'uppercase', color:'rgba(255,255,255,.3)', marginBottom:10 }}>
                    Measured on your site
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {measuredMetrics.map(m => (
                      <MetricTile
                        key={m.key}
                        label={m.label}
                        title={m.title}
                        value={evidence[m.key]}
                        unit={m.unit}
                        status={metricStatus(m.key, evidence[m.key])}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other evidence fields */}
              {(() => {
                const perfKeys = new Set(PERF_METRICS.map(m => m.key));
                const otherEvidence = Object.entries(evidence).filter(([k]) =>
                  !perfKeys.has(k) && evidence[k] != null
                );
                if (otherEvidence.length === 0) return null;
                return (
                  <div style={{ background:'rgba(255,255,255,.04)',
                    border:`1px solid ${DARK_BORDER}`, borderRadius:10,
                    padding:'12px 14px', marginBottom:18 }}>
                    <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                      textTransform:'uppercase', color:'rgba(255,255,255,.3)', marginBottom:10 }}>
                      Scan evidence
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {otherEvidence.slice(0,8).map(([k, v]) => (
                        <div key={k} style={{ display:'flex', justifyContent:'space-between',
                          gap:8, fontSize:12 }}>
                          <span style={{ color:'rgba(255,255,255,.5)', flex:'0 0 auto',
                            maxWidth:'55%' }}>
                            {k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}
                          </span>
                          <span style={{ color:'rgba(255,255,255,.8)', fontWeight:600,
                            textAlign:'right' }}>
                            {Array.isArray(v) ? v.slice(0,2).join(', ')+(v.length>2?'…':'') : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Why it matters */}
              {rec?.why_it_matters && (
                <div style={{ background:'rgba(54,135,250,.07)',
                  border:'1px solid rgba(54,135,250,.18)', borderRadius:10,
                  padding:'14px 16px', marginBottom:18 }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                    textTransform:'uppercase', color:'rgba(54,135,250,.7)',
                    marginBottom:8 }}>
                    Why this matters
                  </div>
                  <p style={{ fontSize:13, lineHeight:1.7,
                    color:'rgba(255,255,255,.6)', margin:0 }}>
                    {rec.why_it_matters}
                  </p>
                </div>
              )}

              {/* No evidence fallback */}
              {measuredMetrics.length === 0 && !rec?.what_we_found && !rec?.explanation && (
                <div style={{ background:'rgba(255,255,255,.04)',
                  border:`1px solid ${DARK_BORDER}`, borderRadius:10,
                  padding:'14px 16px', marginBottom:18 }}>
                  <p style={{ fontSize:13, color:'rgba(255,255,255,.5)',
                    lineHeight:1.7, margin:0 }}>
                    This recommendation was flagged during your scan. The next step will
                    guide you through investigating and resolving it.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: PREPARE ───────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ fontSize:18, fontWeight:800, color:'#fff', margin:'0 0 8px',
                lineHeight:1.3 }}>
                How do you manage this site?
              </h3>
              <p style={{ fontSize:13, lineHeight:1.7, color:'rgba(255,255,255,.55)',
                margin:'0 0 18px' }}>
                Choose your role to get instructions tailored to your experience level.
              </p>

              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                {ROLES.map(role => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    selected={selectedRole}
                    onClick={setSelectedRole}
                  />
                ))}
              </div>

              {/* Prerequisites notice */}
              {rec?.actions?.length > 0 && (
                <div style={{ background:'rgba(239,166,66,.07)',
                  border:'1px solid rgba(239,166,66,.18)', borderRadius:10,
                  padding:'12px 14px' }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                    textTransform:'uppercase', color:AMBER, marginBottom:8 }}>
                    Before you begin
                  </div>
                  <ul style={{ margin:0, paddingLeft:16,
                    color:'rgba(255,255,255,.55)', fontSize:12, lineHeight:1.7 }}>
                    <li>Make a backup of your site or the files you'll edit.</li>
                    <li>If you're unsure at any step, the "Ask Cernly" button provides context.</li>
                    {rec.actions.length > 3 && (
                      <li>This fix has {rec.actions.length} steps — you can complete them over multiple sessions.</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: FIX ───────────────────────────────────────────────── */}
          {currentStep === 2 && (
            <div>
              <div style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', marginBottom:14 }}>
                <h3 style={{ fontSize:18, fontWeight:800, color:'#fff', margin:0,
                  lineHeight:1.3 }}>
                  Step-by-step fix
                </h3>
                {selectedRole && (
                  <span style={{ fontSize:10, fontWeight:800, letterSpacing:'.06em',
                    textTransform:'uppercase', borderRadius:6, padding:'3px 8px',
                    background:'rgba(121,72,246,.18)', color:'#c5b4fa', flexShrink:0 }}>
                    {ROLES.find(r=>r.id===selectedRole)?.label || selectedRole}
                  </span>
                )}
              </div>

              {/* Plan loading */}
              {planStatus === 'loading' && (
                <Spinner label="Generating your personalised fix plan…" />
              )}

              {/* AI plan ready */}
              {planStatus === 'ready' && hasAiPlan && (
                <>
                  {plan.evidenceSummary && (
                    <div style={{ background:'rgba(121,72,246,.08)',
                      border:'1px solid rgba(121,72,246,.2)', borderRadius:10,
                      padding:'12px 14px', marginBottom:16, fontSize:12,
                      color:'rgba(255,255,255,.6)', lineHeight:1.65 }}>
                      {plan.evidenceSummary}
                    </div>
                  )}
                  {plan.steps.map((step, i) => (
                    <FixStepCard
                      key={step.id || i}
                      step={step}
                      index={i}
                      role={selectedRole}
                      completedSteps={completedSteps}
                      onToggleComplete={toggleComplete}
                      onAskCernly={onAskCernly ? handleAskCernly : null}
                    />
                  ))}
                </>
              )}

              {/* Fallback — AI unavailable */}
              {(planStatus === 'fallback' || planStatus === 'error') && (
                <div>
                  <div style={{ background:'rgba(239,166,66,.08)',
                    border:'1px solid rgba(239,166,66,.2)', borderRadius:10,
                    padding:'12px 14px', marginBottom:16, fontSize:12,
                    color:'#fbbf6a', lineHeight:1.65 }}>
                    {planStatus === 'error'
                      ? "Personalised guidance couldn't be generated right now."
                      : 'AI-generated instructions are unavailable. Here are the identified actions from your scan.'}
                    <button
                      onClick={retryPlan}
                      style={{ marginLeft:8, background:'none', border:'none',
                        color: PURPLE, fontSize:12, fontWeight:700, cursor:'pointer',
                        fontFamily:FONT }}
                    >
                      Retry
                    </button>
                  </div>

                  {/* Fallback actions from rec */}
                  {(fallbackActions.length > 0 ? fallbackActions : (rec?.actions || [])).map((action, i) => (
                    <div key={i} style={{ background:'rgba(255,255,255,.04)',
                      border:`1px solid ${DARK_BORDER}`, borderRadius:12,
                      padding:'14px 16px', marginBottom:10 }}>
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                        <span style={{ width:22, height:22, borderRadius:7, flexShrink:0,
                          background:'rgba(121,72,246,.2)', border:'1.5px solid rgba(121,72,246,.4)',
                          display:'grid', placeItems:'center',
                          fontSize:10, fontWeight:800, color:'rgba(255,255,255,.6)' }}>
                          {i+1}
                        </span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'#fff',
                            marginBottom:4, lineHeight:1.3 }}>
                            {action.title || action}
                          </div>
                          {action.description && (
                            <div style={{ fontSize:12, color:'rgba(255,255,255,.55)',
                              lineHeight:1.65 }}>
                              {action.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {fallbackActions.length === 0 && !rec?.actions?.length && (
                    <p style={{ fontSize:13, color:'rgba(255,255,255,.4)', lineHeight:1.7 }}>
                      No specific actions were identified for this recommendation. Use the
                      "Ask Cernly" button to investigate further.
                    </p>
                  )}
                </div>
              )}

              {/* Completed progress note */}
              {completedSteps.length > 0 && hasAiPlan && (
                <div style={{ textAlign:'center', padding:'8px 0',
                  fontSize:12, color:'rgba(255,255,255,.35)' }}>
                  {completedSteps.length} of {plan.steps.length} steps marked complete
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: VERIFY ────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ fontSize:18, fontWeight:800, color:'#fff', margin:'0 0 8px',
                lineHeight:1.3 }}>
                How to verify your fix
              </h3>
              <p style={{ fontSize:13, lineHeight:1.75,
                color:'rgba(255,255,255,.6)', margin:'0 0 18px' }}>
                A rescan measures the same signals as your original audit. Here's what
                to look for after you've made your changes.
              </p>

              {/* What success looks like */}
              <div style={{ background:'rgba(25,185,135,.07)',
                border:'1px solid rgba(25,185,135,.2)', borderRadius:12,
                padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                  textTransform:'uppercase', color:GREEN, marginBottom:10 }}>
                  What success looks like
                </div>
                {measuredMetrics.length > 0 ? (
                  <ul style={{ margin:0, paddingLeft:16,
                    color:'rgba(255,255,255,.6)', fontSize:12, lineHeight:1.8 }}>
                    {measuredMetrics.map(m => {
                      const val = evidence[m.key];
                      const target = m.key === 'lcp'  ? '< 2,500 ms'
                                   : m.key === 'fcp'  ? '< 1,800 ms'
                                   : m.key === 'tbt'  ? '< 200 ms'
                                   : m.key === 'cls'  ? '< 0.1'
                                   : m.key === 'ttfb' ? '< 800 ms'
                                   : m.key === 'si'   ? '< 3,400 ms'
                                   : null;
                      return target ? (
                        <li key={m.key}>
                          <strong style={{ color:'rgba(255,255,255,.75)' }}>{m.title}</strong>
                          {' '}should move from <strong style={{ color:RED }}>{val}{m.unit}</strong>
                          {' '}toward {' '}<strong style={{ color:GREEN }}>{target}</strong>
                        </li>
                      ) : null;
                    }).filter(Boolean)}
                    {measuredMetrics.every(m => !['lcp','fcp','tbt','cls','ttfb','si'].includes(m.key)) && (
                      <li>The flagged issue should no longer appear in the scan results.</li>
                    )}
                  </ul>
                ) : (
                  <p style={{ fontSize:12, color:'rgba(255,255,255,.55)',
                    lineHeight:1.7, margin:0 }}>
                    After making your changes, run a new scan and check whether
                    this recommendation still appears in the results.
                  </p>
                )}
              </div>

              {/* Result interpretation guide */}
              <div style={{ background:'rgba(255,255,255,.04)',
                border:`1px solid ${DARK_BORDER}`, borderRadius:12,
                padding:'14px 16px', marginBottom:20 }}>
                <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                  textTransform:'uppercase', color:'rgba(255,255,255,.3)', marginBottom:12 }}>
                  Reading your results
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { dot: GREEN, label:'Observed improvement',   desc:'Metrics improved — your change had an effect.' },
                    { dot: BLUE,  label:'Likely resolved',        desc:'Issue no longer flagged; confirm with a second scan.' },
                    { dot: AMBER, label:'Persistent issue',       desc:'Scores didn\'t change enough. Review the fix steps.' },
                    { dot: RED,   label:'Unable to verify',       desc:'Evidence is inconclusive. The change may not have been deployed.' },
                  ].map(r => (
                    <div key={r.label} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%',
                        background:r.dot, flexShrink:0, marginTop:4 }}/>
                      <div>
                        <span style={{ fontSize:12, fontWeight:700,
                          color:'rgba(255,255,255,.75)' }}>{r.label}: </span>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,.45)',
                          lineHeight:1.6 }}>{r.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rescan CTA */}
              <button
                onClick={handleRescan}
                style={{
                  width:'100%', padding:'14px',
                  background: GRAD, border:'none', borderRadius:12,
                  color:'#fff', fontSize:14, fontWeight:800,
                  cursor:'pointer', fontFamily:FONT, marginBottom:10,
                  boxShadow:'0 4px 20px rgba(121,72,246,.4)',
                }}
              >
                I've made changes — run a new scan →
              </button>
              <p style={{ fontSize:11, color:'rgba(255,255,255,.3)',
                textAlign:'center', margin:0, lineHeight:1.5 }}>
                A rescan measures the live page — make sure your changes are deployed first.
              </p>
            </div>
          )}
        </div>

        {/* ── FOOTER: Back / Continue ─────────────────────────────────────── */}
        <div style={{
          padding:'16px 20px',
          borderTop:`1px solid ${DARK_BORDER}`,
          display:'flex', gap:10,
          flexShrink:0,
          background:'rgba(0,0,0,.2)',
        }}>
          {currentStep > 0 && (
            <button
              onClick={() => goTo(currentStep - 1)}
              style={{
                flex:1, padding:'12px',
                background:'rgba(255,255,255,.07)', border:`1px solid ${DARK_BORDER}`,
                borderRadius:10, color:'rgba(255,255,255,.7)', fontSize:13,
                fontWeight:700, cursor:'pointer', fontFamily:FONT,
              }}
            >
              ← Back
            </button>
          )}
          {currentStep < STEPS.length - 1 && (
            <button
              onClick={() => goTo(currentStep + 1)}
              disabled={!canContinue()}
              style={{
                flex:2, padding:'12px',
                background: canContinue() ? GRAD : 'rgba(255,255,255,.08)',
                border:'none', borderRadius:10,
                color: canContinue() ? '#fff' : 'rgba(255,255,255,.3)',
                fontSize:13, fontWeight:800,
                cursor: canContinue() ? 'pointer' : 'not-allowed',
                fontFamily:FONT,
                boxShadow: canContinue() ? '0 4px 16px rgba(121,72,246,.3)' : 'none',
                transition:'all .15s',
              }}
            >
              {currentStep === 1
                ? 'Show me how to fix it →'
                : currentStep === 2
                  ? 'How do I verify this? →'
                  : 'Continue →'}
            </button>
          )}
          {currentStep === STEPS.length - 1 && (
            <button
              onClick={onClose}
              style={{
                flex:2, padding:'12px',
                background:'rgba(255,255,255,.07)', border:`1px solid ${DARK_BORDER}`,
                borderRadius:10, color:'rgba(255,255,255,.6)', fontSize:13,
                fontWeight:700, cursor:'pointer', fontFamily:FONT,
              }}
            >
              Close guide
            </button>
          )}
        </div>

        {/* Ask Cernly footer */}
        {onAskCernly && (
          <div style={{
            padding:'10px 20px 14px',
            borderTop:`1px solid ${DARK_BORDER}`,
            display:'flex', alignItems:'center', gap:8,
            flexShrink:0,
          }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>
              Have a question?
            </span>
            <button
              onClick={() => handleAskCernly({})}
              style={{ background:'none', border:'none', cursor:'pointer',
                fontSize:11, fontWeight:700, color:PURPLE, fontFamily:FONT,
                padding:0 }}
            >
              Ask Cernly →
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
          /* Panel already fills width via max-width:100% on small screens */
        }
      `}</style>
    </div>
  );
}
