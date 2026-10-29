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
 * - Light theme matching app primary design system
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AffectedElements from './AffectedElements';
import AskMarkdown from './AskMarkdown';

// ---------------------------------------------------------------------------
// Design tokens — light theme
// ---------------------------------------------------------------------------

const FONT    = 'var(--font-manrope, Manrope, sans-serif)';
const PURPLE  = '#7948f6';
const BLUE    = '#3687fa';
const GREEN   = '#19b987';
const AMBER   = '#efa642';
const RED     = '#ef6473';

// Light system
const BG          = '#ffffff';
const SURFACE     = '#f4f5fb';   // lavender supporting surface
const SURFACE_ALT = 'rgba(121,72,246,.06)'; // very subtle purple tint
const BORDER      = '#e2e4f0';
const BORDER_MED  = '#ccd0e0';
const TEXT_PRIMARY   = '#151621'; // dark navy
const TEXT_SECONDARY = '#4b5168'; // accessible on white (5.5:1)
const TEXT_TERTIARY  = '#6b7290'; // accessible on white (4.6:1)

const GRAD = 'linear-gradient(135deg,#8a46f8,#3687fa)';

// Step definitions
const STEPS = [
  { id: 'understand', label: 'Understand' },
  { id: 'prepare',    label: 'Prepare'    },
  { id: 'fix',        label: 'Fix'        },
  { id: 'verify',     label: 'Verify'     },
];

// Role definitions — SVG icons replacing emoji
const ROLES = [
  {
    id: 'owner',
    label: 'Website owner',
    desc: "I manage the site but don't write code",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
  },
  {
    id: 'cms-admin',
    label: 'CMS administrator',
    desc: 'I manage plugins, themes, and settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2 4h4l-3 3 1 4-4-2-4 2 1-4L6 6h4z"/>
        <path d="M12 14v8M8 18h8"/>
      </svg>
    ),
  },
  {
    id: 'developer',
    label: 'Developer',
    desc: 'I can write code and edit config files',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
];

// Perf metric fields
const PERF_METRICS = [
  { key: 'lcp',  label: 'LCP',  unit: 'ms', title: 'Largest Contentful Paint' },
  { key: 'fcp',  label: 'FCP',  unit: 'ms', title: 'First Contentful Paint'   },
  { key: 'tbt',  label: 'TBT',  unit: 'ms', title: 'Total Blocking Time'      },
  { key: 'cls',  label: 'CLS',  unit: '',   title: 'Cumulative Layout Shift'   },
  { key: 'ttfb', label: 'TTFB', unit: 'ms', title: 'Time to First Byte'       },
  { key: 'si',   label: 'SI',   unit: 'ms', title: 'Speed Index'               },
];

// Human-readable labels for other evidence fields
const EVIDENCE_LABELS = {
  imageCount:       'Images with potential',
  totalSavingsKib:  'Potential savings',
  lcpImageUrl:      'LCP image',
  lcpSavingsKib:    'LCP image savings',
  imageUrls:        'Affected images',
  modernFormats:    'Modern format opportunities',
  confidence:       'Measurement confidence',
  titleLength:      'Title tag length',
  descLength:       'Meta description length',
  h1Count:          'H1 tag count',
  hasCanonical:     'Canonical tag',
  schemaCount:      'Structured data schemas',
  hasViewport:      'Viewport meta',
  isHttps:          'HTTPS enabled',
  hasHsts:          'HSTS header',
  hasCsp:           'CSP header',
  hasXfo:           'X-Frame-Options',
  httpRedirects:    'HTTP→HTTPS redirect',
  imgsNoAlt:        'Images missing alt text',
  emptyButtons:     'Unlabelled buttons',
  genericLinks:     'Generic link text',
  hasLang:          'Language attribute',
  hasSkipNav:       'Skip navigation link',
};

/**
 * Normalise a raw evidence value for a perf metric to an integer milliseconds
 * or a float (for CLS). Handles stored-as-seconds floats like 8.9 → 8900.
 */
function normaliseMetricValue(key, raw) {
  if (raw == null) return null;

  // If it's a string with a unit suffix, e.g. "8.9 s" or "1200ms"
  if (typeof raw === 'string') {
    const match = raw.match(/^([\d.]+)\s*(s|ms)?$/i);
    if (!match) return null;
    const num  = parseFloat(match[1]);
    const unit = (match[2] || '').toLowerCase();
    if (key === 'cls') return num;
    if (unit === 's')  return Math.round(num * 1000);
    return Math.round(num);
  }

  const num = Number(raw);
  if (!isFinite(num)) return null;

  // CLS is dimensionless (0–1 range)
  if (key === 'cls') return num;

  // Heuristic: if value looks like seconds (very small) convert to ms
  // LCP/FCP/TTFB/SI rarely below 50 ms; TBT rarely below 5 ms
  if (key === 'tbt'  && num < 5)   return Math.round(num * 1000);
  if (key !== 'cls'  && num < 50)  return Math.round(num * 1000);

  return Math.round(num);
}

function formatMetricValue(key, raw) {
  const v = normaliseMetricValue(key, raw);
  if (v == null) return null;
  if (key === 'cls') return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return v.toLocaleString();
}

function metricStatus(key, raw) {
  const value = normaliseMetricValue(key, raw);
  if (value == null) return 'neutral';
  if (key === 'lcp')  return value > 4000 ? 'poor' : value > 2500 ? 'needs-work' : 'good';
  if (key === 'fcp')  return value > 3000 ? 'poor' : value > 1800 ? 'needs-work' : 'good';
  if (key === 'tbt')  return value > 600  ? 'poor' : value > 200  ? 'needs-work' : 'good';
  if (key === 'cls')  return value > 0.25 ? 'poor' : value > 0.1  ? 'needs-work' : 'good';
  if (key === 'ttfb') return value > 1800 ? 'poor' : value > 800  ? 'needs-work' : 'good';
  if (key === 'si')   return value > 5800 ? 'poor' : value > 3400 ? 'needs-work' : 'good';
  return 'neutral';
}

// Category badge colours — light variants
const CAT_COLORS = {
  performance:   { bg: 'rgba(54,135,250,.12)',  color: '#1a5fc7' },
  seo:           { bg: 'rgba(239,166,66,.14)',   color: '#8a5a00' },
  security:      { bg: 'rgba(239,100,115,.12)',  color: '#b91c2c' },
  accessibility: { bg: 'rgba(25,185,135,.12)',   color: '#0a7a5c' },
  best_practices:{ bg: 'rgba(121,72,246,.12)',   color: '#5a2dc7' },
};

