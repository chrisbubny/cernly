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

/**
 * SVG line chart showing score over time for a selected category.
 * scanHistory is newest-first; chart displays oldest→newest left→right.
 */
function ScoreTrendChart({ scanHistory, slug, id }) {
  // Reverse to chronological order — computed before hooks so early return is safe
  const scans = [...(scanHistory || [])].reverse();

  // Hooks must come before any early return (Rules of Hooks)
  const [selectedCat, setSelectedCat] = useState('performance');

  if (scans.length < 2) return null;

  // Determine which categories have at least two data points
  const CAT_DEFS = [
    { key: 'performance',   label: 'Performance', short: 'Perf', color: '#7948f6' },
    { key: 'seo',           label: 'SEO',          short: 'SEO',  color: '#19b987' },
    { key: 'security',      label: 'Security',     short: 'Sec',  color: '#ef6473' },
    { key: 'accessibility', label: 'A11y',         short: 'A11y', color: '#efa642' },
    { key: 'ux',            label: 'UX',           short: 'UX',   color: '#3b82f6' },
  ].filter(c => scans.filter(s => s.scores?.[c.key] != null).length >= 2);

  if (CAT_DEFS.length === 0) return null;

  // Ensure selectedCat is valid
  const activeCat = CAT_DEFS.find(c => c.key === selectedCat) || CAT_DEFS[0];

  // Chart geometry
  const W = 500, H = 150;
  const PAD = { top: 18, right: 16, bottom: 28, left: 28 };
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

  return (
    <div style={{
      background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
      padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{
          fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
          fontWeight: 800, fontSize: 13, color: '#151621',
        }}>
          Score Trends
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {CAT_DEFS.map(c => (
            <button key={c.key} onClick={() => setSelectedCat(c.key)} style={{
              padding: '3px 10px', fontSize: 10, fontWeight: 700,
              border: `1.5px solid ${selectedCat === c.key ? c.color : '#e9eaf2'}`,
              borderRadius: 20,
              background: selectedCat === c.key ? c.color + '18' : 'transparent',
              color: selectedCat === c.key ? c.color : '#83899c',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}>
              {c.short}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}
          aria-label={`${activeCat.label} score over time`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeCat.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={activeCat.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {/* Horizontal grid */}
            {gridLines.map(v => {
              const y = chartH - (v / 100) * chartH;
              return (
                <g key={v}>
                  <line x1={0} y1={y} x2={chartW} y2={y}
                    stroke="#f0f1f8" strokeWidth={1} />
                  <text x={-5} y={y + 3.5} fontSize={7.5} fill="#b0b4c8"
                    textAnchor="end" fontFamily="system-ui, sans-serif">
                    {v}
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill={`url(#${gradId})`} />

            {/* Line */}
            <path d={linePath} fill="none" stroke={activeCat.color}
              strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />

            {/* Dots + labels */}
            {pts.map((p, i) => {
              if (p.y == null) return null;
              const isFirst = i === 0;
              const isLast  = i === pts.length - 1;
              const showDate = scans.length <= 4 || isFirst || isLast;
              const dateStr  = new Date(p.date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              });

              return (
                <g key={i}>
                  {/* Score label above dot */}
                  <text
                    x={p.x} y={p.y - 8}
                    fontSize={8.5} fill={activeCat.color}
                    textAnchor="middle" fontWeight="700"
                    fontFamily="system-ui, sans-serif"
                  >
                    {p.value}
                  </text>
                  {/* Dot */}
                  <circle
                    cx={p.x} cy={p.y}
                    r={p.isCurrent ? 5.5 : 4}
                    fill={p.isCurrent ? activeCat.color : '#fff'}
                    stroke={activeCat.color} strokeWidth={2}
                  />
                  {/* Date label */}
                  {showDate && (
                    <text
                      x={p.x} y={chartH + 18}
                      fontSize={7.5} fill="#b0b4c8"
                      textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                      fontFamily="system-ui, sans-serif"
                    >
                      {dateStr}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div style={{ fontSize: 10, color: '#b0b4c8', marginTop: 6 }}>
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

  let action = null;

  // 1. New high-priority critical findings — investigate first
  if (recs.new_high_priority.length > 0) {
    const r = recs.new_high_priority[0].rec;
    action = {
      icon: '⚠',
      color: '#c0192d',
      bg: '#fff1f3',
      border: '#fcc9d0',
      headline: 'New high-priority issue detected',
      body: `"${r.title}" appeared since your last scan. Investigate this before continuing other fixes.`,
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 2. Improvement confirmed + more open items → acknowledge + next
  else if (recs.likely_resolved.length > 0 && recs.still_open.length > 0) {
    const resolvedNames = recs.likely_resolved.slice(0, 2)
      .map(m => `"${m.rec.title}"`).join(' and ');
    const next = recs.still_open[0]?.rec;
    action = {
      icon: '↑',
      color: '#0f7a50',
      bg: '#edfaf5',
      border: '#b6efdb',
      headline: `${recs.likely_resolved.length} fix${recs.likely_resolved.length > 1 ? 'es' : ''} verified — keep going`,
      body: next
        ? `${resolvedNames} no longer detected. Next highest-priority issue: "${next.title}".`
        : `${resolvedNames} no longer detected. Continue working through your Action Plan.`,
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 3. Verification incomplete — new findings since last scan (but no rec match)
  else if (findings.new_since.length > 0) {
    action = {
      icon: '!',
      color: '#c0192d',
      bg: '#fff1f3',
      border: '#fcc9d0',
      headline: `${findings.new_since.length} new finding${findings.new_since.length > 1 ? 's' : ''} detected`,
      body: 'New issues appeared since your last scan. Review your Action Plan to see what changed.',
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 4. No change, open issues remain → continue top priority
  else if (recs.still_open.length > 0 && recs.likely_resolved.length === 0) {
    const next = recs.still_open[0]?.rec;
    action = {
      icon: '→',
      color: '#7948f6',
      bg: '#f4f0ff',
      border: '#c4aff8',
      headline: 'No verified improvements yet',
      body: next
        ? `Continue working on your highest-priority fix: "${next.title}".`
        : 'Continue working through your open items in the Action Plan.',
      cta: 'View Action Plan',
      onCta: () => onSwitchTab('action'),
    };
  }

  // 5. Unable to verify — retry suggestion
  else if (recs.unable_to_verify.length > 0 && recs.still_open.length === 0 && recs.likely_resolved.length === 0) {
    action = {
      icon: '?',
      color: '#83899c',
      bg: '#f5f6fb',
      border: '#e9eaf2',
      headline: 'Verification incomplete',
      body: 'Some fixes could not be verified because an audit did not complete. Try rescanning when the site is fully accessible.',
      cta: null, onCta: null,
    };
  }

  // 6. All issues appear resolved
  else if (recs.likely_resolved.length > 0 && recs.still_open.length === 0 && recs.unable_to_verify.length === 0) {
    action = {
      icon: '✓',
      color: '#0f7a50',
      bg: '#edfaf5',
      border: '#b6efdb',
      headline: 'All tracked issues appear resolved',
      body: 'Great work! Rescan regularly to catch any new issues that may emerge.',
      cta: null, onCta: null,
    };
  }

  if (!action) return null;

  return (
    <div style={{
      background: action.bg, border: `1px solid ${action.border}`,
      borderRadius: 14, padding: '16px 18px', marginBottom: 16,
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: action.color + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 800, color: action.color,
        fontFamily: 'system-ui, sans-serif',
      }}>
        {action.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
          fontWeight: 800, fontSize: 13, color: action.color, marginBottom: 4,
        }}>
          {action.headline}
        </div>
        <div style={{ fontSize: 12, color: '#4a5068', lineHeight: 1.55 }}>
          {action.body}
        </div>
        {action.cta && (
          <button onClick={action.onCta} style={{
            marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5,
            background: action.color, color: '#fff',
            border: 0, borderRadius: 8, fontWeight: 700, fontSize: 11,
            padding: '6px 13px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {action.cta}
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Comparison results banner (prominent after rescan) ──────────────────────

function RescanBanner({ comparison, fromRescan, prevScan }) {
  if (!comparison?.isComparable || !fromRescan) return null;

  const recs     = comparison.recommendations;
  const findings = comparison.findings;
  const c        = comparison;

  const resolvedCount = recs.likely_resolved.length;
  const openCount     = recs.still_open.length + recs.partially_resolved.length;
  const newCount      = recs.new_high_priority.length + findings.new_since.length;
  const unverified    = recs.unable_to_verify.length;

  const improved  = Object.values(c.scoreDelta).filter(d => d.direction === 'improved' && d.significance !== 'noise');
  const regressed = Object.values(c.scoreDelta).filter(d => d.direction === 'regressed' && d.significance !== 'noise');

  const hasDelta = improved.length + regressed.length > 0;

  return (
    <div style={{
      background: '#f4f0ff', border: '1.5px solid #c4aff8',
      borderRadius: 14, padding: '18px 20px', marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{
        fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
        fontWeight: 800, fontSize: 14, color: '#3d2a8a', marginBottom: 12,
      }}>
        Rescan Results
      </div>

      {/* Stat row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: hasDelta ? 12 : 0 }}>
        {resolvedCount > 0 && (
          <StatChip
            value={resolvedCount}
            label={`likely fixed`}
            bg="#edfaf5" border="#b6efdb" color="#0f7a50" />
        )}
        {openCount > 0 && (
          <StatChip
            value={openCount}
            label={`still present`}
            bg="#fff1f3" border="#fcc9d0" color="#c0192d" />
        )}
        {newCount > 0 && (
          <StatChip
            value={newCount}
            label={`newly detected`}
            bg="#fff8f0" border="#f5d9b0" color="#8a5a00" />
        )}
        {unverified > 0 && (
          <StatChip
            value={unverified}
            label={`couldn't verify`}
            bg="#f5f6fb" border="#e9eaf2" color="#83899c" />
        )}
        {resolvedCount === 0 && openCount === 0 && newCount === 0 && unverified === 0 && (
          <span style={{ fontSize: 13, color: '#5b4b8a' }}>
            {c.summary}
          </span>
        )}
      </div>

      {/* Score delta chips */}
      {hasDelta && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {['performance', 'seo', 'security', 'accessibility', 'ux'].map(cat => {
            const d = c.scoreDelta[cat];
            if (!d || d.delta == null || d.significance === 'noise') return null;
            const up       = d.direction === 'improved';
            const chipBg   = up ? '#edfaf5' : '#fff1f3';
            const chipBdr  = up ? '#b6efdb' : '#fcc9d0';
            const chipClr  = up ? '#0f7a50' : '#c0192d';
            const sign     = d.delta > 0 ? '+' : '';
            const lbl      = { performance: 'Perf', seo: 'SEO', security: 'Sec', accessibility: 'A11y', ux: 'UX' }[cat] || cat;
            return (
              <div key={cat} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
                background: chipBg, border: `1px solid ${chipBdr}`, borderRadius: 20, fontSize: 11,
              }}>
                <span style={{ fontWeight: 700, color: chipClr }}>
                  {d.delta > 0 ? '↑' : '↓'} {sign}{d.delta}
                </span>
                <span style={{ color: '#83899c' }}>{lbl}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Variability caveat */}
      {hasDelta && (
        <div style={{ fontSize: 10, color: '#83899c', marginTop: 8, lineHeight: 1.5 }}>
          Score changes are observed differences, not verified improvements.
          Performance scores can naturally vary ±8 points between identical scans.
        </div>
      )}

      {/* Verification limitations */}
      {c.verificationLimitations.length > 0 && (
        <div style={{
          marginTop: 10, padding: '8px 12px',
          background: '#fffbf0', border: '1px solid #ffe4a0',
          borderRadius: 8, fontSize: 11, color: '#7a5800',
        }}>
          {c.verificationLimitations[0]}
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

  const totalItems =
    recs.likely_resolved.length + recs.still_open.length +
    recs.partially_resolved.length + recs.unable_to_verify.length +
    findings.new_since.length + recs.new_high_priority.length;

  if (totalItems === 0) return null;

  const SectionLabel = ({ color, icon, label, count }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: '#b0b4c8', fontWeight: 600 }}>{count}</span>
    </div>
  );

  const RecRow = ({ title, category, note, borderColor }) => (
    <div style={{
      padding: '9px 13px',
      borderLeft: `3px solid ${borderColor}`,
      background: '#fafbff',
      borderRadius: '0 8px 8px 0',
      marginBottom: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#151621' }}>{title}</div>
      {category && <div style={{ fontSize: 10, color: '#83899c', marginTop: 2 }}>{category}</div>}
      {note && <div style={{ fontSize: 11, color: '#83899c', marginTop: 3, fontStyle: 'italic' }}>{note}</div>}
    </div>
  );

  return (
    <div style={{
      background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
      padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
        fontWeight: 800, fontSize: 13, color: '#151621', marginBottom: 14,
      }}>
        Fix Verification
      </div>

      {/* Likely resolved */}
      {recs.likely_resolved.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel color="#0f7a50" icon="✓" label="Likely resolved" count={recs.likely_resolved.length} />
          {recs.likely_resolved.map((m, i) => (
            <RecRow key={i} title={m.rec.title} category={m.rec.category}
              note={`All ${m.total} supporting ${m.total === 1 ? 'finding' : 'findings'} absent in successful audit`}
              borderColor="#19b987" />
          ))}
        </div>
      )}

      {/* Partially resolved */}
      {recs.partially_resolved.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel color="#7a5800" icon="◑" label="Partially addressed" count={recs.partially_resolved.length} />
          {recs.partially_resolved.map((m, i) => (
            <RecRow key={i} title={m.rec.title} category={m.rec.category}
              note={`${m.resolvedFindings} of ${m.total} findings resolved${m.unverifiableFindings > 0 ? `; ${m.unverifiableFindings} could not be verified` : ''}`}
              borderColor="#efa642" />
          ))}
        </div>
      )}

      {/* Still open */}
      {recs.still_open.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel color="#c0192d" icon="•" label="Still present" count={recs.still_open.length} />
          {recs.still_open.map((m, i) => (
            <RecRow key={i} title={m.rec.title} category={m.rec.category}
              note={m.note || null} borderColor="#ef6473" />
          ))}
        </div>
      )}

      {/* Unable to verify */}
      {recs.unable_to_verify.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel color="#83899c" icon="?" label="Unable to verify" count={recs.unable_to_verify.length} />
          {recs.unable_to_verify.map((m, i) => (
            <RecRow key={i} title={m.rec.title} category={m.rec.category}
              note={m.reason} borderColor="#c8ccd8" />
          ))}
        </div>
      )}

      {/* New high-priority recs */}
      {recs.new_high_priority.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel color="#c0192d" icon="!" label="New high-priority issues" count={recs.new_high_priority.length} />
          {recs.new_high_priority.map((m, i) => (
            <RecRow key={i} title={m.rec.title} category={m.rec.category}
              note="Appeared since last scan — see Action Plan" borderColor="#ef6473" />
          ))}
        </div>
      )}

      {/* Finding-level new issues (when no rec-level new) */}
      {findings.new_since.length > 0 && recs.new_high_priority.length === 0 && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel color="#c0192d" icon="!" label="New findings detected" count={findings.new_since.length} />
          {findings.new_since.slice(0, 5).map((m, i) => (
            <RecRow key={i}
              title={m.issue?.message || m.fingerprintId}
              category={m.issue?.category}
              note={`Severity: ${m.issue?.severity || 'unknown'}`}
              borderColor="#ef6473" />
          ))}
        </div>
      )}

      {/* CTA */}
      <button onClick={() => onSwitchTab('action')} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 2,
        background: 'none', border: '1.5px solid #c9bcf7', borderRadius: 9,
        color: '#7948f6', fontWeight: 700, fontSize: 12,
        padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        View full Action Plan
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

// ─── Overview section (baseline selector + score chips, when not fromRescan) ──

function OverviewSection({ comparison, comparisonScans, selectedPrevIdx, setSelectedPrevIdx }) {
  if (comparisonScans === null || comparisonScans === 'loading') {
    return (
      <div style={{
        background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
        padding: '18px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
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

  const improved  = Object.entries(c.scoreDelta).filter(([, d]) => d.direction === 'improved' && d.significance !== 'noise');
  const regressed = Object.entries(c.scoreDelta).filter(([, d]) => d.direction === 'regressed' && d.significance !== 'noise');

  return (
    <div style={{
      background: '#fff', border: '1px solid #e9eaf2',
      borderRadius: 14, padding: '18px 20px', marginBottom: 16,
    }}>
      {/* Summary + baseline selector */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div style={{
          fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
          fontWeight: 800, fontSize: 13, color: '#151621', flex: 1,
        }}>
          {c.summary}
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
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {['performance', 'seo', 'security', 'accessibility', 'ux'].map(cat => {
          const d = c.scoreDelta[cat];
          if (!d || d.delta == null) return null;
          const isNoise   = d.significance === 'noise';
          const isUp      = d.direction === 'improved';
          const isDown    = d.direction === 'regressed';
          const chipBg    = isNoise ? '#f5f6fb' : isUp ? '#edfaf5' : isDown ? '#fff1f3' : '#f5f6fb';
          const chipBdr   = isNoise ? '#e9eaf2' : isUp ? '#b6efdb' : isDown ? '#fcc9d0' : '#e9eaf2';
          const chipClr   = isNoise ? '#83899c' : isUp ? '#0f7a50' : isDown ? '#c0192d' : '#83899c';
          const sign      = d.delta > 0 ? '+' : '';
          const lbl       = { performance: 'Perf', seo: 'SEO', security: 'Sec', accessibility: 'A11y', ux: 'UX' }[cat] || cat;
          return (
            <div key={cat} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
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

      {/* Caveat */}
      {(improved.length > 0 || regressed.length > 0) && (
        <div style={{ fontSize: 10, color: '#83899c', marginTop: 8, lineHeight: 1.5 }}>
          Score changes are observed differences, not verified improvements.
          Performance scores can naturally vary ±8 points between identical scans.
        </div>
      )}

      {/* Verification limitations */}
      {c.verificationLimitations.length > 0 && (
        <div style={{
          marginTop: 10, padding: '7px 11px',
          background: '#fffbf0', border: '1px solid #ffe4a0',
          borderRadius: 8, fontSize: 11, color: '#7a5800',
        }}>
          {c.verificationLimitations[0]}
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
              Cernly needs at least two comparable scans to show progress. Scan this site again to begin tracking changes.
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
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
              background: isCurrent ? '#f4f0ff' : '#fff',
              border: `1px solid ${isCurrent ? '#c4aff8' : '#e9eaf2'}`,
              borderRadius: 12, padding: '11px 15px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              {/* Scan number */}
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: isCurrent ? '#7948f6' : '#f0f1f8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: isCurrent ? '#fff' : '#83899c' }}>
                  {scanHistory.length - i}
                </span>
              </div>

              {/* Date + current badge */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#151621' }}>
                  {date}{' '}
                  <span style={{ fontWeight: 500, color: '#83899c' }}>at {time}</span>
                  {isCurrent && (
                    <span style={{
                      marginLeft: 7, fontSize: 10, fontWeight: 800,
                      background: '#7948f6', color: '#fff',
                      borderRadius: 20, padding: '2px 7px', verticalAlign: 'middle',
                    }}>
                      Current
                    </span>
                  )}
                </div>
              </div>

              {/* Score tiles */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {[
                  ['Perf', s.scores?.performance ?? null],
                  ['SEO',  s.scores?.seo          ?? null],
                  ['Sec',  s.scores?.security      ?? null],
                  ['A11y', s.scores?.accessibility ?? null],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ textAlign: 'center', minWidth: 32 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: scoreColor(val) }}>
                      {val ?? '—'}
                    </div>
                    <div style={{ fontSize: 9, color: '#b0b4c8', fontWeight: 600 }}>{lbl}</div>
                  </div>
                ))}
              </div>

              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                stroke="#b0b4c8" strokeWidth={2} strokeLinecap="round">
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

/**
 * @param {object} props
 * @param {string}  props.domain
 * @param {string}  props.slug          current report slug
 * @param {string|number} props.id      current report id
 * @param {object}  props.report        full report object
 * @param {Array|null} props.scanHistory  slim scan list (null = loading)
 * @param {Array|null|'loading'} props.comparisonScans  enriched scan list
 * @param {number}  props.selectedPrevIdx
 * @param {function} props.setSelectedPrevIdx
 * @param {function} props.onRescan     = handleRescan()
 * @param {function} props.onSwitchTab  = setActiveTab
 * @param {boolean} props.fromRescan    URL param ?from=rescan
 * @param {string|null} props.verifyFp  URL param ?verify=<fp>
 */
export default function ProgressTab({
  domain, slug, id, report,
  scanHistory, comparisonScans, selectedPrevIdx, setSelectedPrevIdx,
  onRescan, onSwitchTab, fromRescan, verifyFp,
}) {
  const scans         = Array.isArray(comparisonScans) ? comparisonScans : [];
  const currScan      = scans[0] || null;
  const prevScan      = scans[selectedPrevIdx] || null;
  const hasMultiScans = scans.length >= 2;

  // Enrich current scan with full report data (comparison endpoint has slim data)
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

  const scansLoaded       = Array.isArray(comparisonScans);
  const hasScans          = Array.isArray(scanHistory) && scanHistory.length > 0;
  const showSingleScan    = scansLoaded && scans.length < 2 && hasScans;

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 20,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
            fontWeight: 800, fontSize: 16, color: '#151621',
          }}>
            Progress
          </div>
          <div style={{ fontSize: 12, color: '#83899c', marginTop: 3 }}>
            Scan history for <strong>{domain}</strong>
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
          background: '#f4f0ff', border: '1px solid #c4aff8',
          borderRadius: 14, padding: '18px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#5b4b8a', marginBottom: 4 }}>
              Make your first improvement, then rescan to see what changed.
            </div>
            <div style={{ fontSize: 12, color: '#83899c' }}>
              Cernly will compare scans and show you exactly what improved.
            </div>
          </div>
          <button onClick={() => onRescan()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px',
            background: '#7948f6', color: '#fff', border: 0, borderRadius: 10,
            fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}>
            Rescan
          </button>
        </div>
      )}

      {/* Multi-scan content */}
      {!showSingleScan && (
        <>
          {/* Rescan results banner — prominent when arriving from a rescan */}
          {fromRescan && liveComparison && hasMultiScans && (
            <RescanBanner
              comparison={liveComparison}
              fromRescan={fromRescan}
              prevScan={prevScan}
            />
          )}

          {/* Overview (baseline selector + score chips) — shown when NOT fromRescan */}
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

          {/* Recommended next action */}
          {liveComparison && hasMultiScans && (
            <NextAction comparison={liveComparison} onSwitchTab={onSwitchTab} />
          )}

          {/* Fix verification detail */}
          {liveComparison && hasMultiScans && (
            <FixVerification comparison={liveComparison} onSwitchTab={onSwitchTab} />
          )}
        </>
      )}

      {/* All scans section header */}
      <div style={{
        fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
        fontWeight: 700, fontSize: 12, color: '#83899c',
        marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>
        All scans
      </div>

      <ScanHistoryList scanHistory={scanHistory} slug={slug} id={id} />
    </div>
  );
}
