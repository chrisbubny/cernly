'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { compareScans } from '@/lib/comparison';
import GuidedFix from './GuidedFix';
import AffectedElements from './AffectedElements';
import ProgressTab from './ProgressTab';
import AskMarkdown from './AskMarkdown';

/* ─── SVG stroke attrs ─── */
const sa = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

/* ─── Cernly logo mark ─── */
const LogoMark = ({ size = 29 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size}
    viewBox="195 175 895 875" xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block', color: '#151621', flexShrink: 0 }}>
    <path d="M210.88,597.17c-1.92.12-3.93-.58-4.48-1.24s-.97-3.06-.76-3.98c11.39-48.88,50.84-84.6,92.76-109.56,22.3-13.27,43.7-26.1,64.87-41.11,52.4-37.15,79.11-75.36,113.03-127.89l22.43-34.73c32.23-45.08,77.97-78.01,131.24-93.68,1.22-.36,3.93.09,4.54.91,4.51,6.07,2.51,50.21,1.38,67.19-3.77,56.96-14.7,113.18-38.87,164.93-13.55,29-31.57,54.3-54.59,76.43-27.97,26.89-60.01,47.21-96.52,60.57-21.05,7.7-41.49,13.71-63.62,18.52-56.54,12.3-113.27,20.1-171.42,23.65Z" fill="currentColor"/>
    <path d="M1075.29,597.22c-31.29-1.76-60.75-5.23-91.32-10.14-37.13-5.96-73.16-12.14-109.51-21.48-27.2-6.99-52.73-16.08-77.11-30.07-33.58-19.26-62.54-45.19-85.19-76.57-48.6-67.35-61.22-165.28-63.01-246.88l.74-24.19c.05-1.52,3.3-3.46,5.17-2.9,53.27,15.99,99.4,48.96,131.58,94.27l22.01,34.17c13.38,20.77,26.25,40.89,41.62,60.34,22.14,28.03,47.79,51.58,77.4,71.53l58.53,36.52c42.76,26.68,80.77,59.15,93.2,109.88.25,1.03.24,2.45.06,3.15-.23.87-2.89,2.45-4.15,2.38Z" fill="currentColor"/>
    <path d="M797.68,922.67c-32.2,56.52-79.76,98.45-142.12,117.91-2.48.77-5.89-.81-6-3.3l-1.25-29.38c.14-35.36,2.94-69.78,8.88-104.64,13.49-79.23,45.35-148.57,105.28-202.8,48.34-43.74,98.6-62.82,162.34-73.88,48.62-8.44,96.94-12.45,146.2-14.26,3.25-.12,7.35-.34,8.71,2.82-6.63,31.45-27.79,62.34-51.1,84.47-14.25,13.53-29.63,24.26-46.24,34.8l-57.5,36.51c-60.34,41.66-91.74,89.48-127.22,151.75Z" fill="currentColor"/>
    <path d="M514.03,962.58c-12.71-15.68-22.44-31.35-32.26-48.38-33.85-58.7-64.66-101.62-121.01-140.94l-53.53-34.47c-14.35-9.24-27.95-18.02-40.98-29.06-21.42-18.16-38.67-39.75-50.78-65.11-4.26-8.93-11.63-27.71-9.12-30.62.57-.66,2.66-1.41,3.76-1.35,48.35,2.7,95.64,7.89,143.41,15.64,62.11,10.07,110.39,25.7,159.44,65.72,46.02,37.55,79.42,86.64,97.86,143.16,20.51,62.84,24.72,132.93,23.74,198.93-.02,1.03-1.13,3.48-1.92,4.05-.95.69-3.35.77-5,.24-44.69-14.26-83.75-41-113.6-77.81Z" fill="currentColor"/>
  </svg>
);

/* ─── Score tile — clickable when onClick provided ─── */
function ScoreTile({ score, label, onClick }) {
  const color = score == null ? '#83899c' : score >= 80 ? '#19b987' : score >= 60 ? '#efa642' : '#ef6473';
  const isNull = score == null;
  return (
    <button onClick={onClick}
      style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
        padding: '20px 14px', textAlign: 'center', boxShadow: '0 2px 8px #1b1d3205',
        cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit',
        transition: 'box-shadow .15s, transform .12s',
        ':hover': onClick ? { boxShadow: '0 4px 16px #1b1d3212' } : {} }}>
      <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
        fontSize: 42, lineHeight: 1, color, marginBottom: 6 }}>{isNull ? '—' : score}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#83899c', letterSpacing: '.04em' }}>{label}</div>
      {onClick && !isNull && (
        <div style={{ fontSize: 9, color: '#b0b4c8', marginTop: 4, fontWeight: 600 }}>View findings →</div>
      )}
    </button>
  );
}

/* ─── Impact badge ─── */
function ImpactBadge({ level }) {
  const s = { high: { bg: '#fff4e5', color: '#d97706' }, medium: { bg: '#f1edff', color: '#7948f6' }, low: { bg: '#f0fdf4', color: '#16a34a' } };
  const k = level?.toLowerCase();
  const c = s[k] || s.medium;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em',
      padding: '3px 8px', borderRadius: 6, background: c.bg, color: c.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {k === 'high' ? 'HIGH IMPACT' : k === 'low' ? 'LOW IMPACT' : 'MEDIUM IMPACT'}
    </span>
  );
}

/* ─── Severity dot ─── */
function SevDot({ sev }) {
  const c = { critical: '#ef6473', warning: '#efa642', info: '#b0b4c8', good: '#19b987' };
  return <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5, background: c[sev] || c.info }} />;
}

