'use client';

/**
 * ProgressTab — Progress tab rendering for the report page.
 *
 * Receives all data and handlers as props from ReportClient; no internal
 * data fetching. Renders:
 *   1. Rescan Results banner (when fromRescan=true)
 *   2. Score trend chart (when ≥2 scans in scanHistory)
 *   3. Next recommended action (from comparison engine)
 *   4. Fix verification detail (from comparison engine)
 *   5. Scan history list
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { compareScans } from '@/lib/comparison';

// ─── Shared micro-components ────────────────────────────────────────────────

const Spinner = () => (
  <div style={{
    width: 14, height: 14,
    border: '2px solid #e9eaf2', borderTopColor: '#7948f6',
    borderRadius: '50%',
    animation: 'spin .7s linear infinite',
    flexShrink: 0,
  }} />
);

const scoreColor = s =>
  s == null ? '#b0b4c8' : s >= 80 ? '#19b987' : s >= 60 ? '#efa642' : '#ef6473';

// ─── Score trend chart ───────────────────────────────────────────────────────

const CAT_DEFS_ALL = [
  { key: 'performance',   label: 'Performance', short: 'Perf', color: '#7948f6' },
  { key: 'seo',           label: 'SEO',          short: 'SEO',  color: '#19b987' },
  { key: 'security',      label: 'Security',     short: 'Sec',  color: '#ef6473' },
  { key: 'accessibility', label: 'A11y',         short: 'A11y', color: '#efa642' },
  { key: 'ux',            label: 'UX',           short: 'UX',   color: '#3b82f6' },
];

/**
 * SVG line chart showing score over time for a selected category.
 * scanHistory is newest-first; chart displays oldest→newest left→right.
 */
