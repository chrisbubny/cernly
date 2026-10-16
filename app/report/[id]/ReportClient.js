'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';

/* ─── SVG stroke attrs ─── */
const sa = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Icon = ({ children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...sa} {...rest}>{children}</svg>
);

/* ─── Cernly logo mark — exact mark from home page ─── */
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

/* ─── Score tile ─── */
function ScoreTile({ score, label }) {
  const color = score == null ? '#83899c' : score >= 80 ? '#19b987' : score >= 60 ? '#efa642' : '#ef6473';
  return (
    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
      padding: '22px 14px', textAlign: 'center', boxShadow: '0 2px 8px #1b1d3205' }}>
      <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
        fontSize: 46, lineHeight: 1, color, marginBottom: 8 }}>{score ?? '—'}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#83899c' }}>{label}</div>
    </div>
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

/* ─── Finding row — expandable, shows real description ─── */
function FindingRow({ issue }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(issue.description || issue.detail || issue.fix);
  const sev = issue.severity;
  const sevStyle = {
    critical: { bg: '#fff0f2', color: '#ef6473', label: 'Critical' },
    warning:  { bg: '#fff8ed', color: '#d97706', label: 'Warning' },
    good:     { bg: '#edf9f4', color: '#19b987', label: 'Passed' },
    info:     { bg: '#f4f5fb', color: '#83899c', label: 'Info' },
  }[sev] || { bg: '#f4f5fb', color: '#83899c', label: 'Info' };

  // Clean description — strip markdown links like [text](url)
  const cleanDesc = (str) => str?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') || '';

  return (
    <div style={{ borderBottom: '1px solid #f0f1f8' }}>
      <button onClick={() => hasDetail && setOpen(o => !o)}
        style={{ width: '100%', background: '#fff', border: 0, textAlign: 'left',
          padding: '13px 18px', display: 'flex', alignItems: 'flex-start', gap: 11,
          cursor: hasDetail ? 'pointer' : 'default', fontFamily: 'inherit' }}>
        <SevDot sev={sev} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#151621', lineHeight: 1.45 }}>
            {issue.message}
          </div>
          {issue.displayValue && (
            <div style={{ fontSize: 11, color: '#83899c', marginTop: 2, fontFamily: 'monospace' }}>
              {issue.displayValue}
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
          {(issue.description || issue.detail) && (
            <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.75, margin: '0 0 10px' }}>
              {cleanDesc(issue.description || issue.detail)}
            </p>
          )}
          {issue.fix && (
            <div style={{ background: '#f7f4ff', borderRadius: 10, padding: '11px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#7948f6',
                marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.08em' }}>How to fix</div>
              <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.65 }}>{cleanDesc(issue.fix)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Category section ─── */
function CategorySection({ label, accent, issues }) {
  const [collapsed, setCollapsed] = useState(false);
  const crit = issues.filter(i => i.severity === 'critical').length;
  const warn = issues.filter(i => i.severity === 'warning').length;
  const good = issues.filter(i => i.severity === 'good').length;
  const metaLine = [
    crit > 0 && `${crit} critical`,
    warn > 0 && `${warn} warning${warn > 1 ? 's' : ''}`,
    good > 0 && `${good} passed`,
  ].filter(Boolean).join(' · ') || `${issues.length} items`;

  return (
    <div style={{ border: '1px solid #e9eaf2', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setCollapsed(c => !c)}
        style={{ width: '100%', background: collapsed ? '#fff' : '#fafaff', border: 0,
          padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 11,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
          fontWeight: 800, fontSize: 13, color: '#151621', flex: 1 }}>{label}</span>
        <span style={{ fontSize: 11, color: '#83899c', marginRight: 8 }}>{metaLine}</span>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#b0b4c8" strokeWidth={2.5} strokeLinecap="round">
          <path d={collapsed ? 'm6 9 6 6 6-6' : 'm18 15-6-6-6 6'}/>
        </svg>
      </button>
      {!collapsed && (
        <div>
          {issues.length === 0
            ? <p style={{ fontSize: 13, color: '#83899c', padding: '13px 18px', margin: 0 }}>All checks passed.</p>
            : issues.map((issue, i) => <FindingRow key={i} issue={issue} />)
          }
        </div>
      )}
    </div>
  );
}

/* ─── Recommended fix accordion ─── */
function FixItem({ n, title, detail, impact, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const cleanDesc = (str) => str?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') || '';

  return (
    <div style={{ border: '1px solid #e9eaf2', borderRadius: 13, overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: open ? '#fafaff' : '#fff', border: 0,
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: '#f1edff',
          color: '#7948f6', display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
          {String(n).padStart(2, '0')}
        </div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#151621', minWidth: 0 }}>{title}</span>
        <ImpactBadge level={impact} />
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#b0b4c8" strokeWidth={2.5} strokeLinecap="round" style={{ flexShrink: 0, marginLeft: 6 }}>
          <path d={open ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'}/>
        </svg>
      </button>
      {open && detail && (
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #f0f0f8' }}>
          <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.75, margin: 0 }}>
            {cleanDesc(detail)}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Discoveries section ─── */
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
            <span style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: '.06em' }}>
              {d.category?.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: confColor,
              background: confBg, padding: '2px 7px', borderRadius: 5 }}>
              {d.confidence?.toUpperCase()} CONFIDENCE
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#151621', lineHeight: 1.4 }}>{d.title}</div>
          <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.7, margin: '5px 0 0' }}>{d.explanation}</p>
        </div>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#b0b4c8"
          strokeWidth={2.5} strokeLinecap="round" style={{ flexShrink: 0, marginTop: 8 }}>
          <path d={open ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'}/>
        </svg>
      </button>

      {open && Array.isArray(d.actions) && d.actions.length > 0 && (
        <div style={{ borderTop: '1px solid #f0f1f8', padding: '4px 18px 16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c',
            letterSpacing: '.07em', margin: '12px 0 10px' }}>RECOMMENDED ACTIONS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.actions.map((a, ai) => {
              const impactColor = { high: '#ef6473', medium: '#efa642', low: '#83899c' }[a.impact] || '#83899c';
              const effortBg   = { low: '#edf9f4', medium: '#fff8ed', high: '#fff0f2' }[a.effort] || '#f4f5fb';
              const effortColor= { low: '#16a34a', medium: '#d97706', high: '#ef6473' }[a.effort] || '#83899c';
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

function DiscoveriesSection({ discoveries, isAi }) {
  if (!Array.isArray(discoveries) || discoveries.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14 }}>✦</span>
        <span style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
          fontWeight: 800, fontSize: 13, color: '#151621' }}>
          {isAi ? 'Cernly Discoveries' : 'Issues by category'}
        </span>
        {isAi && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#7948f6',
            background: '#f1edff', padding: '2px 8px', borderRadius: 5 }}>AI ANALYSIS</span>
        )}
        <span style={{ fontSize: 11, color: '#83899c', marginLeft: 'auto' }}>
          {discoveries.length} finding{discoveries.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {discoveries.map((d, i) => <DiscoveryCard key={i} d={d} index={i} />)}
      </div>
    </div>
  );
}

/* ─── UX Analysis card ─── */
function UxCard({ uxScore, uxInsights, uxAnnotations, visionStatus, siteType, url, issues }) {
  const [activePin, setActivePin] = useState(null);
  const score = uxScore ?? null;
  const color = score == null ? '#83899c' : score >= 80 ? '#19b987' : score >= 60 ? '#efa642' : '#ef6473';
  const visionLoading = visionStatus === 'loading';

  const sevColor = s => s === 'good' ? '#19b987' : s === 'warning' ? '#efa642' : '#ef6473';
  const sevBg    = s => s === 'good' ? '#f0fdf8' : s === 'warning' ? '#fffbf0' : '#fff5f6';
  const sevLabel = s => s === 'good' ? 'GOOD' : s === 'warning' ? 'NEEDS WORK' : 'CRITICAL';

  const annotations    = uxAnnotations?.annotations || [];
  const screenshotUrl  = uxAnnotations?.screenshotUrl || null;
  const observations   = uxInsights?.observations || [];

  // Fallback UX issues when no AI data
  const uxIssues = !uxInsights && !annotations.length && Array.isArray(issues)
    ? issues.filter(i =>
        (i.severity === 'critical' || i.severity === 'warning') &&
        (i.source === 'a11y' ||
         i.message?.toLowerCase().includes('contrast') ||
         i.message?.toLowerCase().includes('label') ||
         i.message?.toLowerCase().includes('button') ||
         i.message?.toLowerCase().includes('tap'))
      ).slice(0, 5)
    : [];

  return (
    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
      padding: '20px 22px', marginBottom: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#f1edff',
              display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#7948f6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                <circle cx="12" cy="12" r="3"/>
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
          <p style={{ fontSize: 12, color: '#83899c', margin: 0 }}>
            Design, usability, and conversion experience
          </p>
        </div>
        {score != null && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
              fontSize: 40, lineHeight: 1, color }}>{score}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#83899c', marginTop: 3 }}>UX SCORE</div>
          </div>
        )}
      </div>

      {/* ── Annotated screenshot ── */}
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
          <div style={{ position: 'relative', borderRadius: 13, overflow: 'hidden',
            border: '1px solid #e9eaf2', background: '#f4f5fb',
            /* 16:10 viewport aspect ratio */
            aspectRatio: '16 / 10' }}>

            {/* Screenshot image */}
            <img
              src={screenshotUrl || `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`}
              alt={`Screenshot of ${url}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
              onError={e => { e.target.style.display = 'none'; }}
            />

            {/* Annotation pins */}
            {annotations.map((ann, i) => {
              const c = sevColor(ann.severity);
              const isActive = activePin === i;
              return (
                <button
                  key={i}
                  onClick={() => setActivePin(isActive ? null : i)}
                  style={{
                    position: 'absolute',
                    left:   `${ann.x * 100}%`,
                    top:    `${ann.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 26, height: 26,
                    borderRadius: '50%',
                    background: isActive ? c : '#fff',
                    border: `2.5px solid ${c}`,
                    color: isActive ? '#fff' : c,
                    fontSize: 11, fontWeight: 800,
                    display: 'grid', placeItems: 'center',
                    cursor: 'pointer',
                    boxShadow: `0 2px 10px ${c}55`,
                    zIndex: isActive ? 10 : 5,
                    transition: 'all .15s ease',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  title={ann.label}
                >
                  {i + 1}
                </button>
              );
            })}

            {/* Active annotation tooltip */}
            {activePin !== null && annotations[activePin] && (() => {
              const ann = annotations[activePin];
              const c   = sevColor(ann.severity);
              // Position tooltip: if pin is in right half, show to the left; else to the right
              const fromLeft = ann.x > 0.55;
              return (
                <div style={{
                  position: 'absolute',
                  left:  fromLeft ? 'auto' : `calc(${ann.x * 100}% + 16px)`,
                  right: fromLeft ? `calc(${(1 - ann.x) * 100}% + 16px)` : 'auto',
                  top:   `${Math.min(ann.y * 100, 70)}%`,
                  width: 220,
                  background: '#fff',
                  borderRadius: 11,
                  padding: '12px 14px',
                  boxShadow: '0 4px 24px #0003',
                  border: `1.5px solid ${c}33`,
                  zIndex: 20,
                  pointerEvents: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
                    <div style={{ fontSize: 10, fontWeight: 800, color: c, letterSpacing: '.06em' }}>
                      {sevLabel(ann.severity)}
                    </div>
                    <div style={{ fontSize: 9, color: '#83899c', marginLeft: 'auto' }}>{ann.area}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#151621', marginBottom: 5, lineHeight: 1.4 }}>
                    {ann.label}
                  </div>
                  <div style={{ fontSize: 11, color: '#4b5168', lineHeight: 1.6 }}>{ann.detail}</div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Annotation legend ── */}
      {annotations.length > 0 && (
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {annotations.map((ann, i) => {
              const c = sevColor(ann.severity);
              const isActive = activePin === i;
              return (
                <button
                  key={i}
                  onClick={() => setActivePin(isActive ? null : i)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: isActive ? sevBg(ann.severity) : '#f8f9fd',
                    border: `1px solid ${isActive ? c + '44' : '#e9eaf2'}`,
                    borderRadius: 10, padding: '10px 13px',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all .12s ease',
                  }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: c,
                    color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0,
                    display: 'grid', placeItems: 'center', marginTop: 1 }}>
                    {i + 1}
                  </div>
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

      {/* ── AI: conversion focus + top recommendation ── */}
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
              <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.6 }}>
                {uxInsights.top_recommendation}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Per-area observations (from uxInsights, not annotations) ── */}
      {observations.length > 0 && !annotations.length && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c',
            letterSpacing: '.07em', marginBottom: 10 }}>UX BREAKDOWN</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {observations.map((obs, i) => (
              <div key={i} style={{ borderRadius: 11, padding: '12px 15px',
                background: sevBg(obs.verdict),
                border: `1px solid ${sevColor(obs.verdict)}22` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: sevColor(obs.verdict) }} />
                  <div style={{ fontSize: 10, fontWeight: 800, color: sevColor(obs.verdict),
                    letterSpacing: '.07em' }}>{obs.area?.toUpperCase()}</div>
                  <div style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800,
                    color: sevColor(obs.verdict), opacity: .7, letterSpacing: '.06em' }}>
                    {sevLabel(obs.verdict)}
                  </div>
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

      {/* ── Fallback: issue-based list ── */}
      {!uxInsights && !annotations.length && uxIssues.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#83899c',
            letterSpacing: '.07em', marginBottom: 10 }}>UX-RELATED ISSUES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {uxIssues.map((issue, i) => (
              <div key={i} style={{ background: '#f8f9fd', borderRadius: 10, padding: '10px 14px',
                borderLeft: `3px solid ${issue.severity === 'critical' ? '#ef6473' : '#efa642'}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#151621', marginBottom: 3 }}>{issue.message}</div>
                {(issue.description || issue.fix) && (
                  <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.6 }}>
                    {(issue.description || issue.fix || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 160)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fallback: score text ── */}
      {!uxInsights && !annotations.length && uxIssues.length === 0 && score != null && (
        <div style={{ background: '#f7f4ff', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#4b5168', lineHeight: 1.6 }}>
            {score >= 80
              ? 'UX looks solid. Keep an eye on load times and touch target sizes as you ship new content.'
              : score >= 60
              ? 'There are UX wins available. Improving load speed and ensuring all interactive elements are keyboard-accessible will have the biggest impact.'
              : 'A UX score this low typically signals friction — slow loads, missing form labels, or hard-to-tap elements on mobile. Prioritize performance and accessibility fixes first.'}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Ask Cernly AI panel — fixed height, no scroll jump ─── */
function AskCernlyPanel({ reportId, domain }) {
  const PANEL_HEIGHT = 'calc(100vh - 120px)';
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I've analyzed **${domain || 'this site'}** and I'm ready to help. Ask me what a finding means, how to fix it, or where to start.`,
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgsRef = useRef(null);

  const SUGGESTED = [
    'What should I fix first?',
    'How do I improve my LCP score?',
    'What SEO issues hurt me most?',
  ];

  // Scroll to bottom inside the messages container only — no page jump
  const scrollToBottom = useCallback(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
        body: JSON.stringify({ question: q, reportId, messages: updated.slice(-6) }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: data.answer || 'Sorry, something went wrong.' }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Network error — please try again.' }]);
    }
    setLoading(false);
  }

  // Render **bold** markdown
  function renderContent(text) {
    return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
    );
  }

  const userHasMessaged = messages.some(m => m.role === 'user');

  return (
    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
      display: 'flex', flexDirection: 'column', height: PANEL_HEIGHT,
      maxHeight: 570, minHeight: 440, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '15px 16px 13px', borderBottom: '1px solid #f0f1f8',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg,#8a46f8,#3687fa)',
          display: 'grid', placeItems: 'center' }}>
          <span style={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>✦</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
            fontWeight: 800, fontSize: 13, color: '#151621' }}>Ask Cernly AI</div>
          <div style={{ fontSize: 11, color: '#83899c' }}>Knows this report</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px',
          borderRadius: 6, background: '#f1edff', color: '#7948f6', flexShrink: 0 }}>AI</span>
      </div>

      {/* Messages — bounded scroll container, never scrolls the page */}
      <div ref={msgsRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10,
        scrollBehavior: 'smooth',
        /* Prevent scroll bleed to page */
        overscrollBehavior: 'contain' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '86%', fontSize: 13, lineHeight: 1.65,
              padding: '9px 13px',
              borderRadius: m.role === 'user' ? '13px 13px 3px 13px' : '3px 13px 13px 13px',
              background: m.role === 'user' ? '#7948f6' : '#f4f5fb',
              color: m.role === 'user' ? '#fff' : '#151621',
              wordBreak: 'break-word',
            }}>
              {renderContent(m.content)}
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

      {/* Suggested prompts */}
      {!userHasMessaged && (
        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
          {SUGGESTED.map(s => (
            <button key={s} onClick={() => send(s)}
              style={{ background: '#f4f5fb', border: 0, borderRadius: 9, padding: '8px 12px',
                fontSize: 12, fontWeight: 600, color: '#5a5e75', cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.3 }}>
              {s}
            </button>
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

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sidebar
═══════════════════════════════════════════════════════════════ */
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
          <small style={{ fontSize: 10, color: '#83899c', display: 'block', marginTop: 3 }}>
            {isPro ? 'Pro plan' : 'Free plan'}
          </small>
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
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
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
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
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

/* ═══════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════ */
export default function ReportClient({ isPro, userName, userAvatar }) {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visionStatus, setVisionStatus] = useState('idle'); // idle | loading | done | error
  const [liveAnnotations, setLiveAnnotations] = useState(null);

  const displayName = userName || 'User';

  useEffect(() => {
    const params = new URLSearchParams({ id });
    if (sessionId) params.set('session_id', sessionId);
    fetch(`/api/report?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setStatus('error'); return; }
        setReport(d);
        setStatus('ok');
        // If annotations already exist (re-loaded report), mark done immediately
        if (d.uxAnnotations) {
          setVisionStatus('done');
          return;
        }
        // Otherwise kick off the async vision analysis
        {
          setVisionStatus('loading');
          fetch('/api/vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId: d.id }),
          })
            .then(r => r.json())
            .then(v => {
              if (v.uxAnnotations) {
                setLiveAnnotations(v.uxAnnotations);
                setVisionStatus('done');
              } else {
                setVisionStatus('error');
              }
            })
            .catch(() => setVisionStatus('error'));
        }
      }
      )
      .catch(() => setStatus('error'));
  }, [id, sessionId]);

  const domain = (() => {
    try { return new URL(report?.url || '').hostname; } catch { return report?.url || ''; }
  })();

  const createdAt = report?.createdAt
    ? new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const css = `
    :root { color-scheme: light }
    *, *::before, *::after { box-sizing: border-box }
    @keyframes spin { to { transform: rotate(360deg) } }
    @media (max-width: 940px) {
      .rep-outer { grid-template-columns: 1fr !important }
      .dash-sidebar { position: fixed; left: -260px; top: 0; bottom: 0; transition: left .25s; z-index: 20 }
      .dash-sidebar.open { left: 0; box-shadow: 4px 0 24px #0d102040 }
      .rep-cols { grid-template-columns: 1fr !important }
    }
    @media (max-width: 1100px) {
      .rep-cols { grid-template-columns: minmax(0,1fr) 320px !important }
    }
  `;

  const allIssues = report?.issues || [];

  // Top priorities for recommended fixes section
  const priorities = allIssues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 7);

  const getImpact = (issue, idx) =>
    issue.severity === 'critical' || idx < 2 ? 'high' : idx < 5 ? 'medium' : 'low';

  // Build fallback discoveries from issue data when AI insights are missing
  const fallbackDiscoveries = (() => {
    if (report?.aiInsights) return null; // use AI version
    const scores = report?.scores || {};
    const groups = [
      {
        category: 'Performance',
        match: i => i.area?.toLowerCase().includes('perf') || i.area?.toLowerCase().includes('best'),
        score: scores.performance,
      },
      {
        category: 'SEO',
        match: i => i.area?.toLowerCase().includes('seo') || i.source === 'seo',
        score: scores.seo,
      },
      {
        category: 'Security',
        match: i => i.area?.toLowerCase().includes('sec') || i.source === 'ssl',
        score: scores.security,
      },
      {
        category: 'Accessibility',
        match: i => i.area?.toLowerCase().includes('access') || i.source === 'a11y',
        score: scores.accessibility,
      },
    ];

    const discoveries = [];
    for (const g of groups) {
      if (g.score == null || g.score >= 90) continue; // skip passing categories
      const issues = allIssues.filter(i => (i.severity === 'critical' || i.severity === 'warning') && g.match(i)).slice(0, 3);
      if (issues.length === 0) continue;
      const conf = g.score < 50 ? 'high' : g.score < 70 ? 'medium' : 'low';
      discoveries.push({
        title: `${g.category} needs attention (score: ${g.score})`,
        explanation: `${issues.length} issue${issues.length > 1 ? 's' : ''} detected that are affecting your ${g.category.toLowerCase()} score. Addressing these can meaningfully improve your ranking and user experience.`,
        confidence: conf,
        category: g.category,
        actions: issues.map(i => ({
          title: i.message,
          detail: i.description || i.fix || 'Review and resolve this issue to improve your score.',
          impact: i.severity === 'critical' ? 'high' : 'medium',
          effort: 'medium',
        })),
      });
    }
    return discoveries.length > 0 ? discoveries : null;
  })();

  const effectiveDiscoveries = report?.aiInsights || fallbackDiscoveries;

  const detailCategories = [
    { label: 'Performance',   accent: '#7948f6', match: i => i.area?.toLowerCase().includes('perf') || i.area?.toLowerCase().includes('best') },
    { label: 'SEO',           accent: '#3687fa', match: i => i.area?.toLowerCase().includes('seo')  || i.source === 'seo' },
    { label: 'Security',      accent: '#19b987', match: i => i.area?.toLowerCase().includes('sec')  || i.source === 'ssl' },
    { label: 'Accessibility', accent: '#efa642', match: i => i.area?.toLowerCase().includes('access') || i.source === 'a11y' },
  ];

  return (
    <div style={{ background: '#f8f9fd', minHeight: '100vh', colorScheme: 'light',
      fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)', color: '#151621' }}>
      <style>{css}</style>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: '#0d102060', zIndex: 19 }} />
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
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href)
                    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
                    .catch(() => {});
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                  background: copied ? '#edf9f4' : '#f1edff', color: copied ? '#19b987' : '#7948f6',
                  border: 0, borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                {copied ? 'Copied!' : 'Share'}
              </button>
              <Link href={`/dashboard?rescan=${encodeURIComponent(report?.url || '')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                  background: '#151621', color: '#fff', borderRadius: 9,
                  fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                Re-scan
              </Link>
            </div>
          </header>

          {/* Content */}
          <div style={{ flex: 1, padding: '26px 26px 60px', overflowY: 'auto' }}>

            {status === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 42, height: 42, border: '3px solid #e9eaf2', borderTopColor: '#7948f6',
                    borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 14px' }} />
                  <p style={{ color: '#83899c', fontSize: 14, margin: 0 }}>Loading report…</p>
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
              <>
                {/* Page header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                  <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 600, color: '#83899c', textDecoration: 'none' }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M20 12H4m7-7-7 7 7 7"/></svg>
                    Back
                  </Link>
                  <div style={{ width: 1, height: 16, background: '#e9eaf2' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#83899c' }}>Website Report</span>
                  {createdAt && <span style={{ fontSize: 11, color: '#b0b4c4' }}>· {createdAt}</span>}
                </div>

                <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                  fontSize: 'clamp(20px, 2.5vw, 28px)', letterSpacing: '-.05em',
                  color: '#151621', margin: '0 0 22px' }}>{domain}</h1>

                {/* Two-column layout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px',
                  gap: 20, alignItems: 'start' }} className="rep-cols">

                  {/* ── Left: all content ── */}
                  <div>
                    {/* Score tiles */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 20 }}>
                      {[
                        { label: 'Performance',   score: report.scores?.performance },
                        { label: 'SEO',           score: report.scores?.seo },
                        { label: 'Security',      score: report.scores?.security },
                        { label: 'Accessibility', score: report.scores?.accessibility },
                        { label: 'UX',            score: report.uxScore ?? (report.scores?.performance != null && report.scores?.accessibility != null ? Math.round((report.scores.performance + report.scores.accessibility) / 2) : null) },
                      ].map(c => <ScoreTile key={c.label} score={c.score} label={c.label} />)}
                    </div>

                    {/* Cernly's take */}
                    {report.aiSummary && (
                      <div style={{ background: 'linear-gradient(145deg,#f6f1ff,#eef6ff 90%)',
                        border: '1px solid #e5deff', borderRadius: 17, padding: '18px 20px', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 14 }}>✦</span>
                          <span style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                            fontWeight: 800, fontSize: 13, color: '#7948f6' }}>Cernly's take</span>
                        </div>
                        <p style={{ fontSize: 13, lineHeight: 1.75, color: '#4b5168', margin: 0 }}>
                          {report.aiSummary}
                        </p>
                      </div>
                    )}

                    {/* Cernly Discoveries — AI-grouped insights (or issue-derived fallback) */}
                    <DiscoveriesSection discoveries={effectiveDiscoveries} isAi={!!report.aiInsights} />

                    {/* UX Analysis — always show (screenshot at minimum) */}
                    <UxCard
                      uxScore={report.uxScore ?? (report.scores?.performance != null && report.scores?.accessibility != null ? Math.round((report.scores.performance + report.scores.accessibility) / 2) : null)}
                      uxInsights={report.uxInsights}
                      uxAnnotations={liveAnnotations || report.uxAnnotations}
                      visionStatus={visionStatus}
                      siteType={report.siteType}
                      url={report.url}
                      issues={allIssues}
                    />

                    {/* Recommended fixes */}
                    {priorities.length > 0 && (
                      <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                        padding: '18px 20px', marginBottom: 20 }}>
                        <div style={{ marginBottom: 14 }}>
                          <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                            fontSize: 14, color: '#151621', margin: '0 0 2px', letterSpacing: '-.02em' }}>
                            Your recommended fixes
                          </h2>
                          <p style={{ fontSize: 12, color: '#83899c', margin: 0 }}>Highest impact first.</p>
                        </div>
                        {priorities.map((issue, i) => (
                          <FixItem
                            key={i}
                            n={i + 1}
                            title={issue.message}
                            detail={issue.description || issue.detail}
                            impact={getImpact(issue, i)}
                            defaultOpen={i === 0}
                          />
                        ))}
                      </div>
                    )}

                    {/* Detailed findings */}
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                        fontSize: 14, letterSpacing: '-.02em', color: '#151621', margin: '0 0 12px' }}>
                        Detailed findings
                      </h2>
                      {detailCategories.map(({ label, accent, match }) => (
                        <CategorySection
                          key={label} label={label} accent={accent}
                          issues={allIssues.filter(match)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* ── Right: AI panel — sticky, self-contained scroll ── */}
                  <div style={{ position: 'sticky', top: 78 }}>
                    <AskCernlyPanel reportId={id} domain={domain} />
                  </div>

                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