/* ─── Finding row — expandable ─── */
function FindingRow({ issue, rec, onGuide }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(issue.fix); // description always visible; only expand for fix guide
  const sev = issue.severity;
  const sevStyle = {
    critical: { bg: '#fff0f2', color: '#ef6473', label: 'Critical' },
    warning:  { bg: '#fff8ed', color: '#d97706', label: 'Warning' },
    good:     { bg: '#edf9f4', color: '#19b987', label: 'Passed' },
    info:     { bg: '#f4f5fb', color: '#83899c', label: 'Info' },
  }[sev] || { bg: '#f4f5fb', color: '#83899c', label: 'Info' };

  const cleanDesc = (str) => str?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') || '';

  return (
    <div style={{ borderBottom: '1px solid #f0f1f8' }}>
      <button onClick={() => hasDetail && setOpen(o => !o)}
        style={{ width: '100%', background: '#fff', border: 0, textAlign: 'left',
          padding: '13px 18px', display: 'flex', alignItems: 'flex-start', gap: 11,
          cursor: hasDetail ? 'pointer' : 'default', fontFamily: 'inherit' }}>
        <SevDot sev={sev} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#151621', lineHeight: 1.45 }}>{issue.message}</div>
          {issue.displayValue && (
            <div style={{ fontSize: 11, color: '#83899c', marginTop: 2, fontFamily: 'monospace' }}>{issue.displayValue}</div>
          )}
          {(issue.description || issue.detail) && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5, lineHeight: 1.6,
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {cleanDesc(issue.description || issue.detail)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, marginTop: 1 }}>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
            background: sevStyle.bg, color: sevStyle.color }}>{sevStyle.label}</span>
          {hasDetail && (
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#b0b4c8" strokeWidth={2.5} strokeLinecap="round">
              <path d={open ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'}/>
            </svg>
          )}
        </div>
      </button>
      {open && hasDetail && (
        <div style={{ padding: '4px 18px 16px 37px' }}>
          <div style={{ background: '#f7f4ff', borderRadius: 10, padding: '11px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#7948f6',
              marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.08em' }}>How to fix</div>
            <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.65 }}>{cleanDesc(issue.fix)}</p>
          </div>
        </div>
      )}
      {/* Help me fix this — links to GuidedFix when a recommendation is matched */}
      {rec && onGuide && (sev === 'critical' || sev === 'warning') && (
        <div style={{ padding: '0 18px 12px 37px' }}>
          <button
            onClick={() => onGuide(rec)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg,#8a46f8,#3687fa)', color: '#fff',
              border: 0, borderRadius: 8, padding: '6px 12px', fontSize: 11,
              fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 8px #7948f625',
            }}
          >
            Help me fix this
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Category section ─── */
function CategorySection({ label, accent, issues, auditStatus, sectionSummary, recMap, onGuide }) {
  const [collapsed, setCollapsed] = useState(false);
  const crit = issues.filter(i => i.severity === 'critical').length;
  const warn = issues.filter(i => i.severity === 'warning').length;
  const good = issues.filter(i => i.severity === 'good').length;

  // Determine if this category's check was blocked/failed
  const checkBlocked  = auditStatus?.status === 'blocked';
  const checkFailed   = auditStatus?.status === 'failed';
  const checkUnavail  = !auditStatus || auditStatus.status === 'unavailable';
  const notEvaluated  = checkBlocked || checkFailed || (checkUnavail && issues.length === 0 && !auditStatus?.status);

  const metaLine = notEvaluated
    ? (checkBlocked ? '⚠ Blocked' : checkFailed ? '✕ Check failed' : '— Not evaluated')
    : [
        crit > 0 && `${crit} critical`,
        warn > 0 && `${warn} warning${warn > 1 ? 's' : ''}`,
        good > 0 && `${good} passed`,
      ].filter(Boolean).join(' · ') || `${issues.length} items`;

  const metaColor = checkBlocked ? '#efa642' : checkFailed ? '#ef6473' : '#83899c';

  return (
    <div style={{ border: `1px solid ${notEvaluated ? '#f0e0c8' : '#e9eaf2'}`, borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setCollapsed(c => !c)}
        style={{ width: '100%', background: collapsed ? '#fff' : '#fafaff', border: 0,
          padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 11,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
          fontWeight: 800, fontSize: 13, color: '#151621', flex: 1 }}>{label}</span>
        <span style={{ fontSize: 11, color: metaColor, fontWeight: notEvaluated ? 700 : 400, marginRight: 8 }}>{metaLine}</span>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#b0b4c8" strokeWidth={2.5} strokeLinecap="round">
          <path d={collapsed ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6'}/>
        </svg>
      </button>
      {!collapsed && (
        <div>
          {notEvaluated && issues.length === 0
            ? <div style={{ padding: '12px 18px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={checkFailed ? '#ef6473' : '#d97706'} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d={checkFailed ? 'M18 6 6 18M6 6l12 12' : 'M12 2L2 19h20L12 2zm0 7v5m0 3h.01'}/>
                </svg>
                <p style={{ fontSize: 13, color: '#4b5168', margin: 0, lineHeight: 1.55 }}>
                  {checkBlocked
                    ? <>This check was blocked — the page couldn&apos;t be fetched. The site may be blocking automated crawlers. <span style={{ color: '#83899c' }}>{auditStatus?.error?.message || ''}</span></>
                    : checkFailed
                      ? <>This check failed to run. <span style={{ color: '#83899c' }}>{auditStatus?.error?.message || 'An error occurred during analysis.'}</span></>
                      : 'This check was not included in the scan.'
                  }
                </p>
              </div>
            : issues.length === 0
              ? <p style={{ fontSize: 13, color: '#83899c', padding: '13px 18px', margin: 0 }}>All checks passed.</p>
              : <>
                  {sectionSummary && (
                    <div style={{ margin: '0 14px 2px', padding: '10px 14px',
                      background: `${accent}0d`, borderRadius: 9,
                      borderLeft: `3px solid ${accent}`, marginBottom: 8, marginTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round">
                          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4m0 4h.01"/>
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: '.05em', textTransform: 'uppercase' }}>AI insight</span>
                      </div>
                      <p style={{ fontSize: 12.5, color: '#3d4259', lineHeight: 1.6, margin: 0 }}>{sectionSummary}</p>
                    </div>
                  )}
                  {issues.map((issue, i) => {
                    const fp = issue.fingerprintId || issue.fingerprint || '';
                    const issueRec = recMap ? (recMap[fp] || null) : null;
                    return <FindingRow key={i} issue={issue} rec={issueRec} onGuide={onGuide} />;
                  })}
                </>
          }
        </div>
      )}
    </div>
  );
}

/* ─── Contextual guidance from recommendation data ─── */
/**
 * Build a fingerprint → recommendation lookup map from a report's recommendations array.
 * Called once per render in the main component and passed down to FixCard.
 */
function buildRecMap(recommendations) {
  const map = {};
  if (!Array.isArray(recommendations)) return map;
  for (const rec of recommendations) {
    if (rec.fingerprint) map[rec.fingerprint] = rec;
    // Also index by each finding_fingerprint prefix so individual findings resolve
    if (Array.isArray(rec.finding_fingerprints)) {
      for (const fp of rec.finding_fingerprints) {
        if (!map[fp]) map[fp] = rec;
      }
    }
  }
  return map;
}

/**
 * Return structured contextual guidance for a finding/issue using stored recommendation data.
 * Falls back gracefully when rec data is absent — never returns generic five-step noise.
 *
 * Returns: { whatWeFound, whyItMatters, howToFix: string[], howToVerify, hasGuidance }
 */
function getContextualGuidance(issue, rec) {
  const cleanMd = (s) => (s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

  // 1. What we found — prefer rec's what_we_found, fall back to issue description
  const whatWeFound = cleanMd(rec?.what_we_found || rec?.explanation || issue.description || issue.detail || '');

  // 2. Why it matters — from rec, fall back to issue detail
  const whyItMatters = cleanMd(rec?.why_it_matters || issue.detail || '');

  // 3. How to fix — use rec's actions[] if available; each action is a plain-text string
  let howToFix = [];
  if (Array.isArray(rec?.actions) && rec.actions.length > 0) {
    howToFix = rec.actions.map(a => cleanMd(typeof a === 'string' ? a : (a.detail || a.title || String(a))));
  } else if (issue.fix) {
    // Single fix hint from the finding itself
    howToFix = [cleanMd(issue.fix)];
  }
  // Never fill with generic noise if guidance is truly absent
  if (howToFix.length === 0) howToFix = null;

  // 4. How to verify — from rec's verification_approach
  const howToVerify = cleanMd(rec?.verification_approach || '');

  const hasGuidance = !!(whatWeFound || whyItMatters || howToFix || howToVerify);

  return { whatWeFound, whyItMatters, howToFix, howToVerify, hasGuidance };
}

/* Status config for fix lifecycle */
const FIX_STATUSES = {
  open:           { label: 'Open',                    color: '#efa642', bg: '#fff8ee' },
  in_progress:    { label: 'In progress',             color: '#3687fa', bg: '#eef5ff' },
  verify:         { label: 'Awaiting verification',   color: '#7948f6', bg: '#f1edff' },
  fixed:          { label: 'Likely resolved',         color: '#19b987', bg: '#edf9f4' },
  still_open:     { label: 'Still detected',          color: '#ef6473', bg: '#fff0f2' },
  dismissed:      { label: 'Dismissed',               color: '#b0b4c8', bg: '#f4f5fb' },
  unable_verify:  { label: 'Unable to verify',        color: '#83899c', bg: '#f4f5fb' },
};

const EVIDENCE_SOURCE = {
  perf: 'Lighthouse', performance: 'Lighthouse', lcp: 'Lighthouse', cls: 'Lighthouse',
  seo: 'SEO audit', ssl: 'SSL check', a11y: 'Accessibility audit',
};

/**
 * FixCard — single action-plan item with:
 *   - status persisted to DB for authenticated users (optimistic update + visible error/retry on failure)
 *   - contextual guidance from stored recommendation data
 *   - functional Verify fix that triggers a rescan and server-side comparison
 *   - Ask Cernly chips with finding-specific prompts
 *
 * Props:
 *   issue       — the finding object
 *   n           — display number
 *   impact      — 'high' | 'medium' | 'low'
 *   rec         — matched recommendation object (may be null)
 *   workItem    — { userStatus, verifiedStatus, verifiedAt } from DB (may be null for anon users)
 *   onStatusChange(issue, newStatus) — called when user changes status; handles persistence
 *   onAskCernly(issue, suggestedQ)   — opens the Ask Cernly drawer
 *   onVerify(issue)                  — triggers rescan + verification flow
 */
function FixCard({ issue, n, impact, rec, workItem, onStatusChange, onAskCernly, onVerify, onGuide, highlighted }) {
  const [expanded, setExpanded] = useState(!!highlighted);
  const [guideOpen, setGuideOpen] = useState(false);
  const cardRef = useRef(null);

  // When pre-selected via URL param: auto-expand and scroll into view
  useEffect(() => {
    if (!highlighted) return;
    setExpanded(true);
    const el = cardRef.current;
    if (el) {
      // Small delay so the tab has rendered before we scroll
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
  }, [highlighted]);

  // Derive displayed status: prefer DB-persisted, fall back to local default
  const persistedStatus = workItem?.userStatus || 'open';
  const verifiedStatus  = workItem?.verifiedStatus || null;

  // Map verified_status from server to display FIX_STATUS key
  const effectiveStatusKey = (() => {
    if (verifiedStatus === 'likely_resolved')    return 'fixed';
    if (verifiedStatus === 'still_detected')     return 'still_open';
    if (verifiedStatus === 'partially_resolved') return 'still_open';
    if (verifiedStatus === 'unable_to_verify')   return 'unable_verify';
    return persistedStatus; // user's own workflow status
  })();

  const st = FIX_STATUSES[effectiveStatusKey] || FIX_STATUSES.open;
  const evidenceKey = (issue.source || issue.area || '').toLowerCase();
  const evidence = EVIDENCE_SOURCE[evidenceKey] || (issue.source ? issue.source.toUpperCase() : 'Audit');
  const catColor = { Performance: '#7948f6', SEO: '#3687fa', Security: '#19b987', Accessibility: '#efa642' };
  const cat = issue.area?.replace(/best.practices?/i, 'Performance') || 'Performance';
  const accent = catColor[cat] || '#7948f6';
  const sevDotColor = { critical: '#ef6473', warning: '#efa642', info: '#b0b4c8', good: '#19b987' };
  const sevDot = sevDotColor[issue.severity] || sevDotColor.info;

  // Contextual guidance from recommendation
  const guidance = getContextualGuidance(issue, rec);

  // Ask Cernly contextual chips
  const askChips = [
    `Why is this happening?`,
    `How do I fix "${(issue.message || '').slice(0, 35)}${(issue.message || '').length > 35 ? '…' : ''}"?`,
    `How do I verify the change?`,
    `Explain this in simpler terms`,
  ];

  function cycleStatus(e) {
    e.stopPropagation();
    // Cycle: open → in_progress → verify → open (skip over verified states — those come from server)
    const cycle = { open: 'in_progress', in_progress: 'verify', verify: 'open', fixed: 'open', still_open: 'open', dismissed: 'open' };
    const next = cycle[persistedStatus] || 'open';
    onStatusChange(issue, next);
  }

  return (
    <div ref={cardRef} style={{ background: '#fff',
      border: highlighted ? '2px solid #7948f6' : '1px solid #e9eaf2',
      borderRadius: 16, marginBottom: 8, overflow: 'hidden',
      boxShadow: highlighted ? '0 0 0 4px #7948f615, 0 1px 6px #1b1d3206' : '0 1px 6px #1b1d3206' }}>

      {/* Compact summary row — always visible */}
      <button onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left',
          padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', fontFamily: 'inherit' }}>
        {/* Severity dot */}
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: sevDot, flexShrink: 0 }} />
        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#151621', lineHeight: 1.4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {issue.message}
          </div>
        </div>
        {/* Meta chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#83899c', fontWeight: 600 }}>{cat}</span>
          <span style={{ fontSize: 10, background: st.bg, color: st.color,
            borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>{st.label}</span>
          <ImpactBadge level={impact} />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b0b4c8" strokeWidth="2.5" strokeLinecap="round">
            <path d={expanded ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'}/>
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f0f1f8' }}>
          <div style={{ padding: '14px 16px 16px' }}>
            {/* Meta row */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#b0b4c8', letterSpacing: '.07em', marginBottom: 3 }}>STATUS</div>
                <button onClick={cycleStatus}
                  style={{ border: 0, background: st.bg, color: st.color, borderRadius: 7,
                    padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {st.label}
                </button>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#b0b4c8', letterSpacing: '.07em', marginBottom: 3 }}>EVIDENCE</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#4b5168' }}>{evidence}</div>
              </div>
              {verifiedStatus && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#b0b4c8', letterSpacing: '.07em', marginBottom: 3 }}>VERIFIED</div>
                  <div style={{ fontSize: 11, color: verifiedStatus === 'likely_resolved' ? '#19b987' : '#ef6473', fontWeight: 700 }}>
                    {verifiedStatus === 'likely_resolved' ? 'Resolved ✓' :
                     verifiedStatus === 'still_detected' ? 'Still detected' :
                     verifiedStatus === 'partially_resolved' ? 'Partially resolved' : 'Unable to verify'}
                  </div>
                </div>
              )}
            </div>

            {/* What we found — from rec data (replaces generic issue.description) */}
            {guidance.whatWeFound && (
              <div style={{ background: '#f8f9fd', borderRadius: 10, padding: '11px 13px', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#83899c',
                  letterSpacing: '.07em', marginBottom: 5 }}>WHAT WAS FOUND</div>
                <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.7, margin: 0 }}>
                  {guidance.whatWeFound}
                </p>
              </div>
            )}

            {/* Affected elements — specific evidence from this issue's items[] */}
            {issue.items?.length > 0 && (
              <AffectedElements
                items={issue.items}
                totalDetected={issue.totalDetected}
                checkId={issue.checkId}
                auditId={issue.auditId}
                onFixElement={(item) => {
                  const name = item.label || item.selector || (item.url ? item.url.split('/').pop().split('?')[0] : null) || 'this element';
                  onAskCernly(issue, `How do I fix the issue with "${name}"?`, rec, { element: item });
                }}
              />
            )}

            {/* Why it matters */}
            {guidance.whyItMatters && (
              <div style={{ background: '#fffbf0', borderRadius: 10, padding: '11px 13px', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#d97706',
                  letterSpacing: '.07em', marginBottom: 5 }}>WHY IT MATTERS</div>
                <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.7, margin: 0 }}>
                  {guidance.whyItMatters}
                </p>
              </div>
            )}

            {/* Ask Cernly contextual chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {askChips.map((chip, i) => (
                <button key={i} onClick={() => {
                  // "How do I fix?" opens Guided Fix directly when a rec is available
                  if (chip.startsWith('How do I fix') && rec && onGuide) {
                    onGuide(rec);
                  } else {
                    onAskCernly(issue, chip, rec);
                  }
                }}
                  style={{ fontSize: 11, fontWeight: 600, color: '#7948f6',
                    background: '#f7f4ff', border: '1px solid #e8e2ff',
                    borderRadius: 20, padding: '4px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {chip}
                </button>
              ))}
            </div>

            {/* Primary action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Guided fix CTA — all recommendation groups */}
              {onGuide && rec && (
                <button onClick={() => onGuide(rec)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'linear-gradient(135deg,#8a46f8,#3687fa)', color: '#fff',
                    border: 0, borderRadius: 9, padding: '7px 13px', fontSize: 12,
                    fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 3px 10px #7948f625' }}>
                  Guide me through this fix
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              )}
              {guidance.howToFix && (
                <button onClick={() => setGuideOpen(g => !g)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e9eaf2',
                    background: guideOpen ? '#f4f5fb' : '#fff', color: '#151621', borderRadius: 9,
                    padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {guideOpen ? 'Hide fix guide' : 'View fix guide'}
                </button>
              )}
              <button onClick={() => onVerify(issue)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #e9eaf2',
                  background: persistedStatus === 'verify' ? '#f1edff' : '#fff',
                  color: persistedStatus === 'verify' ? '#7948f6' : '#83899c',
                  borderRadius: 9, padding: '7px 13px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: (onGuide && rec && persistedStatus !== 'verify') ? 0.75 : 1 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-9-9M9 12l2 2 4-4"/>
                </svg>
                Verify fix
              </button>
            </div>
          </div>

          {/* Fix guide panel — from rec's actions[], not generic steps */}
          {guideOpen && guidance.howToFix && (
            <div style={{ borderTop: '1px solid #f0f1f8', padding: '13px 16px', background: '#fafbff' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#7948f6',
                letterSpacing: '.07em', marginBottom: 9 }}>HOW TO FIX</div>
              <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {guidance.howToFix.map((step, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.65 }}>{step}</li>
                ))}
              </ol>
              {guidance.howToVerify && (
                <div style={{ marginTop: 12, background: '#edf9f4', borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#19b987', letterSpacing: '.07em', marginBottom: 4 }}>
                    HOW TO VERIFY
                  </div>
                  <p style={{ fontSize: 12, color: '#4b5168', margin: 0, lineHeight: 1.6 }}>{guidance.howToVerify}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Discovery card ─── */
const CATEGORY_ACCENT = {
  Performance: '#7948f6', SEO: '#3687fa', Security: '#19b987',
  Accessibility: '#efa642', UX: '#ef6473',
};

function DiscoveryCard({ d, index }) {
  const [open, setOpen] = useState(false);
  const accent = CATEGORY_ACCENT[d.category] || '#7948f6';
  const confBg = { high: '#edf9f4', medium: '#f1edff', low: '#f4f5fb' }[d.confidence] || '#f4f5fb';
  const confColor = { high: '#16a34a', medium: '#7948f6', low: '#83899c' }[d.confidence] || '#83899c';

  return (
    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
      overflow: 'hidden', boxShadow: '0 2px 8px #1b1d3205' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 0, textAlign: 'left',
          padding: '16px 18px', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: accent + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          <span style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
            fontWeight: 800, fontSize: 13, color: accent }}>
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: '.06em' }}>{d.category?.toUpperCase()}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: confColor,
              background: confBg, padding: '2px 7px', borderRadius: 5 }}>{d.confidence?.toUpperCase()} CONFIDENCE</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#151621', lineHeight: 1.4 }}>{d.title}</div>
          <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.7, margin: '5px 0 0' }}>{d.what_we_found || d.explanation}</p>
        </div>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#b0b4c8"
          strokeWidth={2.5} strokeLinecap="round" style={{ flexShrink: 0, marginTop: 8 }}>
          <path d={open ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'}/>
        </svg>
      </button>
      {open && Array.isArray(d.supporting_findings) && d.supporting_findings.length > 0 && (
        <div style={{ borderTop: '1px solid #f0f1f8', padding: '4px 18px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c',
            letterSpacing: '.07em', margin: '12px 0 10px' }}>DETECTED ISSUES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {d.supporting_findings.slice(0, 5).map((f, fi) => {
              const sevColor = { critical: '#ef6473', warning: '#efa642', info: '#83899c' }[f.severity] || '#83899c';
              const sevBg    = { critical: '#fff5f6', warning: '#fffbf0', info: '#f4f5fb' }[f.severity] || '#f4f5fb';
              return (
                <div key={fi} style={{ background: sevBg, borderRadius: 8, padding: '8px 12px',
                  borderLeft: `3px solid ${sevColor}`, fontSize: 12 }}>
                  <span style={{ color: '#151621', fontWeight: 600 }}>{f.message}</span>
                  {f.displayValue && (
                    <span style={{ color: sevColor, fontWeight: 700, marginLeft: 6 }}>— {f.displayValue}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {open && Array.isArray(d.actions) && d.actions.length > 0 && (
        <div style={{ borderTop: '1px solid #f0f1f8', padding: '4px 18px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c',
            letterSpacing: '.07em', margin: '12px 0 10px' }}>RECOMMENDED ACTIONS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.actions.map((a, ai) => {
              const impactColor = { high: '#ef6473', medium: '#efa642', low: '#83899c' }[a.impact] || '#83899c';
              const effortBg    = { low: '#edf9f4', medium: '#fff8ed', high: '#fff0f2' }[a.effort] || '#f4f5fb';
              const effortColor = { low: '#16a34a', medium: '#d97706', high: '#ef6473' }[a.effort] || '#83899c';
              return (
                <div key={ai} style={{ background: '#f8f9fd', borderRadius: 10, padding: '11px 14px',
                  borderLeft: `3px solid ${impactColor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#151621', flex: 1 }}>{a.title}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em',
                      padding: '2px 7px', borderRadius: 5, background: effortBg, color: effortColor, whiteSpace: 'nowrap' }}>
                      {a.effort?.toUpperCase()} EFFORT
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.65, margin: 0 }}>{a.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── UX / Visual Experience card — used in Findings tab ─── */
function UxCard({ uxScore, uxInsights, uxAnnotations, visionStatus, siteType, url, issues }) {
  const [activePin, setActivePin] = useState(null);
  const score = uxScore ?? null;
  const color = score == null ? '#83899c' : score >= 80 ? '#19b987' : score >= 60 ? '#efa642' : '#ef6473';
  const visionLoading = visionStatus === 'loading';

  const sevColor = s => s === 'good' ? '#19b987' : s === 'warning' ? '#efa642' : '#ef6473';
  const sevBg    = s => s === 'good' ? '#f0fdf8' : s === 'warning' ? '#fffbf0' : '#fff5f6';
  const sevLabel = s => s === 'good' ? 'GOOD' : s === 'warning' ? 'NEEDS WORK' : 'CRITICAL';

  const annotations   = uxAnnotations?.annotations || [];
  const screenshotUrl = uxAnnotations?.screenshotUrl || null;
  const observations  = uxInsights?.observations || [];

  // Broad fallback: any critical/warning issue that has a fixable description
  // Prioritise a11y + UX-signal keywords, then fill with other critical issues
  const uxIssues = !uxInsights && !annotations.length && Array.isArray(issues)
    ? (() => {
        const isUxSignal = i =>
          i.source === 'a11y' ||
          /contrast|label|aria|button|tap|touch|mobile|image|logo|hero|cta|click|link|nav|menu|font|text|color|layout|scroll|form|input|heading|h1|h2|lcp|cls|fid|inp|render|visual|ux/i.test(i.message || '');
        const priority = issues.filter(i =>
          (i.severity === 'critical' || i.severity === 'warning') && isUxSignal(i));
        const rest = issues.filter(i =>
          i.severity === 'critical' && !isUxSignal(i));
        return [...priority, ...rest]
          .filter((i, idx, arr) => arr.findIndex(x => x.message === i.message) === idx)
          .slice(0, 6);
      })()
    : [];

  return (
    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
      padding: '20px 22px', marginBottom: 20 }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f1edff',
              display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#7948f6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
              fontSize: 15, color: '#151621', margin: 0, letterSpacing: '-.02em' }}>Visual Experience Review</h2>
            {siteType && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                background: '#f4f5fb', color: '#83899c', letterSpacing: '.05em' }}>{siteType.toUpperCase()}</span>
            )}
            {annotations.length > 0 && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 7px', borderRadius: 5,
                background: '#f1edff', color: '#7948f6', letterSpacing: '.06em' }}>AI VISION</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#83899c', margin: 0 }}>Design, usability, and conversion experience</p>
        </div>
        {score != null && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
              fontSize: 40, lineHeight: 1, color }}>{score}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#83899c', marginTop: 3 }}>UX SCORE</div>
          </div>
        )}
      </div>

      {/* Annotated screenshot */}
      {(screenshotUrl || url) && (
        <div style={{ marginBottom: annotations.length ? 0 : 16 }}>
          {visionLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              background: '#f4f0ff', borderRadius: 9, padding: '9px 13px' }}>
              <div style={{ width: 14, height: 14, border: '2px solid #d8ccff', borderTopColor: '#7948f6',
                borderRadius: '50%', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7948f6' }}>
                AI vision analysis in progress — annotated pins will appear shortly…
              </span>
            </div>
          )}
          {visionStatus === 'error' && !annotations.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              background: '#fff5f6', borderRadius: 9, padding: '9px 13px' }}>
              <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
              <span style={{ fontSize: 12, color: '#ef6473' }}>
                AI vision analysis couldn&apos;t complete for this site. Screenshot is shown below.
              </span>
            </div>
          )}
          {!visionLoading && visionStatus !== 'error' && annotations.length > 0 && (
            <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c',
              letterSpacing: '.07em', marginBottom: 10 }}>VISUAL ANALYSIS — click a pin to see the finding</div>
          )}
          {/* Scrollable full-page screenshot with pins */}
          <div style={{ position: 'relative', borderRadius: 13, overflow: 'hidden',
            border: '1px solid #e9eaf2', background: '#f4f5fb',
            maxHeight: 520, overflowY: 'auto', overflowX: 'hidden' }}>
            {/* Inner wrapper sized to the natural image so pin % coords are correct */}
            <div style={{ position: 'relative', width: '100%' }}>
              <img
                src={screenshotUrl || `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&screenshot.fullPage=true&embed=screenshot.url`}
                alt={`Screenshot of ${url}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
              {annotations.map((ann, i) => {
                const c = sevColor(ann.severity);
                const isActive = activePin === i;
                return (
                  <button key={i} onClick={() => setActivePin(isActive ? null : i)}
                    style={{ position: 'absolute', left: `${ann.x * 100}%`, top: `${ann.y * 100}%`,
                      transform: 'translate(-50%, -50%)', width: 26, height: 26, borderRadius: '50%',
                      background: isActive ? c : '#fff', border: `2.5px solid ${c}`,
                      color: isActive ? '#fff' : c, fontSize: 11, fontWeight: 800,
                      display: 'grid', placeItems: 'center', cursor: 'pointer',
                      boxShadow: `0 2px 10px ${c}55`, zIndex: isActive ? 10 : 5,
                      transition: 'all .15s ease', padding: 0, lineHeight: 1 }}
                    title={ann.label}>{i + 1}</button>
                );
              })}
              {activePin !== null && annotations[activePin] && (() => {
                const ann = annotations[activePin];
                const c   = sevColor(ann.severity);
                const fromLeft = ann.x > 0.55;
                return (
                  <div style={{ position: 'absolute',
                    left:  fromLeft ? 'auto' : `calc(${ann.x * 100}% + 16px)`,
                    right: fromLeft ? `calc(${(1 - ann.x) * 100}% + 16px)` : 'auto',
                    top:   `${ann.y * 100}%`, width: 220,
                    background: '#fff', borderRadius: 11, padding: '12px 14px',
                    boxShadow: '0 4px 24px #0003', border: `1.5px solid ${c}33`,
                    zIndex: 20, pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
                      <div style={{ fontSize: 10, fontWeight: 800, color: c, letterSpacing: '.06em' }}>{sevLabel(ann.severity)}</div>
                      <div style={{ fontSize: 9, color: '#83899c', marginLeft: 'auto' }}>{ann.area}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#151621', marginBottom: 5, lineHeight: 1.4 }}>{ann.label}</div>
                    <div style={{ fontSize: 11, color: '#4b5168', lineHeight: 1.6 }}>{ann.detail}</div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Annotation legend */}
      {annotations.length > 0 && (
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {annotations.map((ann, i) => {
              const c = sevColor(ann.severity);
              const isActive = activePin === i;
              return (
                <button key={i} onClick={() => setActivePin(isActive ? null : i)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: isActive ? sevBg(ann.severity) : '#f8f9fd',
                    border: `1px solid ${isActive ? c + '44' : '#e9eaf2'}`,
                    borderRadius: 10, padding: '10px 13px',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all .12s ease' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: c,
                    color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0,
                    display: 'grid', placeItems: 'center', marginTop: 1 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#151621' }}>{ann.label}</div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: c, letterSpacing: '.06em',
                        marginLeft: 'auto', flexShrink: 0 }}>{sevLabel(ann.severity)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#4b5168', lineHeight: 1.55 }}>{ann.detail}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI insights blocks */}
      {uxInsights && (uxInsights.conversion_focus || uxInsights.top_recommendation) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {uxInsights.conversion_focus && (
            <div style={{ background: '#f7f8fc', borderRadius: 12, padding: '13px 15px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#83899c',
                textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 5 }}>Goal of this site</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#151621', lineHeight: 1.4 }}>
                {uxInsights.conversion_focus}
              </div>
            </div>
          )}
          {uxInsights.top_recommendation && (
            <div style={{ background: '#f7f4ff', borderRadius: 12, padding: '13px 15px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#7948f6',
                textTransform: 'uppercase', letterSpacing: '.09em', marginBottom: 5 }}>Top recommendation</div>
              <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.6 }}>{uxInsights.top_recommendation}</div>
            </div>
          )}
        </div>
      )}

      {observations.length > 0 && !annotations.length && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c',
            letterSpacing: '.07em', marginBottom: 10 }}>UX BREAKDOWN</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {observations.map((obs, i) => (
              <div key={i} style={{ borderRadius: 11, padding: '12px 15px',
                background: sevBg(obs.verdict), border: `1px solid ${sevColor(obs.verdict)}22` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: sevColor(obs.verdict) }} />
                  <div style={{ fontSize: 10, fontWeight: 800, color: sevColor(obs.verdict),
                    letterSpacing: '.07em' }}>{obs.area?.toUpperCase()}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800,
                    color: sevColor(obs.verdict), opacity: .7, letterSpacing: '.06em' }}>{sevLabel(obs.verdict)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#151621',
                  marginBottom: obs.fix ? 4 : 0, paddingLeft: 14 }}>{obs.finding}</div>
                {obs.fix && (
                  <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.55, paddingLeft: 14 }}>
                    → {obs.fix}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!uxInsights && !annotations.length && uxIssues.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c', letterSpacing: '.07em' }}>
              WHAT TO FIX
            </div>
            <div style={{ fontSize: 10, color: '#b0b4c8', fontWeight: 600 }}>
              — from audit findings
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {uxIssues.map((issue, i) => {
              const crit = issue.severity === 'critical';
              const dotColor = crit ? '#ef6473' : '#efa642';
              return (
                <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '11px 14px',
                  border: '1px solid #e9eaf2',
                  borderLeft: `3px solid ${dotColor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: issue.description || issue.fix ? 4 : 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: dotColor,
                      letterSpacing: '.06em', flexShrink: 0 }}>{crit ? 'CRITICAL' : 'WARNING'}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#151621', lineHeight: 1.3 }}>{issue.message}</div>
                  </div>
                  {(issue.description || issue.fix) && (
                    <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.6, paddingLeft: 0 }}>
                      {(issue.description || issue.fix || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 200)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!uxInsights && !annotations.length && uxIssues.length === 0 && score != null && (
        <div style={{ background: '#f7f4ff', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.6 }}>
            {score >= 80
              ? 'UX looks solid. Keep an eye on load times and touch target sizes as you ship new content.'
              : score >= 60
              ? 'There are UX opportunities here. Improving load speed and ensuring all interactive elements are keyboard-accessible will have the biggest impact.'
              : 'A UX score this low typically signals friction — slow loads, missing form labels, or hard-to-tap elements on mobile. Prioritize performance and accessibility fixes first.'}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Ask Cernly drawer ─── */
function AskCernlyDrawer({ reportId, domain, onClose, initialContext, initialMessage, recFingerprint, findingFingerprintId, activeStep, elementContext, seedMessages }) {
  const [expanded, setExpanded] = useState(false);
  const openingMsg = initialContext
    ? `I'm looking at the **${initialContext.category || 'finding'}** issue: **${initialContext.title}**.\n\n${initialContext.detail ? initialContext.detail.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 200) : 'What would you like to know about this finding?'}`
    : `Hi! I've analyzed **${domain || 'this site'}** and I'm ready to help. Ask me what a finding means, how to fix it, or where to start.`;

  const [messages, setMessages] = useState(
    seedMessages?.length ? seedMessages : [{ role: 'assistant', content: openingMsg }]
  );

  // Auto-send initialMessage (from the overview input box) on mount
  useEffect(() => {
    if (initialMessage?.trim()) { send(initialMessage.trim()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsRef = useRef(null);

  const SUGGESTED = initialContext
    ? [`How do I fix "${initialContext.title?.slice(0, 40)}…"?`, 'How long will this take to fix?', 'Will this improve my score?', 'Show me an example fix']
    : ['What should I fix first?', 'How do I improve my LCP score?', 'What SEO issues hurt me most?'];

  const scrollToBottom = useCallback(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  async function send(text) {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');
    const updated = [...messages, { role: 'user', content: q }];
    setMessages(updated);
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q, reportId, messages: updated.slice(-6),
          ...(findingFingerprintId ? { findingFingerprintId } : {}),
          ...(recFingerprint ? { recFingerprint } : {}),
          ...(activeStep ? { activeStep } : {}),
          ...(elementContext ? { elementContext } : {}),
        }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.answer || 'Sorry, something went wrong.' }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Network error — please try again.' }]);
    }
    setLoading(false);
  }

  const userHasMessaged = messages.some(m => m.role === 'user');

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0d102040', zIndex: 49 }} />

      {/* Drawer — width expands on toggle; transition keeps it smooth */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0,
        width: expanded ? 'min(90vw, 680px)' : 380, maxWidth: '92vw',
        background: '#fff', borderLeft: '1px solid #e9eaf2',
        boxShadow: '-8px 0 40px #1b1d3215', zIndex: 50,
        display: 'flex', flexDirection: 'column', animation: 'slideIn .22s ease',
        transition: 'width .2s ease' }}>

        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #f0f1f8',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg,#8a46f8,#3687fa)',
            display: 'grid', placeItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>✦</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
              fontWeight: 800, fontSize: 13, color: '#151621' }}>Ask Cernly AI</div>
            <div style={{ fontSize: 11, color: '#83899c' }}>
              {initialContext ? `About: ${initialContext.title?.slice(0, 32)}…` : 'Knows this report'}
            </div>
          </div>
          {/* Expand/collapse toggle — widens drawer for longer technical responses */}
          <button onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse panel' : 'Expand panel'}
            aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
            style={{ border: 0, background: '#f4f5fb', color: '#83899c',
              borderRadius: 8, width: 30, height: 30, display: 'grid', placeItems: 'center',
              cursor: 'pointer' }}>
            {expanded
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            }
          </button>
          <button onClick={onClose} style={{ border: 0, background: '#f4f5fb', color: '#83899c',
            borderRadius: 8, width: 30, height: 30, display: 'grid', placeItems: 'center',
            cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>

        {/* Messages */}
        <div ref={msgsRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10,
          scrollBehavior: 'smooth', overscrollBehavior: 'contain' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '86%', fontSize: 13, lineHeight: 1.65, padding: '9px 13px',
                borderRadius: m.role === 'user' ? '13px 13px 3px 13px' : '3px 13px 13px 13px',
                background: m.role === 'user' ? '#7948f6' : '#f4f5fb',
                color: m.role === 'user' ? '#fff' : '#151621', wordBreak: 'break-word' }}>
                {m.role === 'assistant'
                  ? <AskMarkdown content={m.content} />
                  : m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex' }}>
              <div style={{ background: '#f4f5fb', borderRadius: '3px 13px 13px 13px',
                padding: '11px 14px', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0,1,2].map(j => (
                  <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: '#b0b4c8',
                    animation: `bounce .9s ${j * .2}s infinite ease-in-out` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {!userHasMessaged && (
          <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
            {SUGGESTED.map(s => (
              <button key={s} onClick={() => send(s)}
                style={{ background: '#f4f5fb', border: 0, borderRadius: 9, padding: '8px 12px',
                  fontSize: 12, fontWeight: 600, color: '#5a5e75', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.3 }}>{s}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid #f0f1f8', flexShrink: 0 }}>
          <form onSubmit={e => { e.preventDefault(); send(); }}
            style={{ display: 'flex', gap: 8, alignItems: 'center',
              background: '#f4f5fb', borderRadius: 12, padding: '8px 8px 8px 13px' }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              placeholder="Ask anything about this report…"
              autoFocus
              style={{ flex: 1, background: 'none', border: 0, outline: 0, fontSize: 13,
                color: '#151621', fontFamily: 'inherit', minWidth: 0 }} />
            <button type="submit" disabled={loading || !input.trim()}
              style={{ border: 0, background: input.trim() ? '#7948f6' : '#e9eaf2',
                color: input.trim() ? '#fff' : '#b0b4c8', borderRadius: 9, width: 32, height: 32,
                display: 'grid', placeItems: 'center', cursor: input.trim() ? 'pointer' : 'default',
                transition: 'background .15s, color .15s', flexShrink: 0 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>
        </div>

        <style>{`
          @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
          @keyframes bounce  { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }
        `}</style>
      </div>
    </>
  );
}

/* ─── Sidebar ─── */
function Sidebar({ isPro, displayName, userAvatar, sidebarOpen }) {
  const router = useRouter();
  const { signOut } = useClerk();
  return (
    <aside style={{ background: '#fff', borderRight: '1px solid #e9eaf2',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
      padding: '27px 15px 18px', zIndex: 20, overflowY: 'auto' }}
      className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>

      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
        fontSize: 21, letterSpacing: '-.075em', color: '#151621', textDecoration: 'none',
        padding: '0 13px' }}>
        <LogoMark />
        cernly<span style={{ fontWeight: 500 }}>.ai</span>
      </Link>

      <div style={{ margin: '32px 10px 22px', padding: '11px 12px',
        border: '1px solid #e9eaf2', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ background: '#eeeaff', color: '#7948f6', padding: 9, borderRadius: 10,
          fontSize: 14, lineHeight: 1, fontWeight: 700 }}>✦</div>
        <div>
          <strong style={{ fontSize: 12, display: 'block' }}>Personal workspace</strong>
          <small style={{ fontSize: 10, color: '#83899c', display: 'block', marginTop: 3 }}>{isPro ? 'Pro plan' : 'Free plan'}</small>
        </div>
      </div>

      <div style={{ fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase',
        color: '#a3a7b4', fontWeight: 800, padding: '0 15px', margin: '0 0 8px' }}>Workspace</div>
      <nav style={{ display: 'grid', gap: 3 }}>
        {[
          { href: '/dashboard',            label: 'Overview',     d: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
          { href: '/dashboard?v=websites', label: 'My websites',  d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3c-4 5-4 13 0 18m0-18c4 5 4 13 0 18' },
          { href: '/dashboard?v=history',  label: 'Scan history', d: 'M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3zM12 7v5l3 2' },
          { href: '/dashboard?v=tasks',    label: 'Fix queue',    d: 'm5 12 4 4 10-10' },
        ].map(({ href, label, d }) => (
          <Link key={label} href={href} style={{ color: '#707688', display: 'flex', alignItems: 'center',
            gap: 13, padding: '12px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12,
            textDecoration: 'none' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
            {label}
          </Link>
        ))}
      </nav>

      <div style={{ fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase',
        color: '#a3a7b4', fontWeight: 800, padding: '0 15px', margin: '24px 0 8px' }}>Account</div>
      <nav style={{ display: 'grid', gap: 3 }}>
        {[
          { href: '/dashboard?v=billing',  label: 'Plan & billing', d: 'M3 20h18M6 16v-6m6 6V4m6 12v-9' },
          { href: '/dashboard?v=settings', label: 'Settings',       d: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1m0-14.2L17 7M7 17l-2.1 2.1' },
        ].map(({ href, label, d }) => (
          <Link key={label} href={href} style={{ color: '#707688', display: 'flex', alignItems: 'center',
            gap: 13, padding: '12px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12,
            textDecoration: 'none' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
            {label}
          </Link>
        ))}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        {!isPro && (
          <div style={{ borderRadius: 15, background: '#171825', color: '#fff',
            padding: 17, margin: '0 3px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', width: 130, height: 130, background: '#7d53f8',
              filter: 'blur(60px)', right: -65, top: -65, opacity: .6 }} />
            <div style={{ position: 'relative' }}>
              <strong style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                fontSize: 13, fontWeight: 800, display: 'block' }}>Make every scan count.</strong>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: '#afb1c1', margin: '6px 0 12px' }}>
                Unlock fix guides, scan history, and progress tracking with Pro.
              </p>
              <Link href="/dashboard?v=billing" style={{ border: 0, borderRadius: 8, background: '#fff',
                color: '#222', padding: '8px 13px', fontWeight: 800, fontSize: 11,
                textDecoration: 'none', display: 'inline-block' }}>Explore Pro →</Link>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10,
          borderTop: '1px solid #e9eaf2', padding: '16px 9px 0' }}>
          {userAvatar
            ? <img src={userAvatar} alt="" style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, flexShrink: 0,
                borderRadius: 10, background: 'linear-gradient(135deg,#8050fa,#3d9cf9)',
                color: '#fff', fontWeight: 800, fontSize: 13 }}>
                {displayName[0]?.toUpperCase()}
              </div>
          }
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</strong>
            <small style={{ display: 'block', color: '#83899c', fontSize: 10, marginTop: 2 }}>Personal account</small>
          </div>
          <button onClick={() => signOut(() => router.push('/'))}
            style={{ marginLeft: 'auto', border: 0, background: 'transparent',
              color: '#a2a6b4', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0 }}
            title="Sign out">⋯</button>
        </div>
      </div>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────
   ScoreAuditModal — shown when user clicks a "Blocked ↗" tile.
   Extracted as a named component to avoid IIFE-inside-fragment
   patterns that the Next.js SWC parser rejects.
──────────────────────────────────────────────────────────────── */
function ScoreAuditModal({ tileKey, auditStatus: st, onClose }) {
  const name = tileKey.charAt(0).toUpperCase() + tileKey.slice(1);
  const stateMessages = {
    blocked:     { heading: 'Blocked by website', body: st?.error?.message || 'The page could not be fetched. The site may be blocking automated requests or behind authentication.', action: 'Retry check' },
    failed:      { heading: 'Check failed',        body: st?.error?.message || 'An error occurred while running this check.',                                                          action: 'Retry check' },
    unavailable: { heading: 'Not available',       body: 'No result was returned for this check.',                                                                                    action: 'Retry check' },
  };
  const msg = stateMessages[st?.status] || { heading: 'Not evaluated', body: 'This check was not run as part of this scan.', action: null };
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: '#00000040', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: '24px',
          maxWidth: 380, width: '90%', boxShadow: '0 20px 60px #00000030' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800, fontSize: 16, color: '#151621' }}>
            {name} — {msg.heading}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#83899c', fontSize: 18, padding: '0 4px' }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.65, margin: '0 0 16px' }}>{msg.body}</p>
        {st?.error?.code && (
          <div style={{ background: '#f4f5fb', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#83899c', fontWeight: 700, fontFamily: 'monospace' }}>
              Error code: {st.error.code}
            </div>
          </div>
        )}
        {st?.attemptedAt && (
          <p style={{ fontSize: 11, color: '#b0b4c8', margin: '0 0 14px' }}>
            Attempted: {new Date(st.attemptedAt).toLocaleString()}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {st?.error?.retryable && msg.action && (
            <button onClick={onClose}
              style={{ flex: 1, background: '#7948f6', color: '#fff', border: 'none', borderRadius: 10,
                padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {msg.action}
            </button>
          )}
          <button onClick={onClose}
            style={{ flex: 1, background: '#f4f5fb', color: '#4b5168', border: 'none', borderRadius: 10,
              padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main component
════════════════════════════════════════════════════════════════ */
export default function ReportClient({ isPro, userName, userAvatar }) {
  const router = useRouter();
  const { slug } = useParams();
  const id = slug; // kept for internal API calls that still use the slug as identifier
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [report, setReport]               = useState(null);
  const [status, setStatus]               = useState('loading');
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [copied, setCopied]               = useState(false);
  const [visionStatus, setVisionStatus]   = useState('idle');
  const [liveAnnotations, setLiveAnnotations] = useState(null);
  const [activeTab, setActiveTab]         = useState('overview');
  const [findingsFilter, setFindingsFilter] = useState(null); // null = All
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [drawerContext, setDrawerContext] = useState(null); // { title, category, detail }
  const [tileModal, setTileModal]         = useState(null); // key of tile with unavailable audit
  const [shareToggling, setShareToggling] = useState(false); // in-flight for share toggle
  const [shareOpen, setShareOpen]         = useState(false); // share popover open
  const [advisorInput, setAdvisorInput]   = useState('');   // overview AI advisor input
  const [scanHistory, setScanHistory]     = useState(null); // null=not loaded, []=loaded
  const [comparisonScans, setComparisonScans] = useState(null); // null=not loaded | 'loading' | scan[]
  const [selectedPrevIdx, setSelectedPrevIdx] = useState(1); // index in comparisonScans of the "previous" scan
  const [rescanModal, setRescanModal]     = useState(null); // null | { stageIdx, stage, error }
  // Stage 5: work items — fingerprint → { userStatus, verifiedStatus, ... }
  const [workItems, setWorkItems]         = useState({}); // fingerprint → DB row
  const [workItemsLoaded, setWorkItemsLoaded] = useState(false);
  const [workItemError, setWorkItemError] = useState(null); // { fingerprint, message } for visible error
  const [verifyingFingerprint, setVerifyingFingerprint] = useState(null); // fingerprint being verified
  // Verification result for post-rescan display: { fp, verifiedStatus, findingOutcomes, comparabilityLevel }
  const [verifyResult, setVerifyResult]   = useState(null);
  const [highlightedFp, setHighlightedFp]   = useState(null);            // pre-selected rec from ?rec= param
  // Stage 6: guided fix panel — null = closed, rec object = open
  const [guidedFixRec, setGuidedFixRec]     = useState(null);

  const RESCAN_STAGES = [
    'Fetching page…',
    'Running performance analysis…',
    'Auditing SEO signals…',
    'Checking security headers…',
    'Scanning accessibility…',
    'Identifying site type & UX…',
    'Writing AI insights…',
  ];

  // Load work items for authenticated users when the report URL is known
  useEffect(() => {
    if (!report?.url || workItemsLoaded) return;
    setWorkItemsLoaded(true);
    fetch(`/api/work-items?url=${encodeURIComponent(report.url)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.workItems) setWorkItems(d.workItems); })
      .catch(() => {}); // silent — anon users or load failure: client state still usable
  }, [report?.url, workItemsLoaded]);

  // Load slim scan history (for Progress tab history list + trend chart)
  // Derive domain inline to avoid TDZ — domain const is declared later in render.
  useEffect(() => {
    if (!report?.url) return;
    let d;
    try { d = new URL(report.url).hostname; } catch { d = report.url; }
    if (!d) return;
    fetch(`/api/scan-history?domain=${encodeURIComponent(d)}`)
      .then(r => r.json())
      .then(data => setScanHistory(Array.isArray(data.reports) ? data.reports : []))
      .catch(() => setScanHistory([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.url]);

  // Load enriched comparison data (for Progress tab fix verification + overview)
  // report.url is stable for the life of the report; run once when url is known.
  useEffect(() => {
    if (!report?.url) return;
    setComparisonScans('loading');
    fetch(`/api/scan-history?url=${encodeURIComponent(report.url)}&full=true`)
      .then(r => r.json())
      .then(d => setComparisonScans(Array.isArray(d.scans) ? d.scans : []))
      .catch(() => setComparisonScans([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.url]);

  /**
   * Persist a status change for an authenticated user.
   * Optimistic update: apply immediately, rollback + show error on failure.
   */
  async function handleStatusChange(issue, newStatus) {
    if (!report?.url) return;
    const fingerprint = issue.fingerprintId || issue.fingerprint || '';
    if (!fingerprint) return;

    // Optimistic update
    const prev = workItems[fingerprint];
    setWorkItems(wi => ({
      ...wi,
      [fingerprint]: { ...(wi[fingerprint] || {}), userStatus: newStatus, recFingerprint: fingerprint },
    }));
    setWorkItemError(null);

    try {
      const res = await fetch('/api/work-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recFingerprint: fingerprint, pageUrl: report.url, userStatus: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const d = await res.json();
      if (d.workItem) {
        setWorkItems(wi => ({ ...wi, [fingerprint]: d.workItem }));
      }
    } catch (err) {
      // Rollback on failure — restore previous state
      setWorkItems(wi => {
        const next = { ...wi };
        if (prev) next[fingerprint] = prev; else delete next[fingerprint];
        return next;
      });
      setWorkItemError({
        fingerprint,
        message: `Could not save status: ${err.message}. Your change was not saved.`,
      });
    }
  }

  /**
   * Initiate the Verify fix flow for a specific finding:
   *   1. Mark work item as 'verify' (saved to DB)
   *   2. Trigger a rescan
   *   3. After rescan, navigate to the new report — which will call the verify API
   */
  function handleVerify(issue) {
    if (!report?.url) return;
    const fingerprint = issue.fingerprintId || issue.fingerprint || '';
    setVerifyingFingerprint(fingerprint || null);
    // Mark as 'verify' in DB optimistically
    if (fingerprint) handleStatusChange(issue, 'verify');
    // Trigger a rescan
    handleRescan(fingerprint || null);
  }

  function handleRescan(verifyFp = null) {
    // Defensive: ignore non-string arguments (e.g. React SyntheticEvent passed via onClick={handleRescan})
    const fp = typeof verifyFp === 'string' && verifyFp ? verifyFp : null;
    if (!report?.url) return;
    setRescanModal({ stageIdx: 0, stage: RESCAN_STAGES[0], error: null });
    let step = 0;
    const timer = setInterval(() => {
      step = Math.min(step + 1, RESCAN_STAGES.length - 1);
      setRescanModal(m => m && !m.error ? { ...m, stageIdx: step, stage: RESCAN_STAGES[step] } : m);
    }, 2200);
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: report.url }),
    })
      .then(r => r.json())
      .then(d => {
        clearInterval(timer);
        if (d.error) {
          setRescanModal(m => m ? { ...m, error: d.error || 'Scan failed. Please try again.' } : m);
        } else {
          const newSlug = d.reportSlug || d.reportId;
          setRescanModal(null);
          // ?from=rescan auto-opens Progress tab; ?verify=<fp> carries the fingerprint to verify
          const params = new URLSearchParams({ from: 'rescan' });
          if (fp) params.set('verify', fp);
          if (report.id) params.set('prevReportId', String(report.id));
          router.push(`/report/${newSlug}?${params}`);
        }
      })
      .catch(() => {
        clearInterval(timer);
        setRescanModal(m => m ? { ...m, error: 'Something went wrong. Please try again.' } : m);
      });
  }

  const displayName = userName || 'User';

  // Auto-open tabs based on URL params on mount:
  //   ?from=rescan     → Progress tab (user just rescanned)
  //   ?rec=<fp>        → Action Plan tab with that rec pre-selected and highlighted
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'rescan') {
      setActiveTab('progress');
    } else {
      const recFp = params.get('rec');
      if (recFp) {
        setActiveTab('action');
        setHighlightedFp(recFp);
      }
    }
  }, []);

  // When a ?verify=<fingerprint>&prevReportId=<id> arrives on a freshly loaded report,
  // call the server-side verification API and update work item state.
  useEffect(() => {
    if (!report?.id) return;
    const params = new URLSearchParams(window.location.search);
    const fp = params.get('verify');
    const prevId = params.get('prevReportId');
    if (!fp || !prevId) return;

    // Run server-side verification once
    fetch('/api/work-items/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recFingerprint: fp,
        previousReportId: Number(prevId),
        currentReportId: report.id,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.verifiedStatus) {
          setWorkItems(wi => ({
            ...wi,
            [fp]: {
              ...(wi[fp] || {}),
              verifiedStatus: d.verifiedStatus,
              verifiedAt: d.comparedAt,
              verifiedReportId: d.currentReportId,
            },
          }));
          // Store the result so the VerificationResultBanner can display it
          setVerifyResult({
            fp,
            verifiedStatus: d.verifiedStatus,
            findingOutcomes: d.findingOutcomes || [],
            comparabilityLevel: d.comparabilityLevel || 'full',
          });
        }
      })
      .catch(() => {}); // verification failure is non-fatal; result shown in UI on next load
  }, [report?.id]);

  useEffect(() => {
    const params = new URLSearchParams({ slug });
    if (sessionId) params.set('session_id', sessionId);
    fetch(`/api/report?${params}`)
      .then(async r => {
        const d = await r.json();
        if (r.status === 403) { setStatus('private'); return; }
        if (d.error) { setStatus('error'); return; }
        setReport(d);
        setStatus('ok');
        if (d.uxAnnotations) { setVisionStatus('done'); return; }
        setVisionStatus('loading');
        fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: d.id }),
        })
          .then(r => r.json())
          .then(v => {
            if (v.uxAnnotations) { setLiveAnnotations(v.uxAnnotations); setVisionStatus('done'); }
            else { setVisionStatus('error'); }
          })
          .catch(() => setVisionStatus('error'));
      })
      .catch(() => setStatus('error'));
  }, [id, sessionId]);

  const domain = (() => {
    try { return new URL(report?.url || '').hostname; } catch { return report?.url || ''; }
  })();

  const createdAt = report?.createdAt
    ? new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const allIssues = report?.issues || [];

  const priorities = allIssues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 7);

  // Stage 5: fingerprint → recommendation map, built once per report load
  const recMap = buildRecMap(report?.recommendations || []);

  const getImpact = (issue, idx) =>
    issue.severity === 'critical' || idx < 2 ? 'high' : idx < 5 ? 'medium' : 'low';

  // Fallback discoveries
  const fallbackDiscoveries = (() => {
    if (report?.aiInsights) return null;
    const scores = report?.scores || {};
    const groups = [
      { category: 'Performance', match: i => i.area?.toLowerCase().includes('perf') || i.area?.toLowerCase().includes('best'), score: scores.performance },
      { category: 'SEO',         match: i => i.area?.toLowerCase().includes('seo')  || i.source === 'seo',   score: scores.seo },
      { category: 'Security',    match: i => i.area?.toLowerCase().includes('sec')  || i.source === 'ssl',   score: scores.security },
      { category: 'Accessibility', match: i => i.area?.toLowerCase().includes('access') || i.source === 'a11y', score: scores.accessibility },
    ];
    // Evidence-based discovery titles — connect what was found to potential user impact
    const discoveryTitle = (cat, issues, score) => {
      const top = issues[0];
      if (cat === 'Performance') {
        if (issues.some(i => /render.block|network.dep|critical.request/i.test(i.message || '')))
          return 'Critical resources are delaying your page\'s initial render';
        if (issues.some(i => /lcp|largest.content/i.test(i.message || '')))
          return 'Your largest content element is loading too slowly';
        return `${issues.length} performance issue${issues.length > 1 ? 's' : ''} may be slowing page load`;
      }
      if (cat === 'SEO') {
        if (issues.some(i => /meta|description|title/i.test(i.message || '')))
          return 'Missing or weak metadata may limit how search engines present this site';
        if (issues.some(i => /crawl|index|canonical/i.test(i.message || '')))
          return 'Crawlability issues could prevent some pages from being indexed';
        return `${issues.length} SEO issue${issues.length > 1 ? 's' : ''} may be limiting organic visibility`;
      }
      if (cat === 'Security') {
        if (issues.some(i => /header|csp|hsts/i.test(i.message || '')))
          return 'Missing security headers leave this site exposed to common attacks';
        return `Security configuration gaps could put visitors at risk`;
      }
      if (cat === 'Accessibility') {
        if (issues.some(i => /contrast|color/i.test(i.message || '')))
          return 'Low contrast text may be unreadable for visitors with visual impairments';
        if (issues.some(i => /label|aria|alt/i.test(i.message || '')))
          return 'Missing labels prevent screen readers from describing interactive elements';
        return `${issues.length} accessibility issue${issues.length > 1 ? 's' : ''} may exclude some visitors`;
      }
      return top?.message || `${cat} issues detected`;
    };

    const discoveryExplanation = (cat, issues, score) => {
      const critCount = issues.filter(i => i.severity === 'critical').length;
      const top = issues.slice(0, 2).map(i => i.message).filter(Boolean);
      const what = top.length ? `Audit found: ${top.join('; ').slice(0, 120)}.` : '';
      const outcome = {
        Performance: 'Fixing these may improve how quickly visitors see your main content.',
        SEO: 'Resolving these can improve how search engines rank and display your pages.',
        Security: 'Addressing these hardens the site against common vulnerabilities.',
        Accessibility: 'Fixing these ensures all visitors can navigate and use the site.',
      }[cat] || 'Addressing these will improve your score.';
      return `${what} ${outcome}`.trim();
    };

    const discoveries = [];
    for (const g of groups) {
      if (g.score == null || g.score >= 90) continue;
      const issues = allIssues.filter(i => (i.severity === 'critical' || i.severity === 'warning') && g.match(i)).slice(0, 3);
      if (issues.length === 0) continue;
      const conf = g.score < 50 ? 'high' : g.score < 70 ? 'medium' : 'low';
      discoveries.push({
        title: discoveryTitle(g.category, issues, g.score),
        explanation: discoveryExplanation(g.category, issues, g.score),
        confidence: conf, category: g.category,
        actions: issues.map(i => ({
          title: i.message,
          detail: i.description || i.fix || 'Review and resolve this issue.',
          impact: i.severity === 'critical' ? 'high' : 'medium', effort: 'medium',
        })),
      });
    }
    return discoveries.length > 0 ? discoveries : null;
  })();

  const effectiveDiscoveries = report?.aiInsights || fallbackDiscoveries;

  // auditStatuses is extracted from the scores JSONB by mapRow at read time
  // and surfaced as report.auditStatuses (top-level field, not nested in scores).
  const auditStatuses = report?.auditStatuses || {};

  const sectionSummaries = report?.sectionSummaries || null;

  const detailCategories = [
    { label: 'Performance',   accent: '#7948f6', auditKey: 'performance',   summaryKey: 'performance',   match: i => i.area?.toLowerCase().includes('perf') || i.area?.toLowerCase().includes('best') },
    { label: 'SEO',           accent: '#3687fa', auditKey: 'seo',           summaryKey: 'seo',           match: i => i.area?.toLowerCase().includes('seo')  || i.source === 'seo' },
    { label: 'Security',      accent: '#19b987', auditKey: 'security',      summaryKey: 'security',      match: i => i.area?.toLowerCase().includes('sec')  || i.source === 'ssl' },
    { label: 'Accessibility', accent: '#efa642', auditKey: 'accessibility', summaryKey: 'accessibility', match: i => i.area?.toLowerCase().includes('access') || i.source === 'a11y' },
  ];

  // Navigate to Findings tab filtered to a category
  function goToFindings(cat) {
    setActiveTab('findings');
    setFindingsFilter(cat);
  }

  const uxScore = report?.uxScore ?? (
    report?.scores?.performance != null && report?.scores?.accessibility != null
      ? Math.round((report.scores.performance + report.scores.accessibility) / 2)
      : null
  );

  const css = `
    :root { color-scheme: light }
    *, *::before, *::after { box-sizing: border-box }
    @keyframes spin { to { transform: rotate(360deg) } }
    .score-tile:hover { box-shadow: 0 4px 16px #1b1d3212; transform: translateY(-1px) }
    .tab-btn { transition: color .15s, border-color .15s }
    @media (max-width: 940px) {
      .rep-outer { grid-template-columns: 1fr !important }
      .dash-sidebar { position: fixed; left: -260px; top: 0; bottom: 0; transition: left .25s; z-index: 20 }
      .dash-sidebar.open { left: 0; box-shadow: 4px 0 24px #0d102040 }
    }
  `;

  /* ── Tab content ── */
  const renderOverview = () => (
    <div>
      {/* Cernly's Take — structured interpretation of this specific scan */}
      {(() => {
        const recs = report.recommendations || [];
        const topRec = recs[0] || null;
        const assessment = report.assessment || null;
        const assessmentStatus = report.assessmentStatus || null;
        const hasAssessment = assessmentStatus === 'completed' && assessment;

        // Suggested questions tailored to what we actually found
        const suggestedQs = topRec
          ? [
              `How do I fix "${(topRec.title || '').slice(0, 40)}${topRec.title?.length > 40 ? '…' : ''}"?`,
              'What should I prioritize first?',
              'How long will these fixes take?',
              'What else needs attention?',
            ]
          : ['What should I fix first?', 'How do I improve my LCP score?', 'What SEO issues hurt me most?', 'How do I fix my security headers?'];

        // Top opportunity from assessment, linked to the actual saved recommendation
        const topOpportunity = hasAssessment ? assessment.top_opportunity : null;
        const linkedRec = topOpportunity?.recommendation_fingerprints?.length
          ? recs.find(r => topOpportunity.recommendation_fingerprints.includes(r.fingerprintId)) || topRec
          : topRec;
        const displayRec = hasAssessment ? linkedRec : topRec;
        const firstAction = displayRec?.actions?.[0] || null;

        // Only show limitations when non-trivial
        const limitations = hasAssessment && assessment.coverage?.limitations
          && !assessment.coverage.limitations.match(/^no significant/i)
          ? assessment.coverage.limitations : null;

        // Low-confidence note
        const confidenceNote = hasAssessment && assessment.confidence?.level === 'low'
          ? assessment.confidence?.explanation : null;

        // CTA buttons (shared between assessment and fallback paths)
        // recFp: fingerprint of the top rec to pre-select (optional)
        // rec:   full rec object — opens GuidedFix panel for all supported groups
        const renderCTAs = (showActionPlan, recFp = null, rec = null) => (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            {showActionPlan && (
              rec ? (
                <button onClick={() => setGuidedFixRec(rec)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                    background: 'linear-gradient(135deg,#8a46f8,#3687fa)', color: '#fff',
                    border: 0, borderRadius: 9, padding: '10px 18px', fontSize: 13,
                    fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 18px #7948f640', letterSpacing: '-.01em' }}>
                  Guide me through this fix
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              ) : (
                <button onClick={() => { setActiveTab('action'); if (recFp) setHighlightedFp(recFp); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                    background: 'linear-gradient(135deg,#8a46f8,#3687fa)', color: '#fff',
                    border: 0, borderRadius: 9, padding: '10px 18px', fontSize: 13,
                    fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 18px #7948f640', letterSpacing: '-.01em' }}>
                  See how to fix this
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>
              )
            )}
          </div>
        );

        return (
          <div style={{ background: 'linear-gradient(145deg,#16102b,#0f1f3d)',
            borderRadius: 18, padding: '22px 22px 18px', marginBottom: 26,
            boxShadow: '0 8px 32px rgba(121,72,246,.22)' }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10,
                background: 'linear-gradient(135deg,#8a46f8,#3687fa)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
                boxShadow: '0 3px 12px #7948f650' }}>
                <span style={{ color: '#fff', fontSize: 15, lineHeight: 1 }}>✦</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                  fontWeight: 800, fontSize: 13, color: '#fff', letterSpacing: '.01em' }}>CERNLY&apos;S TAKE</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>AI-generated · based on this scan</div>
              </div>
              <button onClick={() => { setDrawerContext(null); setDrawerOpen(true); }}
                style={{ border: '1.5px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)',
                  color: '#c5b4fa', borderRadius: 8, padding: '5px 13px', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                  gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span style={{ fontSize: 12 }}>✦</span> Ask Cernly
              </button>
            </div>

            {/* ── MAIN CONTENT — problem-led, CTA-focused ── */}
            {(() => {
              // Derive the best headline and body text
              const headline = hasAssessment && assessment.headline
                ? assessment.headline
                : topRec
                  ? `Your biggest opportunity is: ${topRec.title.toLowerCase()}.`
                  : 'Your site has improvement opportunities.';

              const summaryText = hasAssessment && assessment.summary
                ? assessment.summary
                : topRec
                  ? (topRec.why_it_matters || topRec.what_we_found || topRec.explanation || null)
                  : assessmentStatus === 'failed'
                    ? 'Analysis failed for this scan. Rescan to generate a fresh assessment.'
                    : null;

              // The rec to link to — prefer assessment's linked rec, fall back to topRec
              const ctaRec = hasAssessment ? displayRec : topRec;

              // No-issues state
              if (recs.length === 0 && hasAssessment) {
                return (
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center',
                    background: 'rgba(25,185,135,.12)', border: '1px solid rgba(25,185,135,.3)',
                    borderRadius: 9, padding: '12px 14px', marginBottom: 16 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3fe8b9"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 4 4 10-10"/>
                    </svg>
                    <span style={{ fontSize: 13, color: '#3fe8b9', fontWeight: 600 }}>
                      Your site is in good shape — no critical improvements identified.
                    </span>
                  </div>
                );
              }

              return (
                <>
                  {/* Partial-scan warning */}
                  {hasAssessment && assessment.coverage?.audits_failed?.length > 0 && (
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start',
                      background: 'rgba(239,166,66,.1)', border: '1px solid rgba(239,166,66,.2)',
                      borderRadius: 9, padding: '9px 12px', marginBottom: 12 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#efa642"
                        strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <span style={{ fontSize: 11, color: '#fbbf6a', lineHeight: 1.5 }}>
                        <strong>Partial scan — </strong>
                        {assessment.coverage.audits_failed.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(' and ')}{' '}
                        data unavailable. Conclusions about {assessment.coverage.audits_failed.length === 1 ? 'that area' : 'those areas'} are omitted.
                      </span>
                    </div>
                  )}

                  {/* Site-specific headline */}
                  <h3 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                    fontSize: 20, lineHeight: 1.3, letterSpacing: '-.03em',
                    fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>
                    {headline}
                  </h3>

                  {/* Summary body */}
                  {summaryText && (
                    <p style={{ fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,.6)',
                      margin: '0 0 16px' }}>
                      {summaryText}
                    </p>
                  )}

                  {/* START HERE box — primary recommendation */}
                  {ctaRec && (
                    <div style={{ background: 'rgba(121,72,246,.12)',
                      border: '1px solid rgba(121,72,246,.3)', borderRadius: 12,
                      padding: '14px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.12em',
                        textTransform: 'uppercase', color: '#a78bfa', marginBottom: 8 }}>
                        Start here
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#fff',
                        margin: '0 0 5px', lineHeight: 1.35 }}>
                        {ctaRec.title}
                      </p>
                      {(ctaRec.what_we_found || ctaRec.why_it_matters || ctaRec.explanation) && (
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.55)',
                          margin: '0 0 10px', lineHeight: 1.65 }}>
                          {ctaRec.what_we_found || ctaRec.why_it_matters || ctaRec.explanation}
                        </p>
                      )}
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)',
                        display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>⏱</span>
                        <span>Step-by-step guidance · Adapted to your experience</span>
                      </div>
                    </div>
                  )}

                  {/* Primary CTA — full width */}
                  {ctaRec && (
                    <button
                      onClick={() => setGuidedFixRec(ctaRec)}
                      style={{ width: '100%', maxWidth: 280, padding: '13px',
                        background: 'linear-gradient(135deg,#8a46f8,#3687fa)',
                        border: 0, borderRadius: 10, color: '#fff',
                        fontSize: 14, fontWeight: 800, cursor: 'pointer',
                        fontFamily: 'inherit', marginBottom: 14,
                        boxShadow: '0 4px 20px rgba(121,72,246,.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        letterSpacing: '-.01em' }}>
                      Start guided improvement
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  )}

                  {/* Secondary: strengths (collapsed by default intent — shown small) */}
                  {hasAssessment && assessment.strengths?.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {assessment.strengths.slice(0, 2).map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7,
                          alignItems: 'flex-start', padding: '3px 0' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                            stroke="#19b987" strokeWidth="2.5" strokeLinecap="round"
                            strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                            <path d="m5 12 4 4 10-10"/>
                          </svg>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>
                            <strong style={{ color: 'rgba(61,232,185,.6)' }}>Working well:</strong>{' '}
                            {s.finding}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Low-confidence note */}
                  {confidenceNote && (
                    <div style={{ background: 'rgba(239,166,66,.08)',
                      border: '1px solid rgba(239,166,66,.2)', borderRadius: 8,
                      padding: '8px 12px', marginBottom: 10, fontSize: 11,
                      color: '#fbbf6a', lineHeight: 1.5 }}>
                      <strong>Note:</strong> {confidenceNote}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Ask Cernly suggestions — at bottom of dark card */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 14 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {suggestedQs.map(q => (
                  <button key={q}
                    onClick={() => { setAdvisorInput(''); setDrawerContext({ _initialMessage: q }); setDrawerOpen(true); }}
                    style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)',
                      borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                      color: 'rgba(255,255,255,.65)', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4 }}>
                    {q}
                  </button>
                ))}
              </div>

              {/* Inline input */}
              <div style={{ background: 'rgba(255,255,255,.07)', borderRadius: 10,
                border: '1px solid rgba(255,255,255,.14)',
                display: 'flex', alignItems: 'center', padding: '7px 7px 7px 12px', gap: 7 }}>
                <input
                  value={advisorInput}
                  onChange={e => setAdvisorInput(e.target.value)}
                  placeholder="Ask anything about this report…"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && advisorInput.trim()) {
                      const q = advisorInput.trim();
                      setAdvisorInput('');
                      setDrawerContext({ _initialMessage: q });
                      setDrawerOpen(true);
                    }
                  }}
                  style={{ flex: 1, background: 'none', border: 0, outline: 0,
                    fontSize: 12, color: '#fff', fontFamily: 'inherit', minWidth: 0 }}
                />
                <button onClick={() => {
                  if (!advisorInput.trim()) { setDrawerContext(null); setDrawerOpen(true); return; }
                  const q = advisorInput.trim();
                  setAdvisorInput('');
                  setDrawerContext({ _initialMessage: q });
                  setDrawerOpen(true);
                }}
                  style={{ border: 0, background: '#7948f6', color: '#fff', borderRadius: 7,
                    width: 26, height: 26, display: 'grid', placeItems: 'center',
                    cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Top discoveries — show only when assessment doesn't already cover this territory.
          When a completed assessment has strengths/concerns, those cover the same info. */}
      {!(report.assessmentStatus === 'completed' && report.assessment &&
          ((report.assessment.strengths?.length > 0) || (report.assessment.concerns?.length > 0))) &&
        Array.isArray(effectiveDiscoveries) && effectiveDiscoveries.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
            <span style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
              fontWeight: 800, fontSize: 13, color: '#151621' }}>Key discoveries</span>
            {report.aiInsights && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#7948f6',
                background: '#f1edff', padding: '2px 8px', borderRadius: 5 }}>AI ANALYSIS</span>
            )}
            <span style={{ fontSize: 11, color: '#83899c', marginLeft: 'auto' }}>
              {effectiveDiscoveries.length} finding{effectiveDiscoveries.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {effectiveDiscoveries.slice(0, 3).map((d, i) => <DiscoveryCard key={i} d={d} index={i} />)}
          </div>
          {effectiveDiscoveries.length > 3 && (
            <button onClick={() => setActiveTab('findings')}
              style={{ border: '1px solid #e9eaf2', background: '#fff', color: '#7948f6',
                borderRadius: 10, padding: '10px 16px', width: '100%', marginTop: 8,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              View all {effectiveDiscoveries.length} findings in Findings →
            </button>
          )}
        </div>
      )}

    </div>
  );

  const renderActionPlan = () => (
    <div>
      {/* Header with journey breadcrumb */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {['Understand', 'Fix', 'Verify'].map((step, i) => (
            <React.Fragment key={step}>
              <span style={{ fontSize: 11, fontWeight: 700,
                color: step === 'Fix' ? '#7948f6' : '#b0b4c8',
                background: step === 'Fix' ? '#f1edff' : 'transparent',
                borderRadius: 6, padding: step === 'Fix' ? '2px 8px' : '2px 0' }}>{step}</span>
              {i < 2 && <span style={{ color: '#d4d6e0', fontSize: 11 }}>›</span>}
            </React.Fragment>
          ))}
        </div>
        <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
          fontSize: 16, color: '#151621', margin: '0 0 4px', letterSpacing: '-.02em' }}>
          Action plan
        </h2>
        <p style={{ fontSize: 13, color: '#83899c', margin: 0 }}>
          {priorities.length} prioritized fixes · mark progress as you go
        </p>
        {/* Work-item status tally — only when there are tracked items */}
        {(() => {
          const counts = { open: 0, in_progress: 0, verify: 0, fixed: 0, still_open: 0, unable_verify: 0 };
          priorities.forEach(issue => {
            const fp = issue.fingerprintId || issue.fingerprint || '';
            const wi = workItems[fp];
            const vs = wi?.verifiedStatus;
            const us = wi?.userStatus || 'open';
            let key;
            if (vs === 'likely_resolved')    key = 'fixed';
            else if (vs === 'still_detected' || vs === 'partially_resolved') key = 'still_open';
            else if (vs === 'unable_to_verify') key = 'unable_verify';
            else key = us;
            if (counts[key] !== undefined) counts[key]++;
          });
          const active = Object.entries(counts).filter(([, v]) => v > 0);
          if (active.length === 0 || !workItemsLoaded) return null;
          return (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {active.map(([key, count]) => {
                const st = FIX_STATUSES[key];
                if (!st) return null;
                return (
                  <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: st.bg, borderRadius: 20, padding: '3px 10px',
                    fontSize: 11, fontWeight: 700, color: st.color }}>
                    {count} {st.label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Persistence error banner */}
      {workItemError && (
        <div style={{ background: '#fff0f2', border: '1px solid #fca5a5', borderRadius: 10,
          padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef6473" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M12 2L2 19h20L12 2zm0 7v5m0 3h.01"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{workItemError.message}</span>
          </div>
          <button onClick={() => setWorkItemError(null)}
            style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, padding: 0, fontFamily: 'inherit', flexShrink: 0 }}>×</button>
        </div>
      )}

      {priorities.length === 0 ? (
        <div style={{ background: '#edf9f4', borderRadius: 14, padding: '22px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
          <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
            fontWeight: 800, fontSize: 15, color: '#151621', marginBottom: 6 }}>No critical issues found</div>
          <div style={{ fontSize: 13, color: '#4b5168' }}>This site is in good shape. Keep monitoring for regressions.</div>
        </div>
      ) : (
        priorities.map((issue, i) => {
          // Resolve rec from the fingerprint map using issue's own fingerprint or fingerprintId
          const fp = issue.fingerprintId || issue.fingerprint || '';
          // Find the matched rec: try exact fingerprint, then check each rec's finding_fingerprints
          const matchedRec = recMap[fp] || null;
          const workItem = workItems[fp] || null;
          return (
            <FixCard key={i} issue={issue} n={i + 1} impact={getImpact(issue, i)}
              rec={matchedRec}
              workItem={workItem}
              highlighted={!!fp && fp === highlightedFp}
              onStatusChange={handleStatusChange}
              onGuide={(r) => setGuidedFixRec(r)}
              onAskCernly={(iss, suggestedQ, matchedRec, extra) => {
                setDrawerContext({
                  title: iss.message,
                  category: iss.area,
                  detail: iss.description || iss.detail,
                  // Always forward the issue's stable fingerprint so /api/ask can build
                  // focusBlock and auto-resolve the rec even when matchedRec is null.
                  ...(iss.fingerprintId ? { _findingFingerprintId: iss.fingerprintId } : {}),
                  // Forward rec fingerprint for full recommendation context when available
                  ...(matchedRec?.fingerprint ? { _recFingerprint: matchedRec.fingerprint } : {}),
                  ...(suggestedQ ? { _initialMessage: suggestedQ } : {}),
                  // Per-element context: passed when user clicks "Fix this →" on a specific item
                  ...(extra?.element ? { _elementContext: extra.element } : {}),
                });
                setDrawerOpen(true);
              }}
              onVerify={handleVerify}
            />
          );
        })
      )}
    </div>
  );

  const renderFindings = () => {
    const filters = ['All', 'Performance', 'SEO', 'Security', 'Accessibility', 'Visual'];
    const active = findingsFilter || 'All';
    return (
      <div>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {filters.map(f => (
            <button key={f}
              onClick={() => setFindingsFilter(f === 'All' ? null : f)}
              style={{ border: `1.5px solid ${active === f ? '#7948f6' : '#e9eaf2'}`,
                background: active === f ? '#7948f6' : '#fff',
                color: active === f ? '#fff' : '#707688',
                borderRadius: 9, padding: '6px 13px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s' }}>
              {f}
            </button>
          ))}
        </div>

        {/* Visual Experience sub-view */}
        {(active === 'All' || active === 'Visual') && (
          <UxCard
            uxScore={uxScore}
            uxInsights={report.uxInsights}
            uxAnnotations={liveAnnotations || report.uxAnnotations}
            visionStatus={visionStatus}
            siteType={report.siteType}
            url={report.url}
            issues={allIssues}
          />
        )}

        {/* Technical categories */}
        {active !== 'Visual' && detailCategories
          .filter(c => active === 'All' || c.label === active)
          .map(({ label, accent, auditKey, summaryKey, match }) => (
            <CategorySection key={label} label={label} accent={accent}
              issues={allIssues.filter(match)}
              auditStatus={auditStatuses[auditKey]}
              sectionSummary={sectionSummaries?.[summaryKey] || null}
              recMap={recMap}
              onGuide={(r) => setGuidedFixRec(r)} />
          ))
        }
      </div>
    );
  };


  return (
    <div style={{ background: '#f8f9fd', minHeight: '100vh', colorScheme: 'light',
      fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)', color: '#151621' }}>
      <style>{css}</style>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: '#0d102060', zIndex: 19 }} />
      )}

      {/* Ask Cernly drawer — shown on demand */}
      {drawerOpen && report && (
        <AskCernlyDrawer reportId={id} domain={domain}
          initialContext={drawerContext?._initialMessage ? null : drawerContext}
          initialMessage={drawerContext?._initialMessage || null}
          findingFingerprintId={drawerContext?._findingFingerprintId || null}
          recFingerprint={drawerContext?._recFingerprint || null}
          activeStep={drawerContext?._activeStep || null}
          elementContext={drawerContext?._elementContext || null}
          seedMessages={drawerContext?._seedMessages || null}
          onClose={() => { setDrawerOpen(false); setDrawerContext(null); }} />
      )}

      {/* Guided Fix panel — PoC: image-optimization group only */}
      {guidedFixRec && report && (
        <GuidedFix
          rec={guidedFixRec}
          reportId={id}
          reportIntegerId={report.id}
          pageUrl={report.url}
          workItem={workItems[guidedFixRec.fingerprint] || null}
          onClose={() => setGuidedFixRec(null)}
          onStatusChange={(recFp, newStatus) => {
            // Adapt fingerprint-based call to issue-based handleStatusChange
            handleStatusChange({ fingerprintId: recFp, fingerprint: recFp }, newStatus);
          }}
          onRescan={handleRescan}
          onAskCernly={({ title, category, detail, recFingerprint, activeStep }) => {
            setDrawerContext({
              title, category, detail,
              _recFingerprint: recFingerprint,
              _activeStep: activeStep,
            });
            setDrawerOpen(true);
          }}
          onExpandChat={(messages, step) => {
            // Open the main Ask Cernly drawer seeded with the inline chat's conversation.
            // GuidedFix stays open; closing the drawer returns to the same step.
            setDrawerContext({
              title: step?.title || 'Guided Fix',
              category: 'Guided Fix',
              detail: step?.description || null,
              _recFingerprint: guidedFixRec?.fingerprint || null,
              _activeStep: step?.title || null,
              _seedMessages: messages,
            });
            setDrawerOpen(true);
          }}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '244px minmax(0,1fr)', minHeight: '100vh' }}
        className="rep-outer">

        <Sidebar isPro={isPro} displayName={displayName} userAvatar={userAvatar} sidebarOpen={sidebarOpen} />

        <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Topbar */}
          <header style={{ height: 66, background: '#ffffffee', backdropFilter: 'blur(12px)',
            borderBottom: '1px solid #e9eaf2', display: 'flex', alignItems: 'center',
            padding: '0 26px', gap: 14, position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#83899c' }}>
              <Link href="/dashboard" style={{ color: '#83899c', textDecoration: 'none', fontWeight: 600 }}>Workspace</Link>
              <span style={{ opacity: .5 }}>›</span>
              <span style={{ color: '#151621', fontWeight: 700 }}>Website report</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {/* Ask Cernly button */}
              {report && (
                <button onClick={() => setDrawerOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                    background: 'linear-gradient(135deg,#8a46f8,#3687fa)', color: '#fff',
                    border: 0, borderRadius: 9, fontWeight: 700, fontSize: 12,
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 12, lineHeight: 1 }}>✦</span>
                  Ask Cernly
                </button>
              )}
              {/* Share popover — owners only */}
              {report?.isOwner && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShareOpen(o => !o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                      background: report?.isPublic ? '#edf9f4' : '#f4f5fb',
                      color: report?.isPublic ? '#19b987' : '#4b5168',
                      border: 0, borderRadius: 9, fontWeight: 700, fontSize: 12,
                      cursor: 'pointer', fontFamily: 'inherit' }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    {report?.isPublic ? 'Shared' : 'Share'}
                  </button>

                  {shareOpen && (
                    <>
                      {/* click-away backdrop */}
                      <div onClick={() => setShareOpen(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 89 }} />
                      <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                        background: '#fff', border: '1px solid #e9eaf2', borderRadius: 14,
                        boxShadow: '0 8px 32px #1b1d3220', zIndex: 90, width: 280, padding: '16px' }}>

                        <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                          fontWeight: 800, fontSize: 13, color: '#151621', marginBottom: 4 }}>Share report</div>
                        <p style={{ fontSize: 12, color: '#83899c', margin: '0 0 14px', lineHeight: 1.5 }}>
                          {report?.isPublic
                            ? 'Anyone with the link can view this report.'
                            : 'Make this report public so anyone with the link can view it.'}
                        </p>

                        {/* Visibility toggle row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: '#f8f9fd', borderRadius: 10, padding: '10px 13px', marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#151621' }}>
                              {report?.isPublic ? 'Public' : 'Private'}
                            </div>
                            <div style={{ fontSize: 11, color: '#83899c', marginTop: 1 }}>
                              {report?.isPublic ? 'Link sharing on' : 'Only you can see this'}
                            </div>
                          </div>
                          {/* Toggle switch */}
                          <button
                            disabled={shareToggling}
                            onClick={async () => {
                              setShareToggling(true);
                              try {
                                const next = !report?.isPublic;
                                const res = await fetch(`/api/reports/${report.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ isPublic: next }),
                                });
                                const d = await res.json();
                                if (d.success) setReport(r => ({ ...r, isPublic: next }));
                              } finally { setShareToggling(false); }
                            }}
                            style={{ width: 40, height: 22, borderRadius: 11, border: 0, padding: 0,
                              background: report?.isPublic ? '#19b987' : '#d8dae8',
                              cursor: shareToggling ? 'wait' : 'pointer',
                              position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', top: 3,
                              left: report?.isPublic ? 21 : 3,
                              width: 16, height: 16, borderRadius: '50%', background: '#fff',
                              boxShadow: '0 1px 4px #0002', transition: 'left .18s ease' }} />
                          </button>
                        </div>

                        {/* Copy link row — only shown when public */}
                        {report?.isPublic && (
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(window.location.href)
                                .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
                                .catch(() => {});
                            }}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                              background: copied ? '#edf9f4' : '#f4f5fb', border: '1px solid #e9eaf2',
                              borderRadius: 9, padding: '9px 12px', cursor: 'pointer',
                              fontFamily: 'inherit', transition: 'background .15s' }}>
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                              stroke={copied ? '#19b987' : '#83899c'} strokeWidth={2} strokeLinecap="round">
                              {copied
                                ? <path d="M20 6 9 17l-5-5"/>
                                : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
                              }
                            </svg>
                            <span style={{ fontSize: 12, fontWeight: 700,
                              color: copied ? '#19b987' : '#4b5168', flex: 1, textAlign: 'left',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {copied ? 'Link copied!' : window.location.href}
                            </span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Download PDF — paid reports get direct download; free reports show purchase CTA */}
              {report && (
                report.paid || sessionId
                  ? (
                    <a
                      href={`/api/report/${id}/pdf${sessionId ? `?session_id=${sessionId}` : ''}`}
                      download
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                        background: '#f0fdf4', color: '#16a34a',
                        border: 0, borderRadius: 9, fontWeight: 700, fontSize: 12,
                        cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      PDF Report
                    </a>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/checkout', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reportId: id, url: report.url }),
                          });
                          const data = await res.json();
                          if (data.url) window.location.href = data.url;
                        } catch {}
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                        background: '#f4f5fb', color: '#83899c',
                        border: 0, borderRadius: 9, fontWeight: 700, fontSize: 12,
                        cursor: 'pointer', fontFamily: 'inherit' }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      PDF ($4.99)
                    </button>
                  )
              )}
              <button onClick={() => handleRescan()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                  background: '#151621', color: '#fff',
                  border: 0, borderRadius: 9, fontWeight: 700, fontSize: 12,
                  cursor: 'pointer', fontFamily: 'inherit' }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                </svg>
                Re-scan
              </button>
            </div>
          </header>

          {/* Content */}
          <div style={{ flex: 1, padding: '26px 26px 60px' }}>

            {status === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 42, height: 42, border: '3px solid #e9eaf2', borderTopColor: '#7948f6',
                    borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 14px' }} />
                  <p style={{ color: '#83899c', fontSize: 14, margin: 0 }}>Loading report…</p>
                </div>
              </div>
            )}

            {status === 'private' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', maxWidth: 360 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f2efff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px' }}>
                    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#7948f6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                    fontSize: 20, marginBottom: 8 }}>This report is private</h2>
                  <p style={{ color: '#83899c', fontSize: 13, marginBottom: 22 }}>
                    The owner hasn&apos;t shared this report publicly. If you ran this scan, sign in to view it.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/sign-in" style={{ background: '#7948f6', color: '#fff',
                      padding: '11px 22px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                      display: 'inline-block', textDecoration: 'none' }}>Sign in</Link>
                    <Link href="/" style={{ background: '#f2efff', color: '#7948f6',
                      padding: '11px 22px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                      display: 'inline-block', textDecoration: 'none' }}>Run a free scan</Link>
                  </div>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', maxWidth: 340 }}>
                  <div style={{ fontSize: 38, marginBottom: 14 }}>⚠️</div>
                  <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                    fontSize: 20, marginBottom: 8 }}>Report not found</h2>
                  <p style={{ color: '#83899c', fontSize: 13, marginBottom: 22 }}>
                    This report may have expired or the link is invalid.
                  </p>
                  <Link href="/dashboard" style={{ background: '#7948f6', color: '#fff',
                    padding: '11px 22px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                    display: 'inline-block', textDecoration: 'none' }}>← Back to dashboard</Link>
                </div>
              </div>
            )}

            {status === 'ok' && (
              <React.Fragment>
                {/* Page header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 600, color: '#83899c', textDecoration: 'none' }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M20 12H4m7-7-7 7 7 7"/></svg>
                    Back
                  </Link>
                  <div style={{ width: 1, height: 16, background: '#e9eaf2' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#83899c' }}>Website Report</span>
                  {createdAt && <span style={{ fontSize: 11, color: '#b0b4c4' }}>· {createdAt}</span>}
                </div>

                {/* Domain heading */}
                <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                  fontSize: 'clamp(20px, 2.5vw, 28px)', letterSpacing: '-.05em',
                  color: '#151621', margin: '0 0 18px' }}>{domain}</h1>

                {/* Prominent score cards — NO IIFEs here; SWC rejects fragment-returning IIFEs
                    inside another fragment. All logic uses auditStatuses from component scope. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 0 }}>
                  {[
                    { label: 'Performance',   key: 'performance',   score: report.scores?.performance,   cat: 'Performance' },
                    { label: 'SEO',           key: 'seo',           score: report.scores?.seo,           cat: 'SEO' },
                    { label: 'Security',      key: 'security',      score: report.scores?.security,      cat: 'Security' },
                    { label: 'Accessibility', key: 'accessibility', score: report.scores?.accessibility, cat: 'Accessibility' },
                    { label: 'UX',            key: 'ux',            score: uxScore,                      cat: 'Visual'  },
                  ].map(c => {
                    const st       = auditStatuses[c.key];
                    // unavail only when there's no score AND no completed audit status.
                    // Covers old scans without auditStatuses, and scans where score exists
                    // but auditStatuses wasn't persisted — score presence is the ground truth.
                    const unavail  = c.key !== 'ux' && c.score == null && (!st || st.status !== 'completed');
                    const badgeText  = c.score != null ? null  // score exists → no badge
                                     : !st ? 'Not evaluated'
                                     : st.status === 'blocked'  ? 'Blocked'
                                     : st.status === 'failed'   ? 'Check failed'
                                     : null;
                    const badgeColor = st?.status === 'blocked'  ? '#efa642'
                                     : st?.status === 'failed'   ? '#ef6473'
                                     : '#b0b4c8';
                    const color    = c.score == null ? '#83899c' : c.score >= 80 ? '#19b987' : c.score >= 60 ? '#efa642' : '#ef6473';
                    const critCount = allIssues.filter(i => i.severity === 'critical' && detailCategories.find(d => d.label === c.cat)?.match(i)).length;
                    return (
                      <button key={c.label}
                        onClick={() => unavail ? setTileModal(c.key) : goToFindings(c.cat)}
                        className="score-tile"
                        style={{ background: '#fff',
                          border: unavail ? '1px solid #f0d0a0' : '1px solid #e9eaf2',
                          borderRadius: 14, padding: '18px 14px 14px', textAlign: 'center', cursor: 'pointer',
                          fontFamily: 'inherit', boxShadow: '0 2px 8px #1b1d3205', position: 'relative' }}>
                        <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                          fontWeight: 800, fontSize: 38, lineHeight: 1, color, marginBottom: 5 }}>
                          {c.score ?? '—'}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#83899c', marginBottom: 4 }}>{c.label}</div>
                        {unavail && badgeText
                          ? <div style={{ fontSize: 10, color: badgeColor, fontWeight: 700 }}>{badgeText} ↗</div>
                          : critCount > 0
                            ? <div style={{ fontSize: 10, color: '#ef6473', fontWeight: 700 }}>{critCount} critical</div>
                            : c.score != null
                              ? <div style={{ fontSize: 10, color: '#19b987', fontWeight: 700 }}>
                                  {c.score >= 90 ? 'Excellent' : c.score >= 80 ? 'Good' : c.score >= 60 ? 'Fair' : 'Needs work'}
                                </div>
                              : <div style={{ fontSize: 10, color: '#b0b4c8', fontWeight: 600 }}>Not evaluated</div>
                        }
                      </button>
                    );
                  })}
                </div>
                {/* Unavailable-category explanation banner */}
                {Object.entries(auditStatuses).some(([k, s]) => s.status !== 'completed' && k !== 'ux') && (
                  <div style={{ background: '#fffbf0', border: '1px solid #f0e0b0', borderRadius: 10,
                    padding: '10px 14px', marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M12 2L2 19h20L12 2zm0 7v5m0 3h.01"/>
                    </svg>
                    <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                      <strong>Some checks couldn&apos;t be completed.</strong>{' '}
                      {Object.entries(auditStatuses)
                        .filter(([k, s]) => s.status !== 'completed' && k !== 'ux')
                        .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
                        .join(' and ')}{' '}
                      {Object.entries(auditStatuses).filter(([k, s]) => s.status !== 'completed' && k !== 'ux').length === 1 ? 'result is' : 'results are'} unavailable for this scan. Click the tile for details.
                    </div>
                  </div>
                )}
                {/* Tile detail modal — uses a named component to avoid IIFE-inside-fragment
                    patterns that Next.js SWC rejects with "Expected JSX closing tag for <>" */}
                {tileModal && (
                  <ScoreAuditModal
                    tileKey={tileModal}
                    auditStatus={auditStatuses[tileModal]}
                    onClose={() => setTileModal(null)}
                  />
                )}

                {/* Verification result banner — shown after a rescan + auto-verify flow.
                    Hidden when user is already on the Progress tab, which shows the
                    full RescanBanner with the same information. */}
                {verifyResult && activeTab !== 'progress' && (() => {
                  const { fp, verifiedStatus, findingOutcomes, comparabilityLevel } = verifyResult;
                  const recTitle = recMap[fp]?.title || fp;
                  const STATUS_CONFIG = {
                    likely_resolved:    { label: 'Likely resolved',     bg: '#f0faf4', border: '#22c55e', icon: '✓', color: '#166534' },
                    partially_resolved: { label: 'Partially resolved',  bg: '#fffbeb', border: '#f59e0b', icon: '◑', color: '#92400e' },
                    still_detected:     { label: 'Still detected',      bg: '#fef2f2', border: '#ef4444', icon: '✗', color: '#991b1b' },
                    unable_to_verify:   { label: 'Unable to verify',    bg: '#f8fafc', border: '#94a3b8', icon: '?', color: '#475569' },
                  };
                  const cfg = STATUS_CONFIG[verifiedStatus] || STATUS_CONFIG.unable_to_verify;
                  const isInconclusive = verifiedStatus === 'unable_to_verify' || verifiedStatus === 'partially_resolved';
                  const resolved = findingOutcomes.filter(f => f.outcome === 'likely_resolved');
                  const detected = findingOutcomes.filter(f => f.outcome === 'still_detected');
                  return (
                    <div style={{ margin: '12px 0 20px', padding: '14px 16px', borderRadius: 10,
                      background: cfg.bg, border: `1.5px solid ${cfg.border}`, position: 'relative' }}>
                      <button onClick={() => setVerifyResult(null)}
                        aria-label="Dismiss"
                        style={{ position: 'absolute', top: 10, right: 12, background: 'none',
                          border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', lineHeight: 1 }}>×</button>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 18, lineHeight: '20px', color: cfg.color }}>{cfg.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color, marginBottom: 2 }}>
                            {cfg.label}
                          </div>
                          <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>
                            <strong>{recTitle}</strong>
                          </div>
                          {isInconclusive && (
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                              {verifiedStatus === 'unable_to_verify'
                                ? comparabilityLevel === 'limited'
                                  ? 'The new scan did not have full audit coverage to confirm this fix. Check the Progress tab for details.'
                                  : 'Verification could not be completed with the available scan data.'
                                : 'Some issues from this recommendation were fixed, but others were still detected.'}
                            </div>
                          )}
                          {(resolved.length > 0 || detected.length > 0) && (
                            <div style={{ fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                              {resolved.slice(0, 3).map(f => (
                                <span key={f.fingerprintId} style={{ background: '#dcfce7', color: '#166534',
                                  borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
                                  ✓ {f.title || f.fingerprintId}
                                </span>
                              ))}
                              {detected.slice(0, 3).map(f => (
                                <span key={f.fingerprintId} style={{ background: '#fee2e2', color: '#991b1b',
                                  borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
                                  ✗ {f.title || f.fingerprintId}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <button onClick={() => setActiveTab('progress')}
                              style={{ fontSize: 12, fontWeight: 600, color: '#7948f6', background: 'none',
                                border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                              View full comparison →
                            </button>
                            {/* When partially resolved, offer a direct path to continue fixing remaining issues */}
                            {verifiedStatus === 'partially_resolved' && detected.length > 0 && (
                              <button onClick={() => setActiveTab('action')}
                                style={{ fontSize: 12, fontWeight: 600, color: '#374151', background: '#f3f4f6',
                                  border: '1px solid #d1d5db', borderRadius: 5, padding: '3px 10px',
                                  cursor: 'pointer' }}>
                                Continue fixing remaining issues →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e9eaf2',
                  marginBottom: 24, marginTop: 6 }}>
                  {[
                    { key: 'overview',  label: 'Overview',    icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z' },
                    { key: 'action',    label: 'Action plan', icon: 'm5 12 4 4 10-10' },
                    { key: 'findings',  label: 'Findings',    icon: 'M9 11l3 3L22 4' + 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
                    { key: 'progress',  label: 'Progress',    icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
                  ].map(t => {
                    const isActive = activeTab === t.key;
                    return (
                      <button key={t.key}
                        onClick={() => { setActiveTab(t.key); if (t.key !== 'findings') setFindingsFilter(null); }}
                        className="tab-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: 6,
                          padding: '11px 18px 11px', marginBottom: -1,
                          background: 'none', border: 0, fontFamily: 'inherit',
                          fontSize: 13, fontWeight: isActive ? 800 : 600,
                          color: isActive ? '#7948f6' : '#83899c',
                          borderBottom: isActive ? '2px solid #7948f6' : '2px solid transparent',
                          cursor: 'pointer' }}>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth={isActive ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d={t.icon}/>
                        </svg>
                        {t.label}
                        {t.key === 'action' && priorities.length > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 800, background: '#ef6473',
                            color: '#fff', borderRadius: 20, padding: '1px 6px', lineHeight: 1.5 }}>
                            {priorities.filter(p => p.severity === 'critical').length || priorities.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Tab content */}
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'action'   && renderActionPlan()}
                {activeTab === 'findings' && renderFindings()}
                {activeTab === 'progress' && (
                  <ProgressTab
                    domain={domain}
                    slug={slug}
                    id={id}
                    report={report}
                    scanHistory={scanHistory}
                    comparisonScans={comparisonScans}
                    selectedPrevIdx={selectedPrevIdx}
                    setSelectedPrevIdx={setSelectedPrevIdx}
                    onRescan={handleRescan}
                    onSwitchTab={setActiveTab}
                    fromRescan={new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('from') === 'rescan'}
                    verifyFp={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('verify') : null}
                  />
                )}
              </React.Fragment>
            )}
          </div>
        </main>
      </div>

      {/* ── Rescan modal overlay ── */}
      {rescanModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,16,30,.6)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '44px 40px',
            textAlign: 'center', maxWidth: 400, width: '90%',
            boxShadow: '0 32px 80px #1b1d3235' }}>
            {/* Icon */}
            <div style={{ width: 72, height: 72, borderRadius: 22,
              background: rescanModal.error
                ? 'linear-gradient(135deg,#ef6473,#d94051)'
                : 'linear-gradient(135deg,#8a46f8,#3389ff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px', boxShadow: rescanModal.error
                ? '0 12px 32px #ef647340'
                : '0 12px 32px #7948f640' }}>
              {rescanModal.error ? (
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/>
                </svg>
              ) : (
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              )}
            </div>
            {/* Title */}
            <div style={{ fontFamily: 'var(--font-manrope,Manrope,sans-serif)',
              fontWeight: 800, fontSize: 20, color: '#151621', marginBottom: 8 }}>
              {rescanModal.error ? 'Scan failed' : 'Analyzing your website'}
            </div>
            {/* Stage / error */}
            <div style={{ fontSize: 14, color: '#83899c', marginBottom: 28, minHeight: 22 }}>
              {rescanModal.error || rescanModal.stage}
            </div>
            {/* Progress bar */}
            {!rescanModal.error && (
              <div style={{ background: '#f0f1f8', borderRadius: 100, height: 6,
                overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ height: '100%', borderRadius: 100,
                  background: 'linear-gradient(90deg,#8a46f8,#3389ff)',
                  width: `${Math.round((rescanModal.stageIdx + 1) / RESCAN_STAGES.length * 100)}%`,
                  transition: 'width .6s ease' }}/>
              </div>
            )}
            {rescanModal.error && (
              <button onClick={() => setRescanModal(null)}
                style={{ padding: '10px 24px', background: '#f0f1f8', border: 0,
                  borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit', color: '#151621' }}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