function ScoreTrendChart({ scanHistory, slug, id }) {
  // Reverse to chronological order — computed before hooks so early return is safe
  const scans = [...(scanHistory || [])].reverse();

  // Hooks must come before any early return (Rules of Hooks)
  const [selectedCat, setSelectedCat] = useState('performance');
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (scans.length < 2) return null;

  const CAT_DEFS = CAT_DEFS_ALL.filter(
    c => scans.filter(s => s.scores?.[c.key] != null).length >= 2
  );
  if (CAT_DEFS.length === 0) return null;

  const activeCat = CAT_DEFS.find(c => c.key === selectedCat) || CAT_DEFS[0];

  // Current score + delta summary
  const curr = scans[scans.length - 1];
  const prev = scans[scans.length - 2];
  const currScore = curr?.scores?.[activeCat.key];
  const prevScore = prev?.scores?.[activeCat.key];
  const delta     = (currScore != null && prevScore != null) ? currScore - prevScore : null;

  // Chart geometry — tall enough to read comfortably
  const W = 800, H = 260;
  const PAD = { top: 28, right: 20, bottom: 36, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const pts = scans.map((s, i) => {
    const val = s.scores?.[activeCat.key];
    return {
      x: scans.length <= 1 ? chartW / 2 : (i / (scans.length - 1)) * chartW,
      y: val != null ? chartH - (val / 100) * chartH : null,
      value: val,
      date: s.createdAt,
      isCurrent: s.slug === slug || String(s.id) === String(id),
      idx: i,
    };
  });

  const valid = pts.filter(p => p.y != null);
  if (valid.length < 2) return null;

  const linePath = `M ${valid[0].x} ${valid[0].y} ` +
    valid.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

  const areaPath =
    `M ${valid[0].x} ${chartH} L ${valid[0].x} ${valid[0].y} ` +
    valid.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') +
    ` L ${valid[valid.length - 1].x} ${chartH} Z`;

  const gridLines = [0, 25, 50, 75, 100];
  const gradId = `grad-${activeCat.key}`;

  // Smart date labels: group same-date scans, avoid crowding
  const formatDate = (dateStr, includeTime = false) => {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!includeTime) return datePart;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Determine which points get a date label (avoid crowding)
  const minSpacing = chartW / Math.max(scans.length - 1, 1);
  const showDateLabel = (i) => {
    if (scans.length <= 4) return true;
    if (i === 0 || i === pts.length - 1) return true;
    // Show label every ~100px equivalent
    return minSpacing >= 80 || (i % Math.ceil(80 / minSpacing) === 0);
  };

  const hovered = hoveredIdx != null ? pts[hoveredIdx] : null;

  return (
    <div style={{
      background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
      padding: '20px 22px 16px', marginBottom: 16,
    }}>
      {/* Header row: title + category selector */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 16, flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
            fontWeight: 800, fontSize: 13, color: '#151621', marginBottom: 4,
          }}>
            Score Trends
          </div>
          {/* Metric summary */}
          {currScore != null && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontSize: 28, fontWeight: 800, color: scoreColor(currScore), lineHeight: 1,
                fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
              }}>
                {currScore}
              </span>
              <span style={{ fontSize: 11, color: '#83899c' }}>Current score</span>
              {delta != null && Math.abs(delta) > 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: delta > 0 ? '#0f7a50' : '#c0192d',
                  background: delta > 0 ? '#edfaf5' : '#fff1f3',
                  border: `1px solid ${delta > 0 ? '#b6efdb' : '#fcc9d0'}`,
                  borderRadius: 20, padding: '2px 8px',
                }}>
                  {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} from last scan
                </span>
              )}
              {delta === 0 && (
                <span style={{ fontSize: 11, color: '#83899c' }}>Unchanged from last scan</span>
              )}
            </div>
          )}
        </div>

        {/* Category selector */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
          {CAT_DEFS.map(c => (
            <button key={c.key} onClick={() => setSelectedCat(c.key)} style={{
              padding: '4px 11px', fontSize: 11, fontWeight: 700,
              border: `1.5px solid ${selectedCat === c.key ? c.color : '#e9eaf2'}`,
              borderRadius: 20,
              background: selectedCat === c.key ? c.color + '15' : 'transparent',
              color: selectedCat === c.key ? c.color : '#83899c',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}>
              {c.short}
            </button>
          ))}
        </div>
      </div>

      {/* Chart — fills full width, no maxWidth cap */}
      <div style={{ width: '100%', position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          aria-label={`${activeCat.label} score over time`}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeCat.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={activeCat.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {/* Horizontal grid lines */}
            {gridLines.map(v => {
              const y = chartH - (v / 100) * chartH;
              return (
                <g key={v}>
                  <line x1={0} y1={y} x2={chartW} y2={y}
                    stroke={v === 0 ? '#e9eaf2' : '#f0f1f7'} strokeWidth={v === 0 ? 1.5 : 1} />
                  <text x={-8} y={y + 4} fontSize={10} fill="#b0b4c8"
                    textAnchor="end" fontFamily="system-ui, sans-serif" fontWeight="600">
                    {v}
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill={`url(#${gradId})`} />

            {/* Line */}
            <path d={linePath} fill="none" stroke={activeCat.color}
              strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

            {/* Hover hit areas (invisible wider targets) */}
            {pts.map((p, i) => p.y == null ? null : (
              <rect
                key={`hit-${i}`}
                x={p.x - Math.min(chartW / pts.length / 2, 40)}
                y={0} width={Math.min(chartW / pts.length, 80)} height={chartH}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(i)}
              />
            ))}

            {/* Dots + score labels */}
            {pts.map((p, i) => {
              if (p.y == null) return null;
              const isHovered = hoveredIdx === i;
              const r = p.isCurrent ? 6 : isHovered ? 5 : 4;
              return (
                <g key={i}>
                  {/* Score label above dot */}
                  <text
                    x={p.x} y={p.y - 11}
                    fontSize={11} fill={activeCat.color}
                    textAnchor="middle" fontWeight="800"
                    fontFamily="system-ui, sans-serif"
                  >
                    {p.value}
                  </text>
                  {/* Dot */}
                  <circle
                    cx={p.x} cy={p.y} r={r}
                    fill={p.isCurrent ? activeCat.color : '#fff'}
                    stroke={activeCat.color}
                    strokeWidth={p.isCurrent ? 0 : 2.2}
                  />
                  {/* Date label — smart spacing */}
                  {showDateLabel(i) && (
                    <text
                      x={p.x} y={chartH + 22}
                      fontSize={10} fill="#83899c"
                      textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}
                      fontFamily="system-ui, sans-serif"
                    >
                      {formatDate(p.date)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Tooltip */}
            {hovered && hovered.y != null && (() => {
              const tx = hovered.x;
              const ty = hovered.y;
              const ttW = 130, ttH = 36;
              const ttX = Math.min(tx - ttW / 2, chartW - ttW);
              const ttY = ty - ttH - 12;
              const dateStr = formatDate(hovered.date);
              const timeStr = formatDate(hovered.date, true);
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={ttX} y={ttY} width={ttW} height={ttH}
                    rx={6} fill="#151621" fillOpacity="0.9" />
                  <text x={ttX + ttW / 2} y={ttY + 14} fontSize={10}
                    fill="#e0e4ee" textAnchor="middle"
                    fontFamily="system-ui, sans-serif">
                    {dateStr} · {timeStr}
                  </text>
                  <circle cx={ttX + 14} cy={ttY + 24} r={3.5}
                    fill={activeCat.color} />
                  <text x={ttX + 22} y={ttY + 27} fontSize={10}
                    fill="#fff" textAnchor="start"
                    fontFamily="system-ui, sans-serif" fontWeight="700">
                    {activeCat.short} {hovered.value}
                  </text>
                </g>
              );
            })()}
          </g>
        </svg>
      </div>

      <div style={{ fontSize: 10, color: '#c8ccd8', marginTop: 4 }}>
        Filled dot = current scan
      </div>
    </div>
  );
}

// ─── Next recommended action ─────────────────────────────────────────────────

function NextAction({ comparison, onSwitchTab }) {
  if (!comparison?.isComparable) return null;

  const recs     = comparison.recommendations;
  const findings = comparison.findings;
  const limited  = comparison.comparabilityLevel === 'limited';

  let action = null;

  // 1. New high-priority critical findings
  if (recs.new_high_priority.length > 0) {
    const r = recs.new_high_priority[0].rec;
    action = {
      severity: 'high',
      color: '#c0192d',
      bg: '#fff5f6',
      border: '#fcc9d0',
      label: limited ? 'Untracked high-priority issue' : 'New high-priority issue',
      title: r.title,
      reason: limited
        ? 'This issue appears in the current scan with no previous tracking record. Comparison accuracy is limited — review your Action Plan for current priorities.'
        : 'This issue appeared since your last scan. Investigate this before continuing other fixes.',
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 2. Improvements confirmed + more open items
  else if (recs.likely_resolved.length > 0 && recs.still_open.length > 0) {
    const next = recs.still_open[0]?.rec;
    const resolvedNames = recs.likely_resolved.slice(0, 2).map(m => `"${m.rec.title}"`).join(' and ');
    action = {
      severity: 'good',
      color: '#0f7a50',
      bg: '#f0fdf6',
      border: '#b6efdb',
      label: `${recs.likely_resolved.length} fix${recs.likely_resolved.length > 1 ? 'es' : ''} verified`,
      title: next?.title || 'Continue your Action Plan',
      reason: `${resolvedNames} ${recs.likely_resolved.length > 1 ? 'are' : 'is'} no longer detected. Continue with your next highest-priority item.`,
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 3. New finding-level issues (no rec match)
  else if (findings.new_since.length > 0) {
    action = {
      severity: 'high',
      color: '#c0192d',
      bg: '#fff5f6',
      border: '#fcc9d0',
      label: `${findings.new_since.length} new finding${findings.new_since.length > 1 ? 's' : ''} detected`,
      title: 'Review your Action Plan',
      reason: 'New issues appeared since your last scan.',
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 4. No change, open issues remain
  else if (recs.still_open.length > 0 && recs.likely_resolved.length === 0) {
    const next = recs.still_open[0]?.rec;
    action = {
      severity: 'neutral',
      color: '#7948f6',
      bg: '#f9f7ff',
      border: '#d4c6f8',
      label: 'Continue improvements',
      title: next?.title || 'Work through your open items',
      reason: next
        ? 'Your highest-priority open fix. Continue working through your Action Plan.'
        : 'Continue working through your open items in the Action Plan.',
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 5. Unable to verify
  else if (recs.unable_to_verify.length > 0 && recs.still_open.length === 0 && recs.likely_resolved.length === 0) {
    action = {
      severity: 'neutral',
      color: '#83899c',
      bg: '#f5f6fb',
      border: '#e9eaf2',
      label: 'Verification incomplete',
      title: 'Rescan when site is fully accessible',
      reason: 'Some fixes could not be verified because an audit did not complete.',
      cta: null, onCta: null,
    };
  }

  // 6. All resolved
  else if (recs.likely_resolved.length > 0 && recs.still_open.length === 0 && recs.unable_to_verify.length === 0) {
    action = {
      severity: 'good',
      color: '#0f7a50',
      bg: '#f0fdf6',
      border: '#b6efdb',
      label: 'All tracked issues appear resolved',
      title: 'Rescan regularly to catch new issues',
      reason: 'Great work! Cernly will alert you if new issues emerge.',
      cta: null, onCta: null,
    };
  }

  if (!action) return null;

  const dotColor = {
    high:    '#c0192d',
    good:    '#0f7a50',
    neutral: '#7948f6',
  }[action.severity] || '#83899c';

  return (
    <div style={{
      background: action.bg, border: `1px solid ${action.border}`,
      borderRadius: 14, padding: '16px 18px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: dotColor,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 800, color: dotColor,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {action.label}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
        fontWeight: 800, fontSize: 14, color: '#151621', marginBottom: 5, lineHeight: 1.35,
      }}>
        {action.title}
      </div>
      <div style={{ fontSize: 12, color: '#5b607c', lineHeight: 1.6, marginBottom: action.cta ? 12 : 0 }}>
        {action.reason}
      </div>
      {action.cta && (
        <button onClick={action.onCta} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: action.color, color: '#fff',
          border: 0, borderRadius: 8, fontWeight: 700, fontSize: 11,
          padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {action.cta}
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Comparison results banner (prominent after rescan) ──────────────────────

function RescanBanner({ comparison, fromRescan }) {
  if (!comparison?.isComparable || !fromRescan) return null;

  const recs     = comparison.recommendations;
  const findings = comparison.findings;
  const c        = comparison;
  const limited  = c.comparabilityLevel === 'limited';

  const resolvedCount = recs.likely_resolved.length;
  const openCount     = recs.still_open.length + recs.partially_resolved.length;
  const newCount      = recs.new_high_priority.length + findings.new_since.length;
  const unverified    = recs.unable_to_verify.length;

  const improved  = Object.values(c.scoreDelta).filter(d => d.direction === 'improved'  && d.significance !== 'noise');
  const regressed = Object.values(c.scoreDelta).filter(d => d.direction === 'regressed' && d.significance !== 'noise');
  const hasDelta  = improved.length + regressed.length > 0;

  return (
    <div style={{
      background: '#f4f0ff', border: '1.5px solid #c4aff8',
      borderRadius: 14, padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
        fontWeight: 800, fontSize: 14, color: '#3d2a8a', marginBottom: 12,
      }}>
        Rescan Results
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: hasDelta ? 12 : 0 }}>
        {resolvedCount > 0 && <StatChip value={resolvedCount} label="likely fixed"     bg="#edfaf5" border="#b6efdb" color="#0f7a50" />}
        {openCount     > 0 && <StatChip value={openCount}     label="still present"    bg="#fff1f3" border="#fcc9d0" color="#c0192d" />}
        {newCount      > 0 && <StatChip value={newCount}      label={limited ? "untracked" : "newly detected"} bg="#fff8f0" border="#f5d9b0" color="#8a5a00" />}
        {unverified    > 0 && <StatChip value={unverified}    label="couldn't verify"  bg="#f5f6fb" border="#e9eaf2" color="#83899c" />}
        {resolvedCount === 0 && openCount === 0 && newCount === 0 && unverified === 0 && (
          <span style={{ fontSize: 13, color: '#5b4b8a' }}>{c.summary}</span>
        )}
      </div>

      {hasDelta && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
          {['performance', 'seo', 'security', 'accessibility', 'ux'].map(cat => {
            const d = c.scoreDelta[cat];
            if (!d || d.delta == null || d.significance === 'noise') return null;
            const up    = d.direction === 'improved';
            const sign  = d.delta > 0 ? '+' : '';
            const lbl   = { performance: 'Perf', seo: 'SEO', security: 'Sec', accessibility: 'A11y', ux: 'UX' }[cat] || cat;
            return (
              <div key={cat} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px',
                background: up ? '#edfaf5' : '#fff1f3',
                border: `1px solid ${up ? '#b6efdb' : '#fcc9d0'}`, borderRadius: 20, fontSize: 11,
              }}>
                <span style={{ fontWeight: 700, color: up ? '#0f7a50' : '#c0192d' }}>
                  {d.delta > 0 ? '↑' : '↓'} {sign}{d.delta}
                </span>
                <span style={{ color: '#83899c' }}>{lbl}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Single caveat notice */}
      {(hasDelta || limited || c.verificationLimitations.length > 0) && (
        <div style={{ fontSize: 11, color: '#83899c', lineHeight: 1.55 }}>
          {limited
            ? 'Comparison accuracy is limited — audit status metadata was absent from one or both scans.'
            : hasDelta
              ? 'Score changes are observed differences. Performance can vary ±8 points between identical scans.'
              : c.verificationLimitations[0]}
        </div>
      )}
    </div>
  );
}

function StatChip({ value, label, bg, border, color }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px',
      background: bg, border: `1px solid ${border}`, borderRadius: 20,
    }}>
      <span style={{ fontWeight: 800, fontSize: 15, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: '#5b607c' }}>{label}</span>
    </div>
  );
}

// ─── Fix verification detail ─────────────────────────────────────────────────

function FixVerification({ comparison, onSwitchTab }) {
  if (!comparison?.isComparable) return null;

  const c    = comparison;
  const recs = c.recommendations;
  const findings = c.findings;
  const limited  = c.comparabilityLevel === 'limited';

  const totalItems =
    recs.likely_resolved.length + recs.still_open.length +
    recs.partially_resolved.length + recs.unable_to_verify.length +
    findings.new_since.length + recs.new_high_priority.length;

  if (totalItems === 0) return null;

  const SectionHeader = ({ color, label, count }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      marginBottom: 6, paddingBottom: 6,
      borderBottom: '1px solid #f0f1f7',
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color, flex: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, color: '#fff',
        background: color, borderRadius: 20, padding: '1px 7px',
      }}>
        {count}
      </span>
    </div>
  );

  const RecRow = ({ title, category, note, accentColor, actionLabel, onAction }) => (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 0',
      borderBottom: '1px solid #f5f6fb',
    }}>
      <div style={{
        width: 3, flexShrink: 0, alignSelf: 'stretch',
        background: accentColor, borderRadius: 2, marginTop: 2,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#151621', lineHeight: 1.4 }}>{title}</div>
        {category && (
          <div style={{ fontSize: 10, color: '#b0b4c8', marginTop: 2, textTransform: 'capitalize' }}>{category}</div>
        )}
        {note && (
          <div style={{ fontSize: 11, color: '#83899c', marginTop: 3 }}>{note}</div>
        )}
      </div>
      {actionLabel && onAction && (
        <button onClick={onAction} style={{
          flexShrink: 0, fontSize: 10, fontWeight: 700, color: accentColor,
          background: 'none', border: `1px solid ${accentColor}30`,
          borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  );

  return (
    <div style={{
      background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
      padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{
          fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
          fontWeight: 800, fontSize: 13, color: '#151621',
        }}>
          Fix Verification
        </div>
        <button onClick={() => onSwitchTab('action')} style={{
          fontSize: 11, fontWeight: 700, color: '#7948f6',
          background: 'none', border: '1px solid #c9bcf7',
          borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          View Action Plan →
        </button>
      </div>

      {/* Likely resolved */}
      {recs.likely_resolved.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader color="#19b987" label="Likely resolved" count={recs.likely_resolved.length} />
          {recs.likely_resolved.map((m, i) => (
            <RecRow key={i}
              title={m.rec.title} category={m.rec.category}
              note={`${m.total} supporting ${m.total === 1 ? 'finding' : 'findings'} absent in current scan`}
              accentColor="#19b987" />
          ))}
        </div>
      )}

      {/* Partially resolved */}
      {recs.partially_resolved.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader color="#efa642" label="Partially addressed" count={recs.partially_resolved.length} />
          {recs.partially_resolved.map((m, i) => (
            <RecRow key={i}
              title={m.rec.title} category={m.rec.category}
              note={`${m.resolvedFindings} of ${m.total} findings resolved`}
              accentColor="#efa642" />
          ))}
        </div>
      )}

      {/* Still open */}
      {recs.still_open.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader color="#ef6473" label="Still present" count={recs.still_open.length} />
          {recs.still_open.map((m, i) => (
            <RecRow key={i}
              title={m.rec.title} category={m.rec.category}
              note={m.note || null}
              accentColor="#ef6473"
              actionLabel="Fix →" onAction={() => onSwitchTab('action')} />
          ))}
        </div>
      )}

      {/* Unable to verify */}
      {recs.unable_to_verify.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader color="#b0b4c8" label="Unable to verify" count={recs.unable_to_verify.length} />
          {recs.unable_to_verify.map((m, i) => (
            <RecRow key={i}
              title={m.rec.title} category={m.rec.category}
              note="Relevant audit did not complete — rescan to verify"
              accentColor="#c8ccd8" />
          ))}
        </div>
      )}

      {/* New high-priority recs */}
      {recs.new_high_priority.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader
            color="#ef6473"
            label={limited ? 'Untracked high-priority issues' : 'New high-priority issues'}
            count={recs.new_high_priority.length} />
          {limited && (
            <div style={{
              fontSize: 11, color: '#83899c', marginBottom: 8, lineHeight: 1.55,
            }}>
              These appear in the current scan with no prior tracking record.
              Limited audit data means &ldquo;new&rdquo; cannot be confirmed — they may have been present before.
            </div>
          )}
          {recs.new_high_priority.map((m, i) => (
            <RecRow key={i}
              title={m.rec.title} category={m.rec.category}
              accentColor="#ef6473"
              actionLabel="Fix →" onAction={() => onSwitchTab('action')} />
          ))}
        </div>
      )}

      {/* Finding-level new (when no rec-level new) */}
      {findings.new_since.length > 0 && recs.new_high_priority.length === 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionHeader color="#ef6473" label="New findings" count={findings.new_since.length} />
          {findings.new_since.slice(0, 5).map((m, i) => (
            <RecRow key={i}
              title={m.issue?.message || m.fingerprintId}
              category={m.issue?.category}
              note={m.issue?.severity ? `Severity: ${m.issue.severity}` : null}
              accentColor="#ef6473" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Overview section (baseline selector + score chips) ──────────────────────

function OverviewSection({ comparison, comparisonScans, selectedPrevIdx, setSelectedPrevIdx }) {
  if (comparisonScans === null || comparisonScans === 'loading') {
    return (
      <div style={{
        background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
        padding: '16px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Spinner />
        <span style={{ fontSize: 13, color: '#83899c' }}>Loading comparison data…</span>
      </div>
    );
  }

  const scans = Array.isArray(comparisonScans) ? comparisonScans : [];
  if (scans.length < 2) return null;

  const c = comparison;
  if (!c || !c.isComparable) {
    return (
      <div style={{
        background: '#fff8f0', border: '1px solid #f5d9b0',
        borderRadius: 14, padding: '14px 18px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, color: '#8a5a00', fontWeight: 600 }}>
          {c?.incompatibilityReason || 'These scans cannot be compared.'}
        </div>
      </div>
    );
  }

  const limited   = c.comparabilityLevel === 'limited';
  const improved  = Object.entries(c.scoreDelta).filter(([, d]) => d.direction === 'improved'  && d.significance !== 'noise');
  const regressed = Object.entries(c.scoreDelta).filter(([, d]) => d.direction === 'regressed' && d.significance !== 'noise');
  const hasDelta  = improved.length + regressed.length > 0;

  // Build a concise plain-language summary, without repeating caveat text
  const buildSummary = () => {
    const recs = c.recommendations;
    const newCount = recs.new_high_priority.length;
    const resolved = recs.likely_resolved.length;
    const open     = recs.still_open.length + recs.partially_resolved.length;

    if (newCount > 0 && limited) {
      return `${newCount} high-priority ${newCount === 1 ? 'issue' : 'issues'} found with no prior record. Review your Action Plan.`;
    }
    if (newCount > 0) {
      return `${newCount} new high-priority ${newCount === 1 ? 'issue has' : 'issues have'} appeared since your last scan.`;
    }
    if (resolved > 0 && open === 0) {
      return `${resolved} ${resolved === 1 ? 'fix has' : 'fixes have'} been verified. All tracked issues appear resolved.`;
    }
    if (resolved > 0 && open > 0) {
      return `${resolved} ${resolved === 1 ? 'fix' : 'fixes'} verified. ${open} ${open === 1 ? 'issue' : 'issues'} still open.`;
    }
    if (open > 0) {
      return `${open} tracked ${open === 1 ? 'issue' : 'issues'} remain open from your last scan.`;
    }
    return c.summary || 'No significant changes detected between scans.';
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid #e9eaf2',
      borderRadius: 14, padding: '16px 20px', marginBottom: 16,
    }}>
      {/* Summary + baseline selector */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginBottom: hasDelta ? 12 : 0, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: '#2d3248', lineHeight: 1.5,
          }}>
            {buildSummary()}
          </div>
          {/* Single caveat — only once */}
          {(limited || c.verificationLimitations.length > 0) && (
            <div style={{
              fontSize: 11, color: '#83899c', marginTop: 5, lineHeight: 1.5,
            }}>
              {limited
                ? 'Comparison accuracy is limited — audit status metadata was absent from one or both scans.'
                : c.verificationLimitations[0]}
            </div>
          )}
        </div>
        {scans.length > 2 && (
          <select
            value={selectedPrevIdx}
            onChange={e => setSelectedPrevIdx(Number(e.target.value))}
            style={{
              fontSize: 11, color: '#5b4b8a', background: '#f4f0ff',
              border: '1px solid #c4aff8', borderRadius: 8,
              padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}>
            {scans.slice(1).map((s, i) => {
              const d = new Date(s.createdAt).toLocaleDateString('en-US',
                { month: 'short', day: 'numeric', year: 'numeric' });
              return <option key={s.slug || s.id} value={i + 1}>vs {d}</option>;
            })}
          </select>
        )}
      </div>

      {/* Score delta chips */}
      {hasDelta && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
          {['performance', 'seo', 'security', 'accessibility', 'ux'].map(cat => {
            const d = c.scoreDelta[cat];
            if (!d || d.delta == null) return null;
            const isNoise = d.significance === 'noise';
            const isUp    = d.direction === 'improved';
            const isDown  = d.direction === 'regressed';
            const chipBg  = isNoise ? '#f5f6fb' : isUp ? '#edfaf5' : isDown ? '#fff1f3' : '#f5f6fb';
            const chipBdr = isNoise ? '#e9eaf2' : isUp ? '#b6efdb' : isDown ? '#fcc9d0' : '#e9eaf2';
            const chipClr = isNoise ? '#83899c' : isUp ? '#0f7a50' : isDown ? '#c0192d' : '#83899c';
            const sign    = d.delta > 0 ? '+' : '';
            const lbl     = { performance: 'Perf', seo: 'SEO', security: 'Sec', accessibility: 'A11y', ux: 'UX' }[cat] || cat;
            return (
              <div key={cat} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px',
                background: chipBg, border: `1px solid ${chipBdr}`, borderRadius: 20, fontSize: 11,
              }}>
                <span style={{ fontWeight: 700, color: chipClr }}>
                  {!isNoise && (d.delta > 0 ? '↑' : '↓')} {sign}{d.delta}
                </span>
                <span style={{ color: '#83899c' }}>{lbl}</span>
                {isNoise && <span style={{ color: '#b0b4c8', fontSize: 10 }}>≈</span>}
              </div>
            );
          })}
        </div>
      )}

      {hasDelta && (
        <div style={{ fontSize: 10, color: '#b0b4c8', lineHeight: 1.5 }}>
          Score changes are observed differences. Performance can vary ±8 points between identical scans.
        </div>
      )}
    </div>
  );
}

// ─── Scan history list ───────────────────────────────────────────────────────

function ScanHistoryList({ scanHistory, slug, id }) {
  const loading = scanHistory === null;
  const empty   = Array.isArray(scanHistory) && scanHistory.length === 0;

  if (loading || empty) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #e9eaf2',
        borderRadius: 14, padding: '24px 20px', textAlign: 'center',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#83899c' }}>
            <Spinner />
            <span style={{ fontSize: 13 }}>Loading history…</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#151621', marginBottom: 5 }}>
              No previous scans found
            </div>
            <div style={{ fontSize: 12, color: '#83899c' }}>
              Scan this site again to start tracking changes.
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {scanHistory.map((s, i) => {
        const isCurrent = s.slug === slug || String(s.id) === String(id);
        const date = new Date(s.createdAt).toLocaleDateString('en-US',
          { month: 'short', day: 'numeric', year: 'numeric' });
        const time = new Date(s.createdAt).toLocaleTimeString('en-US',
          { hour: 'numeric', minute: '2-digit' });

        return (
          <Link key={s.slug || s.id} href={`/report/${s.slug || s.id}`}
            style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              background: isCurrent ? '#f9f7ff' : '#fff',
              border: `1px solid ${isCurrent ? '#c4aff8' : '#e9eaf2'}`,
              borderRadius: 12, padding: '11px 15px',
              display: 'flex', alignItems: 'center', gap: 12,
              transition: 'border-color 0.15s',
            }}>
              {/* Scan number */}
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: isCurrent ? '#7948f6' : '#f0f1f8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: isCurrent ? '#fff' : '#83899c' }}>
                  {scanHistory.length - i}
                </span>
              </div>

              {/* Date */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#151621' }}>
                  {date}
                  <span style={{ fontWeight: 400, color: '#83899c' }}> at {time}</span>
                  {isCurrent && (
                    <span style={{
                      marginLeft: 7, fontSize: 9, fontWeight: 800,
                      background: '#7948f6', color: '#fff',
                      borderRadius: 20, padding: '2px 7px', verticalAlign: 'middle',
                    }}>
                      Current
                    </span>
                  )}
                </div>
              </div>

              {/* Score tiles */}
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                {[
                  ['Perf', s.scores?.performance ?? null],
                  ['SEO',  s.scores?.seo          ?? null],
                  ['Sec',  s.scores?.security      ?? null],
                  ['A11y', s.scores?.accessibility ?? null],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: scoreColor(val), lineHeight: 1.2 }}>
                      {val ?? '—'}
                    </div>
                    <div style={{ fontSize: 9, color: '#b0b4c8', fontWeight: 600 }}>{lbl}</div>
                  </div>
                ))}
              </div>

              <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
                stroke="#c8ccd8" strokeWidth={2} strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function ProgressTab({
  domain, slug, id, report,
  scanHistory, comparisonScans, selectedPrevIdx, setSelectedPrevIdx,
  onRescan, onSwitchTab, fromRescan, verifyFp,
}) {
  const scans         = Array.isArray(comparisonScans) ? comparisonScans : [];
  const currScan      = scans[0] || null;
  const prevScan      = scans[selectedPrevIdx] || null;
  const hasMultiScans = scans.length >= 2;

  const enrichedCurr = currScan && report
    ? {
        ...currScan,
        issues:          report.issues          || currScan.issues,
        auditStatuses:   report.auditStatuses   || currScan.auditStatuses || {},
        recommendations: report.recommendations || currScan.recommendations,
      }
    : currScan;

  let liveComparison = null;
  if (enrichedCurr && prevScan) {
    try { liveComparison = compareScans(prevScan, enrichedCurr); } catch { liveComparison = null; }
  }

  const scansLoaded    = Array.isArray(comparisonScans);
  const hasScans       = Array.isArray(scanHistory) && scanHistory.length > 0;
  const showSingleScan = scansLoaded && scans.length < 2 && hasScans;

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 22,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
            fontWeight: 800, fontSize: 17, color: '#151621',
          }}>
            Progress
          </div>
          <div style={{ fontSize: 12, color: '#83899c', marginTop: 3 }}>
            Scan history for <strong style={{ color: '#4a5068' }}>{domain}</strong>
          </div>
        </div>
        <button onClick={() => onRescan()} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px',
          background: '#7948f6', color: '#fff', border: 0, borderRadius: 10,
          fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Scan again
        </button>
      </div>

      {/* Single-scan empty state */}
      {showSingleScan && (
        <div style={{
          background: '#f9f7ff', border: '1px solid #c4aff8',
          borderRadius: 14, padding: '20px 22px', marginBottom: 18,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#4a3a8a', marginBottom: 5 }}>
            Make your first improvement, then rescan to track progress.
          </div>
          <div style={{ fontSize: 12, color: '#83899c', marginBottom: 14 }}>
            Cernly will compare scans and show you exactly what changed.
          </div>
          <button onClick={() => onRescan()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px',
            background: '#7948f6', color: '#fff', border: 0, borderRadius: 9,
            fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Rescan now
          </button>
        </div>
      )}

      {/* Multi-scan content */}
      {!showSingleScan && (
        <>
          {/* Rescan results banner */}
          {fromRescan && liveComparison && hasMultiScans && (
            <RescanBanner comparison={liveComparison} fromRescan={fromRescan} />
          )}

          {/* Overview — when not arriving from rescan */}
          {!fromRescan && (
            <OverviewSection
              comparison={liveComparison}
              comparisonScans={comparisonScans}
              selectedPrevIdx={selectedPrevIdx}
              setSelectedPrevIdx={setSelectedPrevIdx}
            />
          )}

          {/* Score trend chart */}
          {Array.isArray(scanHistory) && scanHistory.length >= 2 && (
            <ScoreTrendChart scanHistory={scanHistory} slug={slug} id={id} />
          )}

          {/* Next recommended action */}
          {liveComparison && hasMultiScans && (
            <NextAction comparison={liveComparison} onSwitchTab={onSwitchTab} />
          )}

          {/* Fix verification detail */}
          {liveComparison && hasMultiScans && (
            <FixVerification comparison={liveComparison} onSwitchTab={onSwitchTab} />
          )}
        </>
      )}

      {/* All Scans */}
      <div style={{
        fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
        fontWeight: 700, fontSize: 11, color: '#a0a6bc',
        marginBottom: 8, marginTop: 8,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        All Scans
      </div>

      <ScanHistoryList scanHistory={scanHistory} slug={slug} id={id} />
    </div>
  );
}