function categoryColor(cat) {
  if (!cat) return { bg: 'rgba(121,72,246,.12)', color: '#5a2dc7' };
  const key = cat.toLowerCase().replace(/[\s-]/g, '_');
  return CAT_COLORS[key] || { bg: 'rgba(121,72,246,.12)', color: '#5a2dc7' };
}

// Plain-English interpretation for each category + metric state
function buildPlainEnglishSummary(rec) {
  const evidence = rec?.evidence || {};
  const category = rec?.category?.toLowerCase() || '';
  const lines = [];

  // Use AI-generated evidenceSummary if already present in a cached plan — handled by caller

  // Performance-specific interpretation
  const lcp  = normaliseMetricValue('lcp',  evidence.lcp);
  const fcp  = normaliseMetricValue('fcp',  evidence.fcp);
  const tbt  = normaliseMetricValue('tbt',  evidence.tbt);
  const cls  = normaliseMetricValue('cls',  evidence.cls);
  const ttfb = normaliseMetricValue('ttfb', evidence.ttfb);

  if (lcp != null && lcp > 2500) {
    const secs = (lcp / 1000).toFixed(1);
    lines.push(`Your largest content element takes ${secs}s to load — ${lcp > 4000 ? 'well above' : 'above'} the 2.5s target.`);
  }
  if (tbt != null && tbt > 200) {
    lines.push(`JavaScript is blocking the main thread for ${tbt.toLocaleString()} ms, delaying interactivity.`);
  }
  if (cls != null && cls > 0.1) {
    lines.push(`Layout shifts (CLS ${cls.toFixed(3)}) indicate elements are moving around after page load.`);
  }
  if (ttfb != null && ttfb > 800) {
    const secs = (ttfb / 1000).toFixed(1);
    lines.push(`The server took ${secs}s to respond — a slow start that delays everything else.`);
  }
  if (fcp != null && fcp > 1800 && lines.length === 0) {
    const secs = (fcp / 1000).toFixed(1);
    lines.push(`Visitors see your first content after ${secs}s — faster than ${(fcp / 1000).toFixed(1) > 3 ? 'most' : 'ideal'} but room to improve.`);
  }

  // Image-specific
  if (evidence.totalSavingsKib != null && evidence.totalSavingsKib > 0) {
    lines.push(`Optimising your images could save approximately ${evidence.totalSavingsKib} KiB.`);
  }

  if (lines.length === 0 && rec?.what_we_found) return null; // fall back to what_we_found
  return lines.join(' ');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner({ label = 'Loading…' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      gap:12, padding:'40px 0' }}>
      <div style={{
        width:28, height:28, borderRadius:'50%',
        border:'3px solid ' + SURFACE,
        borderTopColor: PURPLE,
        animation:'guidedfix-spin .7s linear infinite',
      }}/>
      <span style={{ fontSize:12, color:TEXT_TERTIARY, fontFamily:FONT }}>{label}</span>
      <style>{`@keyframes guidedfix-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function MetricTile({ label, title, value, unit, status }) {
  const statusColors = {
    poor:         { border: RED,   text: '#b91c2c', bg: 'rgba(239,100,115,.08)' },
    'needs-work': { border: AMBER, text: '#7a4a00', bg: 'rgba(239,166,66,.08)'  },
    good:         { border: GREEN, text: '#0a7a5c', bg: 'rgba(25,185,135,.06)'  },
    neutral:      { border: BORDER_MED, text: TEXT_TERTIARY, bg: SURFACE       },
  };
  const col = statusColors[status] || statusColors.neutral;

  return (
    <div style={{
      flex:'1 1 calc(50% - 6px)', minWidth:110,
      background: col.bg,
      border:`1px solid ${BORDER}`,
      borderTop:`3px solid ${col.border}`,
      borderRadius:10, padding:'11px 13px',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:3 }}>
        <span style={{ fontSize:10, fontWeight:800, letterSpacing:'.06em',
          textTransform:'uppercase', color: col.text }}>{label}</span>
        <span style={{ fontSize:9, color:TEXT_TERTIARY }}>measured</span>
      </div>
      <div style={{ fontSize:20, fontWeight:800, color:TEXT_PRIMARY, lineHeight:1.1 }}>
        {value != null ? value : '—'}
        {value != null && unit && (
          <span style={{ fontSize:11, fontWeight:600, color:TEXT_TERTIARY,
            marginLeft:3 }}>{unit}</span>
        )}
      </div>
      <div style={{ fontSize:10, color:TEXT_TERTIARY, marginTop:3 }}>{title}</div>
    </div>
  );
}

function RoleCard({ role, selected, onClick }) {
  const active = selected === role.id;
  return (
    <button
      onClick={() => onClick(role.id)}
      aria-pressed={active}
      style={{
        display:'flex', alignItems:'flex-start', gap:12, width:'100%',
        background: active ? 'rgba(121,72,246,.07)' : SURFACE,
        border: active ? `2px solid ${PURPLE}` : `1.5px solid ${BORDER}`,
        borderRadius:12, padding:'13px 14px', cursor:'pointer', textAlign:'left',
        transition:'all .15s', fontFamily:FONT,
        outline: 'none',
      }}
    >
      {/* Icon */}
      <span style={{
        width:36, height:36, borderRadius:9, flexShrink:0,
        background: active ? PURPLE : BG,
        border: active ? 'none' : `1px solid ${BORDER}`,
        display:'grid', placeItems:'center',
        color: active ? '#fff' : TEXT_SECONDARY,
        transition:'all .15s',
      }}>
        {role.icon}
      </span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:TEXT_PRIMARY, marginBottom:2 }}>
          {role.label}
        </div>
        <div style={{ fontSize:12, color:TEXT_SECONDARY, lineHeight:1.5 }}>
          {role.desc}
        </div>
      </div>
      {/* Selected indicator — visible beyond colour */}
      <div style={{
        width:20, height:20, borderRadius:'50%', flexShrink:0, alignSelf:'center',
        background: active ? PURPLE : BG,
        border: active ? 'none' : `2px solid ${BORDER}`,
        display:'grid', placeItems:'center',
        transition:'all .15s',
      }}>
        {active && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline chat panel — displayed inside GuidedFix step 2 when Ask Cernly is clicked
// ---------------------------------------------------------------------------

const SUGGESTED_PROMPTS = [
  'Explain this in simpler terms',
  'How do I do this on my platform?',
  'How do I check whether this worked?',
  'I tried this and need help troubleshooting',
];

function InlineChatPanel({ step, messages, input, loading, error, inputRef, onInputChange, onSend, onClose }) {
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(input);
    }
  };

  return (
    <div style={{
      marginTop: 16,
      border: `1.5px solid ${PURPLE}`,
      borderRadius: 14,
      overflow: 'hidden',
      background: BG,
      boxShadow: `0 4px 20px rgba(121,72,246,.12)`,
    }}>
      {/* Chat header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: SURFACE_ALT,
        borderBottom: `1px solid rgba(121,72,246,.15)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 7,
            background: GRAD, display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: PURPLE }}>Ask Cernly</div>
            <div style={{ fontSize: 10, color: TEXT_TERTIARY, maxWidth: 220,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              About: {step.title}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Close */}
          <button onClick={onClose} aria-label="Close chat"
            style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6,
              width: 26, height: 26, cursor: 'pointer', display: 'grid', placeItems: 'center',
              color: TEXT_SECONDARY }}>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Message history */}
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 12, color: TEXT_TERTIARY, margin: 0, textAlign: 'center', padding: '8px 0' }}>
            Ask a question about this step, or choose a suggested prompt below.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '88%',
            background: m.role === 'user' ? GRAD : SURFACE,
            color: m.role === 'user' ? '#fff' : TEXT_PRIMARY,
            borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
            padding: '8px 12px',
            fontSize: 12,
            lineHeight: 1.65,
          }}>
            {m.role === 'assistant'
              ? <AskMarkdown content={m.content} dark />
              : m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 4, padding: '8px 12px',
            background: SURFACE, borderRadius: '12px 12px 12px 2px' }}>
            {[0,1,2].map(d => (
              <div key={d} style={{
                width: 6, height: 6, borderRadius: '50%', background: TEXT_TERTIARY,
                animation: `bounce .9s ${d * 0.18}s infinite`,
              }}/>
            ))}
          </div>
        )}
        {error && (
          <div style={{ background: 'rgba(239,100,115,.08)', border: '1px solid rgba(239,100,115,.25)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#c0152f',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>{error}</span>
            <button onClick={() => onSend(messages[messages.length - 1]?.content || '')}
              style={{ background: 'none', border: 'none', color: PURPLE, fontSize: 11,
                fontWeight: 700, cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}>
              Retry
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts — only show if no messages yet */}
      {messages.length === 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGGESTED_PROMPTS.map(prompt => (
            <button key={prompt} onClick={() => onSend(prompt)}
              style={{
                background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '5px 10px', fontSize: 11, fontWeight: 600, color: TEXT_SECONDARY,
                cursor: 'pointer', fontFamily: FONT, lineHeight: 1.4,
              }}>
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px',
        borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a follow-up question…"
          disabled={loading}
          style={{
            flex: 1, border: `1.5px solid ${BORDER}`, borderRadius: 8,
            padding: '8px 12px', fontSize: 12, fontFamily: FONT,
            background: BG, color: TEXT_PRIMARY, outline: 'none',
          }}
        />
        <button
          onClick={() => onSend(input)}
          disabled={!input.trim() || loading}
          style={{
            background: (!input.trim() || loading) ? BORDER : GRAD,
            border: 'none', borderRadius: 8, padding: '8px 12px',
            color: (!input.trim() || loading) ? TEXT_TERTIARY : '#fff',
            cursor: (!input.trim() || loading) ? 'default' : 'pointer',
            fontFamily: FONT, fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>

      {/* Bounce animation */}
      <style>{`
        @keyframes bounce {
          0%,80%,100%{transform:translateY(0)}
          40%{transform:translateY(-5px)}
        }
      `}</style>
    </div>
  );
}

function FixStepCard({ step, index, role, completedSteps, onToggleComplete, onAskStep }) {
  const instructions = role === 'developer'
    ? step.developer
    : role === 'cms-admin'
      ? (step['cms-admin'] || step.owner)
      : step.owner;

  if (!instructions) return null;

  const isDone  = completedSteps.includes(step.id || String(index));
  const stepKey = step.id || String(index);

  return (
    <div style={{
      background: isDone ? 'rgba(25,185,135,.05)' : BG,
      border: isDone ? '1.5px solid rgba(25,185,135,.3)' : `1px solid ${BORDER}`,
      borderRadius:12, padding:'14px 16px', marginBottom:10,
      transition:'all .2s',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
        <div style={{
          width:24, height:24, borderRadius:7, flexShrink:0,
          background: isDone ? GREEN : SURFACE_ALT,
          border: isDone ? 'none' : `1.5px solid rgba(121,72,246,.35)`,
          display:'grid', placeItems:'center',
        }}>
          {isDone ? (
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M1 5l3 3 7-7" stroke="#fff" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <span style={{ fontSize:10, fontWeight:800, color:PURPLE }}>
              {index + 1}
            </span>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700,
            color: isDone ? '#0a7a5c' : TEXT_PRIMARY,
            lineHeight:1.3, marginBottom:4 }}>
            {step.title}
          </div>
          <div style={{ fontSize:13, color:TEXT_SECONDARY, lineHeight:1.65 }}>
            {instructions.action}
          </div>
        </div>
      </div>

      {instructions.why && (
        <div style={{ background:'rgba(54,135,250,.06)', border:'1px solid rgba(54,135,250,.18)',
          borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12,
          color:TEXT_SECONDARY, lineHeight:1.6 }}>
          <strong style={{ color:'#1a5fc7' }}>Why: </strong>
          {instructions.why}
        </div>
      )}

      {(instructions.tooling || instructions.delegation) && (
        <div style={{ fontSize:12, color:TEXT_TERTIARY, lineHeight:1.6,
          marginBottom:8 }}>
          {instructions.tooling || instructions.delegation}
        </div>
      )}

      {instructions.notes && (
        <div style={{ background:'rgba(239,166,66,.07)', border:'1px solid rgba(239,166,66,.25)',
          borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12,
          color:'#7a4a00', lineHeight:1.6 }}>
          <strong>Note: </strong>{instructions.notes}
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
        <button
          onClick={() => onToggleComplete(stepKey)}
          style={{
            display:'flex', alignItems:'center', gap:6,
            background: isDone ? 'rgba(25,185,135,.1)' : SURFACE,
            border: isDone ? '1px solid rgba(25,185,135,.35)' : `1px solid ${BORDER}`,
            borderRadius:7, padding:'5px 12px', cursor:'pointer',
            fontSize:11, fontWeight:700,
            color: isDone ? '#0a7a5c' : TEXT_SECONDARY,
            fontFamily:FONT,
          }}
        >
          {isDone ? (
            <>
              <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
                <path d="M1 5l3 3 7-7" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Marked done
            </>
          ) : 'Mark complete'}
        </button>
        {onAskStep && (
          <button
            onClick={() => onAskStep(step)}
            style={{
              background:'transparent', border:'none', cursor:'pointer',
              fontSize:11, color:PURPLE, fontWeight:700, fontFamily:FONT,
              padding:'5px 8px', textDecoration:'underline', textDecorationColor:'rgba(121,72,246,.3)',
            }}
          >
            Ask Cernly
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
  issue,             // the specific issue that triggered GuidedFix (optional) — drives heading + chat context
  reportId,
  reportIntegerId,   // integer PK of the current report — needed for verify prevReportId
  pageUrl,
  workItem,
  onClose,
  onStatusChange,
  onRescan,          // handleRescan(verifyFp) from ReportClient — triggers scan + navigate + verify
  onAskCernly,
  onSwitchTab,       // (tabKey: string) => void — closes GuidedFix and switches report tab
}) {
  const [expanded, setExpanded] = useState(false);
  const [currentStep,    setCurrentStep]    = useState(0);
  const [selectedRole,   setSelectedRole]   = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [plan,           setPlan]           = useState(null);
  const [planStatus,     setPlanStatus]     = useState('idle'); // idle|loading|ready|fallback|error
  const [fallbackActions, setFallbackActions] = useState([]);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  // planFetched tracks which persona we last fetched for, so we re-fetch when
  // the user switches persona.  null = never fetched, string = last persona fetched.
  const planFetchedForPersona = useRef(null);

  // Inline chat state — null = closed, object = open for a specific step
  const [chatStep,     setChatStep]     = useState(null); // step object
  const [chatMessages, setChatMessages] = useState([]);   // { role, content }[]
  const [chatInput,    setChatInput]    = useState('');
  const [chatLoading,  setChatLoading]  = useState(false);
  const [chatError,    setChatError]    = useState(null);
  const chatInputRef = useRef(null);

  // ── restore persisted progress ────────────────────────────────────────────
  useEffect(() => {
    const progress = workItem?.guide_progress;
    if (!progress) return;
    if (progress.step != null)           setCurrentStep(progress.step);
    if (progress.role)                   setSelectedRole(progress.role);
    if (progress.completedSteps?.length) setCompletedSteps(progress.completedSteps);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch guidance plan — fires on mount and whenever persona changes ───────
  // We eagerly fetch with 'owner' on mount so the plan is often already loading
  // before the user reaches step 2.  When they pick a different persona we
  // re-fetch and the server returns from cache if it was already generated.
  useEffect(() => {
    if (!rec?.fingerprint || !reportId) return;
    const persona = selectedRole || 'owner';
    // Skip if we already fetched for this persona
    if (planFetchedForPersona.current === persona) return;
    planFetchedForPersona.current = persona;
    setPlanStatus('loading');
    setPlan(null);
    setFallbackActions([]);

    fetch('/api/guide-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recFingerprint: rec.fingerprint,
        reportId,
        persona,
        // Pass the specific issue so guidance is grounded in the selected finding
        ...(issue ? {
          focusIssue: {
            message:       issue.message       || undefined,
            fingerprintId: issue.fingerprintId || undefined,
            description:   issue.description   || undefined,
            detail:        issue.detail        || undefined,
          },
        } : {}),
      }),
    })
      .then(r => {
        if (!r.ok) {
          console.warn('[GuidedFix] guide-plan returned', r.status);
          return { _httpError: r.status };
        }
        return r.json();
      })
      .then(data => {
        if (data._httpError) {
          setFallbackActions(rec?.actions || []);
          setPlanStatus('fallback');
        } else if (data.plan) {
          setPlan(data.plan);
          setPlanStatus('ready');
        } else if (data.fallback) {
          // Bare fallback — group key not covered by static templates
          setFallbackActions(data.actions || rec?.actions || []);
          setPlanStatus('fallback');
        } else {
          setFallbackActions(rec?.actions || []);
          setPlanStatus('error');
        }
      })
      .catch(() => {
        setFallbackActions(rec?.actions || []);
        setPlanStatus('error');
      });
  // Re-run when persona changes (selectedRole) or the rec/report changes
  }, [selectedRole, rec?.fingerprint, reportId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const goTo = useCallback((idx) => {
    setCurrentStep(idx);
    persistProgress({ step: idx, role: selectedRole, completedSteps });
  }, [selectedRole, completedSteps, persistProgress]);

  const canContinue = useCallback(() => {
    if (currentStep === 1 && !selectedRole) return false;
    return true;
  }, [currentStep, selectedRole]);

  const toggleComplete = useCallback((stepKey) => {
    setCompletedSteps(prev => {
      const next = prev.includes(stepKey)
        ? prev.filter(k => k !== stepKey)
        : [...prev, stepKey];
      persistProgress({ step: currentStep, role: selectedRole, completedSteps: next });
      return next;
    });
  }, [currentStep, selectedRole, persistProgress]);

  const retryPlan = useCallback(() => {
    if (!rec?.fingerprint || !reportId) return;
    const persona = selectedRole || 'owner';
    // Reset so the effect will re-run
    planFetchedForPersona.current = null;
    setPlanStatus('loading');
    setPlan(null);
    setFallbackActions([]);

    fetch('/api/guide-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recFingerprint: rec.fingerprint,
        reportId,
        persona,
        ...(issue ? {
          focusIssue: {
            message:       issue.message       || undefined,
            fingerprintId: issue.fingerprintId || undefined,
            description:   issue.description   || undefined,
            detail:        issue.detail        || undefined,
          },
        } : {}),
      }),
    })
      .then(r => r.ok ? r.json() : { _httpError: r.status })
      .then(data => {
        planFetchedForPersona.current = persona;
        if (data._httpError) {
          setFallbackActions(rec?.actions || []);
          setPlanStatus('fallback');
        } else if (data.plan) {
          setPlan(data.plan);
          setPlanStatus('ready');
        } else if (data.fallback) {
          setFallbackActions(data.actions || rec?.actions || []);
          setPlanStatus('fallback');
        } else {
          setFallbackActions(rec?.actions || []);
          setPlanStatus('error');
        }
      })
      .catch(() => {
        setFallbackActions(rec?.actions || []);
        setPlanStatus('error');
      });
  }, [issue, selectedRole, rec?.fingerprint, rec?.actions, reportId]);

  // Open inline chat for a specific step
  const handleAskStep = useCallback((step) => {
    setChatStep(step);
    setChatMessages([]);
    setChatInput('');
    setChatError(null);
    // Focus input after next paint
    setTimeout(() => chatInputRef.current?.focus(), 80);
  }, []);

  // Send a message to /api/ask with full step context.
  // opts.elementContext — optional item object for per-element targeted questions.
  const sendChatMessage = useCallback(async (question, opts = {}) => {
    if (!question?.trim() || chatLoading) return;
    const q = question.trim();
    setChatInput('');
    setChatError(null);
    const newMessages = [...chatMessages, { role: 'user', content: q }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          reportId,
          recFingerprint: rec?.fingerprint,
          // Forward the specific issue fingerprint so /api/ask builds context grounded
          // in the selected finding, not just the parent recommendation group.
          ...(issue?.fingerprintId ? { findingFingerprintId: issue.fingerprintId } : {}),
          activeStep: chatStep,
          messages: chatMessages.slice(-6),
          ...(opts.elementContext ? { elementContext: opts.elementContext } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const answer = data.answer || 'Sorry, I couldn\'t get a response.';
      setChatMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch {
      setChatError('Could not reach the assistant — check your connection and try again.');
      setChatMessages(prev => prev.slice(0, -1)); // remove optimistic user message
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages, chatStep, issue?.fingerprintId, rec?.fingerprint, reportId]);

  const handleRescan = useCallback(() => {
    const fp = rec?.fingerprint;
    if (onRescan && typeof onRescan === 'function') {
      // Delegate to ReportClient.handleRescan(verifyFp) — this triggers the full
      // scan → navigate → auto-verify flow, including persisting user_status='verify'.
      onRescan(fp || null);
    } else {
      // Fallback: no rescan handler wired (e.g. in tests or older prop usage).
      // Mark status and close so the user can initiate rescan from the report view.
      if (onStatusChange) onStatusChange(fp, 'verify');
      onClose();
    }
  }, [onRescan, onStatusChange, rec?.fingerprint, onClose]);

  // ── derived evidence ───────────────────────────────────────────────────────
  const evidence = rec?.evidence || {};
  const perfKeys = new Set(PERF_METRICS.map(m => m.key));

  // Metrics that have actual values, sorted: poor first, then needs-work, then good
  const measuredMetrics = PERF_METRICS
    .filter(m => evidence[m.key] != null)
    .sort((a, b) => {
      const order = { poor:0, 'needs-work':1, good:2, neutral:3 };
      return (order[metricStatus(a.key, evidence[a.key])] || 3)
           - (order[metricStatus(b.key, evidence[b.key])] || 3);
    });

  // Non-perf evidence fields
  const otherEvidence = Object.entries(evidence).filter(
    ([k]) => !perfKeys.has(k) && evidence[k] != null
  );
  const primaryOtherEvidence  = otherEvidence.slice(0, 3);
  const expandedOtherEvidence = otherEvidence.slice(3);

  const catColors  = categoryColor(rec?.category);
  // hasPlan covers both AI-generated and static-fallback plans (both use planStatus==='ready')
  const hasAiPlan  = planStatus === 'ready' && plan?.steps?.length > 0;
  const plainText  = plan?.evidenceSummary || buildPlainEnglishSummary(rec) || null;

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div style={{
      position:'fixed', inset:0,
      display:'flex', alignItems:'stretch', justifyContent:'flex-end',
      zIndex:1000, fontFamily:FONT,
    }}>
      {/* Focus-visible style for icon buttons — suppresses default outline, restores on keyboard nav */}
      <style>{`.gf-icon-btn:focus-visible{outline:2px solid #7948f6;outline-offset:2px}.gf-icon-btn:hover{opacity:.8}`}</style>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position:'absolute', inset:0, background:'rgba(15,20,40,.4)', backdropFilter:'blur(2px)' }}
      />

      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position:'relative', zIndex:1,
          width:'100%', maxWidth: expanded ? 680 : 540,
          transition: 'max-width 0.2s ease',
          background: BG,
          boxShadow:'-2px 0 0 1px ' + BORDER + ', -4px 0 40px rgba(0,0,0,.12)',
          display:'flex', flexDirection:'column',
          overflowY:'hidden',
        }}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div style={{
          padding:'16px 20px 14px',
          borderBottom:`1px solid ${BORDER}`,
          flexShrink:0, background:BG,
        }}>
          {/* Top row: label + expand + close */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
            marginBottom:10 }}>
            <span style={{ fontSize:9, fontWeight:900, letterSpacing:'.15em',
              textTransform:'uppercase', color:TEXT_TERTIARY }}>
              Cernly Guided Fix
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {/* Expand / collapse the panel width — Lucide Maximize2 / Minimize2 */}
              <button
                onClick={() => setExpanded(e => !e)}
                aria-label={expanded ? 'Collapse guided fix panel' : 'Expand guided fix panel'}
                title={expanded ? 'Collapse' : 'Expand'}
                className="gf-icon-btn"
                style={{ background:SURFACE, border:`1px solid ${BORDER}`,
                  borderRadius:6, width:28, height:28, cursor:'pointer',
                  display:'grid', placeItems:'center', color:TEXT_SECONDARY,
                  outline:'none' }}
              >
                {expanded ? (
                  /* Minimize2 — arrows pointing inward */
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20"/>
                    <polyline points="20 10 14 10 14 4"/>
                    <line x1="10" y1="14" x2="3" y2="21"/>
                    <line x1="21" y1="3" x2="14" y2="10"/>
                  </svg>
                ) : (
                  /* Maximize2 — arrows pointing outward */
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"/>
                    <polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/>
                    <line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                )}
              </button>
              <button
                onClick={onClose}
                aria-label="Close guided fix"
                style={{ background:SURFACE, border:`1px solid ${BORDER}`,
                  borderRadius:6, width:28, height:28, cursor:'pointer',
                  display:'grid', placeItems:'center', color:TEXT_SECONDARY }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Issue title (specific) or rec title (group) + category badge */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:10,
            flexWrap:'wrap', marginBottom:16 }}>
            <h2 style={{ fontSize:16, fontWeight:800, color:TEXT_PRIMARY, margin:0,
              flex:'1 1 200px', lineHeight:1.3 }}>
              {issue?.message || rec?.title || 'Improve your site'}
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

          {/* Step progress */}
          <div style={{ display:'flex', gap:0 }}>
            {STEPS.map((s, i) => {
              const active = i === currentStep;
              const done   = i < currentStep;
              const lineColor = done ? PURPLE : BORDER;
              return (
                <div key={s.id} style={{ flex:1, display:'flex', flexDirection:'column',
                  alignItems:'center', gap:5 }}>
                  <div style={{ width:'100%', display:'flex', alignItems:'center' }}>
                    {i > 0 && (
                      <div style={{ flex:1, height:2, background:lineColor }}/>
                    )}
                    <div style={{
                      width:22, height:22, borderRadius:'50%', flexShrink:0,
                      background: done ? PURPLE : active ? BG : SURFACE,
                      border: done ? 'none'
                             : active ? `2px solid ${PURPLE}`
                             : `1.5px solid ${BORDER_MED}`,
                      display:'grid', placeItems:'center',
                    }}>
                      {done ? (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5l2 2 5-4" stroke="#fff" strokeWidth="1.8"
                            strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <span style={{ fontSize:9, fontWeight:800,
                          color: active ? PURPLE : TEXT_TERTIARY }}>{i+1}</span>
                      )}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ flex:1, height:2, background:lineColor }}/>
                    )}
                  </div>
                  <span style={{ fontSize:10,
                    fontWeight: active ? 800 : 600,
                    color: active ? TEXT_PRIMARY : done ? TEXT_SECONDARY : TEXT_TERTIARY }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP CONTENT ───────────────────────────────────────────────── */}
        <div style={{ flex:1, padding:'20px', overflowY:'auto' }}>

          {/* ── STEP 0: UNDERSTAND ─────────────────────────────────────────── */}
          {currentStep === 0 && (
            <div>
              <h3 style={{ fontSize:17, fontWeight:800, color:TEXT_PRIMARY, margin:'0 0 6px',
                lineHeight:1.3 }}>
                Here&rsquo;s what we found
              </h3>

              {/* Lead: plain-English interpretation */}
              {plainText && (
                <p style={{ fontSize:14, lineHeight:1.75, color:TEXT_SECONDARY,
                  margin:'0 0 16px', fontWeight:500 }}>
                  {plainText}
                </p>
              )}

              {/* Primary perf metrics — worst first */}
              {measuredMetrics.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                    textTransform:'uppercase', color:TEXT_TERTIARY, marginBottom:8 }}>
                    Measurements from your site
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {measuredMetrics.map(m => (
                      <MetricTile
                        key={m.key}
                        label={m.label}
                        title={m.title}
                        value={formatMetricValue(m.key, evidence[m.key])}
                        unit={m.key === 'cls' ? '' : 'ms'}
                        status={metricStatus(m.key, evidence[m.key])}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* what_we_found — shown if no plain text summary */}
              {!plainText && (rec?.what_we_found || rec?.explanation) && (
                <p style={{ fontSize:13, lineHeight:1.75, color:TEXT_SECONDARY,
                  margin:'0 0 14px' }}>
                  {rec.what_we_found || rec.explanation}
                </p>
              )}

              {/* Primary other evidence */}
              {primaryOtherEvidence.length > 0 && (
                <div style={{ background:SURFACE, border:`1px solid ${BORDER}`,
                  borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                    textTransform:'uppercase', color:TEXT_TERTIARY, marginBottom:10 }}>
                    Scan findings
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    {primaryOtherEvidence.map(([k, v]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between',
                        gap:8, fontSize:12, alignItems:'baseline' }}>
                        <span style={{ color:TEXT_TERTIARY, flex:'0 0 auto', maxWidth:'55%' }}>
                          {EVIDENCE_LABELS[k] || k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}
                        </span>
                        <span style={{ color:TEXT_PRIMARY, fontWeight:700, textAlign:'right' }}>
                          {Array.isArray(v) ? v.slice(0,2).join(', ')+(v.length>2?' …':'') : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Expandable additional findings */}
                  {expandedOtherEvidence.length > 0 && (
                    <>
                      {showAllEvidence && (
                        <div style={{ display:'flex', flexDirection:'column', gap:7, marginTop:7,
                          paddingTop:7, borderTop:`1px solid ${BORDER}` }}>
                          {expandedOtherEvidence.map(([k, v]) => (
                            <div key={k} style={{ display:'flex', justifyContent:'space-between',
                              gap:8, fontSize:12, alignItems:'baseline' }}>
                              <span style={{ color:TEXT_TERTIARY, flex:'0 0 auto', maxWidth:'55%' }}>
                                {EVIDENCE_LABELS[k] || k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}
                              </span>
                              <span style={{ color:TEXT_PRIMARY, fontWeight:700, textAlign:'right' }}>
                                {Array.isArray(v) ? v.slice(0,2).join(', ')+(v.length>2?' …':'') : String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setShowAllEvidence(v => !v)}
                        style={{ marginTop:8, background:'none', border:'none', padding:0,
                          fontSize:11, color:PURPLE, fontWeight:700, cursor:'pointer',
                          fontFamily:FONT }}
                      >
                        {showAllEvidence
                          ? 'Show less'
                          : `Show ${expandedOtherEvidence.length} more measurement${expandedOtherEvidence.length > 1 ? 's' : ''}`}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Affected elements — deduplicated across all supporting findings */}
              {(() => {
                const allItems = [];
                const seen = new Set();
                let totalDetected = 0;
                let firstCheckId = null;
                let firstAuditId = null;
                for (const f of (rec?.supporting_findings || [])) {
                  if (!firstCheckId && f.checkId) firstCheckId = f.checkId;
                  if (!firstAuditId && f.auditId) firstAuditId = f.auditId;
                  if (f.totalDetected) totalDetected = Math.max(totalDetected, f.totalDetected);
                  for (const item of (f.items || [])) {
                    const key = item.url || item.selector || item.snippet || JSON.stringify(item);
                    if (!seen.has(key)) { seen.add(key); allItems.push(item); }
                  }
                }
                if (!allItems.length) return null;
                return (
                  <AffectedElements
                    items={allItems}
                    totalDetected={totalDetected || allItems.length}
                    checkId={firstCheckId}
                    auditId={firstAuditId}
                    onFixElement={(item) => {
                      const name = item.label || item.selector
                        || (item.url ? item.url.split('/').pop().split('?')[0] : null)
                        || 'this element';
                      sendChatMessage(
                        `How do I fix the issue with "${name}"?`,
                        { elementContext: item },
                      );
                    }}
                  />
                );
              })()}

              {/* Why it matters */}
              {rec?.why_it_matters && (
                <div style={{ background:'rgba(54,135,250,.05)',
                  border:'1px solid rgba(54,135,250,.15)', borderRadius:10,
                  padding:'13px 15px', marginBottom:12 }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                    textTransform:'uppercase', color:'#1a5fc7', marginBottom:7 }}>
                    Why this matters
                  </div>
                  <p style={{ fontSize:13, lineHeight:1.7, color:TEXT_SECONDARY, margin:0 }}>
                    {rec.why_it_matters}
                  </p>
                </div>
              )}

              {/* No evidence fallback */}
              {measuredMetrics.length === 0 && !plainText && !rec?.what_we_found && !rec?.explanation && (
                <div style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:10,
                  padding:'13px 15px', marginBottom:12 }}>
                  <p style={{ fontSize:13, color:TEXT_TERTIARY, lineHeight:1.7, margin:0 }}>
                    This recommendation was flagged during your scan. The next step will guide
                    you through investigating and resolving it.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: PREPARE ───────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ fontSize:17, fontWeight:800, color:TEXT_PRIMARY, margin:'0 0 6px',
                lineHeight:1.3 }}>
                How do you manage this site?
              </h3>
              <p style={{ fontSize:13, lineHeight:1.7, color:TEXT_SECONDARY,
                margin:'0 0 16px' }}>
                Choose your role so we can tailor the instructions to your experience level.
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

              {rec?.actions?.length > 0 && (
                <div style={{ background:'rgba(239,166,66,.06)',
                  border:'1px solid rgba(239,166,66,.25)', borderRadius:10,
                  padding:'12px 14px' }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                    textTransform:'uppercase', color:AMBER, marginBottom:8 }}>
                    Before you begin
                  </div>
                  <ul style={{ margin:0, paddingLeft:16, color:TEXT_SECONDARY,
                    fontSize:12, lineHeight:1.7 }}>
                    <li>Back up your site or the files you plan to edit.</li>
                    <li>Use the &ldquo;Ask Cernly&rdquo; button at any step if you need context.</li>
                    {rec.actions.length > 3 && (
                      <li>This fix has {rec.actions.length} steps — you can spread them across sessions.</li>
                    )}
                  </ul>
                </div>
              )}

              {!selectedRole && (
                <p style={{ fontSize:11, color:TEXT_TERTIARY, marginTop:12, lineHeight:1.5 }}>
                  Select a role above to continue.
                </p>
              )}
            </div>
          )}

          {/* ── STEP 2: FIX ───────────────────────────────────────────────── */}
          {currentStep === 2 && (
            <div>
              <div style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', marginBottom:14 }}>
                <h3 style={{ fontSize:17, fontWeight:800, color:TEXT_PRIMARY, margin:0,
                  lineHeight:1.3 }}>
                  Step-by-step fix
                </h3>
                {selectedRole && (
                  <span style={{ fontSize:10, fontWeight:800, letterSpacing:'.06em',
                    textTransform:'uppercase', borderRadius:6, padding:'3px 8px',
                    background:SURFACE_ALT, color:PURPLE, flexShrink:0 }}>
                    {ROLES.find(r=>r.id===selectedRole)?.label || selectedRole}
                  </span>
                )}
              </div>

              {planStatus === 'loading' && (
                <Spinner label="Loading your fix plan…" />
              )}

              {hasAiPlan && (
                <>
                  {plan.evidenceSummary && (
                    <div style={{ background:SURFACE_ALT, border:`1px solid rgba(121,72,246,.15)`,
                      borderRadius:10, padding:'11px 14px', marginBottom:14, fontSize:12,
                      color:TEXT_SECONDARY, lineHeight:1.65 }}>
                      {plan.evidenceSummary}
                      {plan.planSource === 'static' && (
                        <span style={{ display:'block', marginTop:6, fontSize:10,
                          color:TEXT_TERTIARY, fontWeight:600 }}>
                          Evidence-based guidance • AI personalisation unavailable
                        </span>
                      )}
                      {plan.planSource === 'ai' && (
                        <span style={{ display:'block', marginTop:6, fontSize:10,
                          color:TEXT_TERTIARY, fontWeight:600 }}>
                          AI-personalised guidance
                        </span>
                      )}
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
                      onAskStep={handleAskStep}
                    />
                  ))}
                  {completedSteps.length > 0 && (
                    completedSteps.length === plan.steps.length ? (
                      /* All steps done — prompt to verify or view action plan */
                      <div style={{ background:'#f0faf5', border:'1px solid #bbf0d6',
                        borderRadius:10, padding:'12px 14px', marginTop:10 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#1a7a4a', marginBottom:5 }}>
                          You&apos;ve completed the guidance steps.
                        </div>
                        <p style={{ fontSize:12, color:'#2d6a4f', margin:'0 0 10px', lineHeight:1.6 }}>
                          Run a verification scan to confirm your changes are live on the site.
                          Scan allowances apply to your current plan.
                        </p>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          <button
                            onClick={() => onRescan && onRescan(rec.fingerprint)}
                            style={{ fontSize:12, fontWeight:700, background:'#1a7a4a', color:'#fff',
                              border:0, borderRadius:7, padding:'7px 14px', cursor:'pointer',
                              fontFamily:'inherit' }}>
                            Verify my changes
                          </button>
                          <button
                            onClick={() => onSwitchTab && onSwitchTab('action')}
                            style={{ fontSize:12, fontWeight:600, background:'none',
                              color:'#2d6a4f', border:'1px solid #bbf0d6', borderRadius:7,
                              padding:'7px 14px', cursor:'pointer', fontFamily:'inherit' }}>
                            View Action Plan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign:'center', padding:'8px 0',
                        fontSize:12, color:TEXT_TERTIARY }}>
                        {completedSteps.length} of {plan.steps.length} steps marked complete
                      </div>
                    )
                  )}

                </>
              )}

              {(planStatus === 'fallback' || planStatus === 'error') && (
                // This path only fires for recommendation types not yet covered
                // by the static guidance library.  Should be rare.
                <div>
                  <div style={{ background:'rgba(239,166,66,.07)',
                    border:'1px solid rgba(239,166,66,.3)', borderRadius:10,
                    padding:'11px 14px', marginBottom:14, fontSize:12,
                    color:'#7a4a00', lineHeight:1.65,
                    display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                    <span>
                      Detailed guidance is not yet available for this finding.
                      The actions identified by your scan are shown below.
                    </span>
                    <button
                      onClick={retryPlan}
                      style={{ background:'none', border:'none', color:PURPLE,
                        fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:FONT,
                        flexShrink:0, whiteSpace:'nowrap' }}
                    >
                      Retry
                    </button>
                  </div>

                  {(fallbackActions.length > 0 ? fallbackActions : (rec?.actions || [])).map((action, i) => (
                    <div key={i} style={{ background:BG, border:`1px solid ${BORDER}`,
                      borderRadius:11, padding:'13px 15px', marginBottom:9 }}>
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                        <span style={{ width:22, height:22, borderRadius:6, flexShrink:0,
                          background:SURFACE_ALT, border:`1.5px solid rgba(121,72,246,.3)`,
                          display:'grid', placeItems:'center',
                          fontSize:10, fontWeight:800, color:PURPLE }}>
                          {i+1}
                        </span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:TEXT_PRIMARY,
                            marginBottom:3, lineHeight:1.3 }}>
                            {action.title || action}
                          </div>
                          {action.description && (
                            <div style={{ fontSize:12, color:TEXT_SECONDARY, lineHeight:1.65 }}>
                              {action.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(fallbackActions.length === 0 && !rec?.actions?.length) && (
                    <div style={{ background:SURFACE, border:`1px solid ${BORDER}`,
                      borderRadius:10, padding:'13px 15px' }}>
                      <p style={{ fontSize:13, color:TEXT_SECONDARY, lineHeight:1.7, margin:0 }}>
                        The scan did not capture specific actions for this finding.
                        Use Ask Cernly to get tailored guidance.
                      </p>
                      <button
                        onClick={() => handleAskStep({ title: rec?.title || 'This finding', owner: { action: rec?.what_we_found || rec?.explanation || '' } })}
                        style={{ marginTop:10, background:GRAD, border:'none', borderRadius:8,
                          color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer',
                          padding:'8px 16px', fontFamily:FONT }}
                      >
                        Ask Cernly about this →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Inline Ask Cernly chat panel ─────────────────────────────
                  Rendered outside hasAiPlan so it works from both the normal
                  step list AND the fallback/error path's "Ask Cernly" button. */}
              {chatStep && (
                <InlineChatPanel
                  step={chatStep}
                  messages={chatMessages}
                  input={chatInput}
                  loading={chatLoading}
                  error={chatError}
                  inputRef={chatInputRef}
                  onInputChange={setChatInput}
                  onSend={sendChatMessage}
                  onClose={() => { setChatStep(null); setChatMessages([]); setChatInput(''); setChatError(null); }}
                />
              )}
            </div>
          )}

          {/* ── STEP 3: VERIFY ────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ fontSize:17, fontWeight:800, color:TEXT_PRIMARY, margin:'0 0 6px',
                lineHeight:1.3 }}>
                Verify your fix
              </h3>
              <p style={{ fontSize:13, lineHeight:1.75, color:TEXT_SECONDARY,
                margin:'0 0 16px' }}>
                A rescan measures the same signals as your original audit. Here&rsquo;s what
                to look for after you&rsquo;ve deployed your changes.
              </p>

              <div style={{ background:'rgba(25,185,135,.05)',
                border:'1px solid rgba(25,185,135,.2)', borderRadius:12,
                padding:'13px 15px', marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                  textTransform:'uppercase', color:GREEN, marginBottom:10 }}>
                  What success looks like
                </div>
                {measuredMetrics.length > 0 ? (
                  <ul style={{ margin:0, paddingLeft:16,
                    color:TEXT_SECONDARY, fontSize:12, lineHeight:1.8 }}>
                    {measuredMetrics.map(m => {
                      const rawVal = evidence[m.key];
                      const normVal = normaliseMetricValue(m.key, rawVal);
                      const display = formatMetricValue(m.key, rawVal);
                      const unit    = m.key === 'cls' ? '' : ' ms';
                      const target  = m.key === 'lcp'  ? '< 2,500 ms'
                                    : m.key === 'fcp'  ? '< 1,800 ms'
                                    : m.key === 'tbt'  ? '< 200 ms'
                                    : m.key === 'cls'  ? '< 0.1'
                                    : m.key === 'ttfb' ? '< 800 ms'
                                    : m.key === 'si'   ? '< 3,400 ms'
                                    : null;
                      return target ? (
                        <li key={m.key}>
                          <strong style={{ color:TEXT_PRIMARY }}>{m.title}</strong>
                          {' '}should move from{' '}
                          <strong style={{ color:RED }}>{display}{unit}</strong>
                          {' '}toward{' '}
                          <strong style={{ color:GREEN }}>{target}</strong>
                        </li>
                      ) : null;
                    }).filter(Boolean)}
                  </ul>
                ) : (
                  <p style={{ fontSize:12, color:TEXT_SECONDARY, lineHeight:1.7, margin:0 }}>
                    After making your changes, run a new scan and check whether
                    this recommendation still appears in the results.
                  </p>
                )}
              </div>

              <div style={{ background:SURFACE, border:`1px solid ${BORDER}`,
                borderRadius:12, padding:'13px 15px', marginBottom:20 }}>
                <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em',
                  textTransform:'uppercase', color:TEXT_TERTIARY, marginBottom:12 }}>
                  Reading your results
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { dot: GREEN, label:'Observed improvement',   desc:'Metrics improved — your change had a measurable effect.' },
                    { dot: BLUE,  label:'Likely resolved',        desc:'Issue no longer flagged; confirm with a second scan.' },
                    { dot: AMBER, label:'Persistent issue',       desc:"Scores didn't change enough. Review the fix steps." },
                    { dot: RED,   label:'Unable to verify',       desc:'Evidence is inconclusive — check your changes are deployed.' },
                  ].map(r => (
                    <div key={r.label} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%',
                        background:r.dot, flexShrink:0, marginTop:4 }}/>
                      <div>
                        <span style={{ fontSize:12, fontWeight:700, color:TEXT_PRIMARY }}>{r.label}: </span>
                        <span style={{ fontSize:12, color:TEXT_SECONDARY, lineHeight:1.6 }}>{r.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRescan}
                style={{
                  width:'100%', padding:'14px',
                  background: GRAD, border:'none', borderRadius:12,
                  color:'#fff', fontSize:14, fontWeight:800,
                  cursor:'pointer', fontFamily:FONT, marginBottom:10,
                  boxShadow:'0 4px 20px rgba(121,72,246,.35)',
                }}
              >
                I&rsquo;ve made changes — run a new scan →
              </button>
              <p style={{ fontSize:11, color:TEXT_TERTIARY, textAlign:'center',
                margin:0, lineHeight:1.5 }}>
                A rescan measures the live page — make sure your changes are deployed first.
              </p>
            </div>
          )}
        </div>

        {/* ── FOOTER: Back / Continue ─────────────────────────────────────── */}
        <div style={{
          padding:'14px 20px',
          borderTop:`1px solid ${BORDER}`,
          display:'flex', gap:10,
          flexShrink:0,
          background:SURFACE,
        }}>
          {currentStep > 0 && (
            <button
              onClick={() => goTo(currentStep - 1)}
              style={{
                flex:1, padding:'11px',
                background:BG, border:`1px solid ${BORDER_MED}`,
                borderRadius:10, color:TEXT_SECONDARY, fontSize:13,
                fontWeight:700, cursor:'pointer', fontFamily:FONT,
              }}
            >
              ← Back
            </button>
          )}
          {currentStep < STEPS.length - 1 && (
            <button
              onClick={() => canContinue() && goTo(currentStep + 1)}
              disabled={!canContinue()}
              aria-disabled={!canContinue()}
              style={{
                flex:2, padding:'11px',
                background: canContinue() ? GRAD : BORDER,
                border:'none', borderRadius:10,
                color: canContinue() ? '#fff' : TEXT_TERTIARY,
                fontSize:13, fontWeight:800,
                cursor: canContinue() ? 'pointer' : 'not-allowed',
                fontFamily:FONT,
                boxShadow: canContinue() ? '0 3px 12px rgba(121,72,246,.3)' : 'none',
                transition:'all .15s',
              }}
            >
              Continue →
            </button>
          )}
          {currentStep === STEPS.length - 1 && (
            <button
              onClick={onClose}
              style={{
                flex:2, padding:'11px',
                background:BG, border:`1px solid ${BORDER_MED}`,
                borderRadius:10, color:TEXT_SECONDARY,
                fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT,
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
