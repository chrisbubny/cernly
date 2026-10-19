'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';

/* ─── SVG icon helpers ─── */
const strokeAttrs = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

const Icon = ({ d, children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeAttrs} {...rest}>
    {children}
  </svg>
);

const Icons = {
  Grid:     () => <Icon><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Icon>,
  Globe:    () => <Icon><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-6 6-6 12 0 18m0-18c6 6 6 12 0 18"/></Icon>,
  Clock:    () => <Icon><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  Check:    () => <Icon><path d="m5 12 4 4 10-10"/></Icon>,
  Spark:    () => <Icon size={16}><path d="M12 2c1.2 5.6 4.4 8.8 10 10-5.6 1.2-8.8 4.4-10 10C10.8 16.4 7.6 13.2 2 12c5.6-1.2 8.8-4.4 10-10Z"/></Icon>,
  Chart:    () => <Icon><path d="M3 20h18M6 16v-6m6 6V4m6 12v-9"/></Icon>,
  Settings: () => <Icon><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1m0-14.2L17 7M7 17l-2.1 2.1"/></Icon>,
  Bell:     () => <Icon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/></Icon>,
  Plus:     () => <Icon><path d="M12 4v16M4 12h16"/></Icon>,
  Arrow:    () => <Icon><path d="M4 12h16m-7-7 7 7-7 7"/></Icon>,
  Menu:     () => <Icon><path d="M3 6h18M3 12h18M3 18h18"/></Icon>,
  Search:   () => <Icon><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></Icon>,
  Shield:   () => <Icon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Icon>,
  Code:     () => <Icon><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></Icon>,
  External: () => <Icon size={12}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></Icon>,
};

/* Cernly logo mark */
export const LogoMark = ({ size = 29 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size}
    viewBox="195 175 895 875" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', color: '#151621' }}>
    <path d="M210.88,597.17c-1.92.12-3.93-.58-4.48-1.24s-.97-3.06-.76-3.98c11.39-48.88,50.84-84.6,92.76-109.56,22.3-13.27,43.7-26.1,64.87-41.11,52.4-37.15,79.11-75.36,113.03-127.89l22.43-34.73c32.23-45.08,77.97-78.01,131.24-93.68,1.22-.36,3.93.09,4.54.91,4.51,6.07,2.51,50.21,1.38,67.19-3.77,56.96-14.7,113.18-38.87,164.93-13.55,29-31.57,54.3-54.59,76.43-27.97,26.89-60.01,47.21-96.52,60.57-21.05,7.7-41.49,13.71-63.62,18.52-56.54,12.3-113.27,20.1-171.42,23.65Z" fill="currentColor"/>
    <path d="M1075.29,597.22c-31.29-1.76-60.75-5.23-91.32-10.14-37.13-5.96-73.16-12.14-109.51-21.48-27.2-6.99-52.73-16.08-77.11-30.07-33.58-19.26-62.54-45.19-85.19-76.57-48.6-67.35-61.22-165.28-63.01-246.88l.74-24.19c.05-1.52,3.3-3.46,5.17-2.9,53.27,15.99,99.4,48.96,131.58,94.27l22.01,34.17c13.38,20.77,26.25,40.89,41.62,60.34,22.14,28.03,47.79,51.58,77.4,71.53l58.53,36.52c42.76,26.68,80.77,59.15,93.2,109.88.25,1.03.24,2.45.06,3.15-.23.87-2.89,2.45-4.15,2.38Z" fill="currentColor"/>
    <path d="M797.68,922.67c-32.2,56.52-79.76,98.45-142.12,117.91-2.48.77-5.89-.81-6-3.3l-1.25-29.38c.14-35.36,2.94-69.78,8.88-104.64,13.49-79.23,45.35-148.57,105.28-202.8,48.34-43.74,98.6-62.82,162.34-73.88,48.62-8.44,96.94-12.45,146.2-14.26,3.25-.12,7.35-.34,8.71,2.82-6.63,31.45-27.79,62.34-51.1,84.47-14.25,13.53-29.63,24.26-46.24,34.8l-57.5,36.51c-60.34,41.66-91.74,89.48-127.22,151.75Z" fill="currentColor"/>
    <path d="M514.03,962.58c-12.71-15.68-22.44-31.35-32.26-48.38-33.85-58.7-64.66-101.62-121.01-140.94l-53.53-34.47c-14.35-9.24-27.95-18.02-40.98-29.06-21.42-18.16-38.67-39.75-50.78-65.11-4.26-8.93-11.63-27.71-9.12-30.62.57-.66,2.66-1.41,3.76-1.35,48.35,2.7,95.64,7.89,143.41,15.64,62.11,10.07,110.39,25.7,159.44,65.72,46.02,37.55,79.42,86.64,97.86,143.16,20.51,62.84,24.72,132.93,23.74,198.93-.02,1.03-1.13,3.48-1.92,4.05-.95.69-3.35.77-5,.24-44.69-14.26-83.75-41-113.6-77.81Z" fill="currentColor"/>
  </svg>
);

/* ─── Score donut (CSS conic-gradient) ─── */
function ScoreDonut({ score }) {
  const color = score >= 80 ? '#19b987' : score >= 60 ? '#efa642' : '#ef6473';
  return (
    <div style={{
      width: 71, height: 71, borderRadius: '50%', flexShrink: 0,
      background: `conic-gradient(${color} ${score}%, #edf0f6 0)`,
      display: 'grid', placeItems: 'center', position: 'relative',
    }}>
      <div style={{ width: 57, height: 57, borderRadius: '50%', background: '#fff',
        display: 'grid', placeItems: 'center', position: 'absolute' }} />
      <span style={{ position: 'relative', fontFamily: 'Manrope,sans-serif',
        fontWeight: 800, fontSize: 20, color: '#151621', zIndex: 1 }}>{score}</span>
    </div>
  );
}

/* ─── Severity badge ─── */
function SevBadge({ level }) {
  const map = {
    critical: { bg: '#fff0f2', color: '#ef6473' },
    high:     { bg: '#fff8ed', color: '#efa642' },
    medium:   { bg: '#f1edff', color: '#7948f6' },
  };
  const s = map[level] || map.medium;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 6,
      background: s.bg, color: s.color, whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'center' }}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

/* ─── Plan chip ─── */
function PlanChip({ plan }) {
  const map = {
    pro:  { bg: '#f1edff', color: '#7948f6' },
    paid: { bg: '#eaf8f3', color: '#19b987' },
    free: { bg: '#f4f5fb', color: '#83899c' },
  };
  const s = map[plan] || map.free;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 100,
      background: s.bg, color: s.color }}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</span>
  );
}

/* ─── Bar chart row (site card) ─── */
function ScoreBars({ perf, seo, sec, a11y }) {
  const bars = [
    { v: perf ?? 0, color: (perf ?? 0) >= 80 ? '#1bbb88' : (perf ?? 0) >= 60 ? '#efa343' : '#ef6a78' },
    { v: seo  ?? 0, color: (seo  ?? 0) >= 80 ? '#4387f7' : '#efa343' },
    { v: sec  ?? 0, color: '#1bbb88' },
    { v: a11y ?? 0, color: (a11y ?? 0) >= 80 ? '#1bbb88' : '#efa343' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 16 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ height: 5, borderRadius: 5, background: '#edf0f5', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${b.v}%`, background: b.color, borderRadius: 5 }} />
        </div>
      ))}
    </div>
  );
}

const SCAN_STAGES = [
  { label: 'Checking performance…',   pct: 18 },
  { label: 'Auditing SEO signals…',   pct: 36 },
  { label: 'Testing security…',       pct: 54 },
  { label: 'Scanning accessibility…', pct: 72 },
  { label: 'Running AI analysis…',    pct: 88 },
  { label: 'Finalizing report…',      pct: 96 },
];

/* ─── Priority → impact mapping for Fix Queue filters ─── */
function recImpact(priority) {
  if (priority === 'critical' || priority === 'high') return 'high';
  if (priority === 'medium') return 'medium';
  return 'low';
}

function effortLabel(effort) {
  if (effort === 'low')    return 'Low effort';
  if (effort === 'medium') return 'Medium effort';
  if (effort === 'high')   return 'High effort';
  return null;
}

/* Portfolio-aware ordering: surfaces the top-priority rec from each unique
   domain before showing a second rec from any site. Preserves priority order
   within each domain group. No DB changes required — pure client-side sort. */
function interleaveByDomain(recs) {
  if (!recs?.length) return [];
  const groups = {};
  const domainOrder = [];
  for (const rec of recs) {
    let d = '—';
    try { d = new URL(rec.reportUrl || '').hostname.replace(/^www\./, ''); } catch {}
    if (!groups[d]) { groups[d] = []; domainOrder.push(d); }
    groups[d].push(rec);
  }
  const result = [];
  let round = 0;
  while (result.length < recs.length) {
    let any = false;
    for (const d of domainOrder) {
      if (groups[d][round] !== undefined) { result.push(groups[d][round]); any = true; }
    }
    if (!any) break;
    round++;
  }
  return result;
}

function FixQueueView({ recommendations = [], onOpenGuide }) {
  const [filter, setFilter] = useState('all');
  const tabs = [
    { id: 'all',    label: 'All findings' },
    { id: 'high',   label: 'High priority'  },
    { id: 'medium', label: 'Medium priority'},
  ];

  const tasks = recommendations.map((rec, i) => ({
    num:        String(i + 1).padStart(2, '0'),
    recId:      rec.id,
    title:      rec.title,
    domain:     rec.reportUrl ? (() => { try { return new URL(rec.reportUrl).hostname; } catch { return rec.reportUrl; } })() : '—',
    impact:     recImpact(rec.priority),
    priority:   rec.priority,
    effort:     effortLabel(rec.effort),
    category:   rec.category,
    reportSlug: rec.reportSlug || null,
  }));

  const visible = tasks.filter(t => filter === 'all' || t.impact === filter);
  const impactColors = {
    high:   { bg: '#fff4e5', color: '#d97706' },
    medium: { bg: '#f1edff', color: '#7948f6' },
    low:    { bg: '#f4f5fb', color: '#83899c' },
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
            fontSize: 'clamp(24px,2.8vw,36px)', letterSpacing: '-.045em',
            fontWeight: 800, margin: '0 0 4px' }}>Recommended improvements</h1>
          <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>
            Prioritized fixes from your scans — highest impact first.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            style={{ border: 0, borderRadius: 9, padding: '8px 14px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: filter === t.id ? '#7948f6' : '#fff',
              color:      filter === t.id ? '#fff'     : '#83899c',
              boxShadow:  filter === t.id ? '0 3px 12px #7948f620' : 'none',
              border:     filter === t.id ? 'none' : '1px solid #e9eaf2',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17, overflow: 'hidden' }}>
        {visible.map((t, i) => {
          const ic = impactColors[t.impact] || impactColors.medium;
          return (
            <div key={t.recId || t.num} style={{ display: 'flex', gap: 14, alignItems: 'center',
              padding: '16px 20px', borderBottom: i < visible.length - 1 ? '1px solid #f0f1f5' : 'none' }}>
              <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center',
                borderRadius: 9, background: '#f0ebff', color: '#7948f6',
                fontWeight: 800, fontSize: 11, flexShrink: 0 }}>{t.num}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13, display: 'block', color: '#151621' }}>{t.title}</strong>
                <p style={{ fontSize: 11, color: '#8a90a1', margin: '4px 0 0',
                  display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span>{t.domain}</span>
                  <span style={{ opacity: .4 }}>·</span>
                  <span style={{ color: ic.color, fontWeight: 700, textTransform: 'capitalize' }}>{t.priority} priority</span>
                  <span style={{ opacity: .4 }}>·</span>
                  <span>{t.category}</span>
                  {t.effort && <><span style={{ opacity: .4 }}>·</span><span>{t.effort}</span></>}
                </p>
              </div>
              {t.reportSlug
                ? <Link href={`/report/${t.reportSlug}`}
                    style={{ border: '1px solid #e9eaf2', background: '#fff', color: '#7651e4',
                      fontSize: 11, fontWeight: 800, padding: '7px 12px', borderRadius: 8,
                      textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    View report
                  </Link>
                : <button onClick={() => onOpenGuide(t.category?.toLowerCase())}
                    style={{ border: '1px solid #e9eaf2', background: '#fff', color: '#7651e4',
                      fontSize: 11, fontWeight: 800, padding: '7px 12px', borderRadius: 8,
                      cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
                      whiteSpace: 'nowrap' }}>
                    View guide
                  </button>
              }
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#83899c', fontSize: 13 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#3b3f52' }}>No recommendations yet</p>
            <p style={{ margin: 0 }}>Run a scan to get personalized improvement suggestions.</p>
          </div>
        )}
        {tasks.length > 0 && visible.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#83899c', fontSize: 13 }}>
            No {filter} priority items found.
          </div>
        )}
      </div>
    </>
  );
}

export default function DashboardClient({ reports: initialReports = [], isPro, userName, userAvatar, userEmail, isAdmin }) {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState(0);
  const [view, setView] = useState(() => {
    const v = searchParams.get('v');
    return ['overview','websites','history','tasks','billing','settings'].includes(v) ? v : 'overview';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState({ msg: '', show: false });
  const [modal, setModal] = useState(null); // null | 'pro' | 'image' | 'meta' | 'fonts' | ...
  const [localReports, setLocalReports] = useState(initialReports);
  const [recommendations, setRecommendations] = useState([]);
  const [deletingId, setDeletingId] = useState(null); // id currently showing confirm
  const [selectedDomain, setSelectedDomain] = useState(null); // null | hostname string — for per-domain drill-down
  const [takeIdx, setTakeIdx] = useState(0); // which opportunity is showing in Cernly's Take card
  const router = useRouter();
  const { signOut } = useClerk();

  // Fetch user's recommendations for Cernly's Take and Fix Queue
  useEffect(() => {
    fetch('/api/recommendations')
      .then(r => r.ok ? r.json() : { recommendations: [] })
      .then(data => setRecommendations(data.recommendations || []))
      .catch(() => {});
  }, [localReports]); // re-fetch after any scan completes (localReports changes)

  // Reset Take card navigation whenever the recommendation list refreshes
  useEffect(() => { setTakeIdx(0); }, [recommendations]);

  // Handle ?rescan=<url> query param — pre-fill URL and switch to scan form
  useEffect(() => {
    const rescanUrl = searchParams.get('rescan');
    if (rescanUrl) {
      setUrl(decodeURIComponent(rescanUrl));
      setView('overview');
      // Give DOM a tick to render before focusing
      setTimeout(() => document.getElementById('scan-url')?.focus(), 150);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = (msg) => {
    setToast({ msg, show: true });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3500);
  };

  async function handleScan(e) {
    e.preventDefault();
    if (!url.trim()) return;
    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
    setScanning(true);
    setScanStage(0);
    let stageIdx = 0;
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, SCAN_STAGES.length - 1);
      setScanStage(stageIdx);
    }, 3200);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      clearInterval(stageTimer);
      const data = await res.json();
      if (data.reportSlug || data.reportId) {
        router.push(`/report/${data.reportSlug || data.reportId}`);
      } else {
        notify(data.error || 'Scan failed. Please try again.');
        setScanning(false);
      }
    } catch {
      clearInterval(stageTimer);
      notify('Scan failed. Please try again.');
      setScanning(false);
    }
  }

  const stage = SCAN_STAGES[scanStage];

  /* ── Derived data from real reports ── */
  const latestByDomain = {};
  localReports.forEach(r => {
    try {
      const d = new URL(r.url).hostname;
      if (!latestByDomain[d] || new Date(r.created_at) > new Date(latestByDomain[d].created_at)) {
        latestByDomain[d] = r;
      }
    } catch {}
  });
  const siteList = Object.values(latestByDomain);
  // Domain-interleaved recommendations: one rec per site before any site gets a second slot
  const orderedRecs = interleaveByDomain(recommendations);

  /* ── Delete a report ── */
  async function handleDeleteReport(id) {
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setLocalReports(prev => prev.filter(r => r.id !== id));
        setDeletingId(null);
        notify('Scan deleted.');
      } else {
        notify('Could not delete scan. Please try again.');
      }
    } catch {
      notify('Could not delete scan. Please try again.');
    }
  }

  const avgScore = (s) => {
    const vals = [s?.performance, s?.seo, s?.security, s?.accessibility].filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  const scoreHealth = (n) => n == null ? '—' : n >= 80 ? 'Looking healthy' : n >= 60 ? 'Needs attention' : 'Action required';

  /* ── Guides ── */
  const guides = {
    image:    { title: 'Compress hero image',           steps: ['Install ShortPixel or Imagify and enable WebP conversion.', 'Re-upload the hero image at max 1400px wide.', 'Verify savings with Lighthouse or GTmetrix.'] },
    meta:     { title: 'Add missing meta descriptions', steps: ['Open each page in your CMS and fill in the meta description.', 'Keep descriptions 120–158 characters with the primary keyword.', 'Re-run Cernly to confirm all pages are resolved.'] },
    aria:     { title: 'Add aria-labels to icon buttons', steps: ['Find each <button> that contains only an icon.', 'Add aria-label="Descriptive action name" to each.', 'Test with VoiceOver (Mac) or NVDA (Windows).'] },
    fonts:    { title: 'Improve font loading',          steps: ['Add font-display: swap to all @font-face declarations.', 'Preload the one or two font files used above the fold.', 'Remove unused font weights.'] },
    headings: { title: 'Review heading hierarchy',      steps: ['Ensure each page has exactly one <h1>.', 'Use heading levels in order — no skipping h2 → h4.', 'Re-run the accessibility check to confirm.'] },
  };

  /* ═══════════════════════════════════════ RENDER ═══════════════════════════════════════ */
  return (
    <div style={{ background: '#f8f9fd', minHeight: '100vh', color: '#151621',
      fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)', colorScheme: 'light' }}>

      {/* ── Scanning overlay ── */}
      {scanning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(17,19,29,.72)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '40px 48px',
            textAlign: 'center', maxWidth: 360, width: '90%',
            boxShadow: '0 24px 64px rgba(0,0,0,.18)' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg,#8a46f8,#258de9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', animation: 'pulse 1.4s ease-in-out infinite' }}>
              <Icons.Search />
            </div>
            <h3 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
              fontSize: 18, letterSpacing: '-.04em', color: '#11131d', margin: '0 0 8px' }}>
              Analyzing your website
            </h3>
            <p style={{ fontSize: 13, color: '#9099b2', margin: '0 0 24px', lineHeight: 1.5 }}>
              {stage.label}
            </p>
            <div style={{ background: '#f0f0f5', borderRadius: 100, height: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 100,
                background: 'linear-gradient(90deg,#8a46f8,#258de9)',
                width: `${stage.pct}%`, transition: 'width .8s ease' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile backdrop ── */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: '#0d102060', zIndex: 19 }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '244px minmax(0,1fr)', minHeight: '100vh' }}
        className="dash-grid">

        {/* ══════════════════ SIDEBAR ══════════════════ */}
        <aside style={{
          background: '#fff', borderRight: '1px solid #e9eaf2',
          display: 'flex', flexDirection: 'column',
          position: 'sticky', top: 0, height: '100vh',
          padding: '27px 15px 18px', zIndex: 20, overflowY: 'auto',
        }} className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>

          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
            fontSize: 21, letterSpacing: '-.075em', color: '#151621', textDecoration: 'none',
            padding: '0 13px' }}>
            <LogoMark />
            cernly<span style={{ fontWeight: 500 }}>.ai</span>
          </Link>

          {/* Workspace chip */}
          <div style={{ margin: '35px 10px 25px', padding: '11px 12px',
            border: '1px solid #e9eaf2', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#eeeaff', color: '#7948f6', padding: 9, borderRadius: 10,
              fontSize: 14, lineHeight: 1, fontWeight: 700 }}>✦</div>
            <div>
              <strong style={{ fontSize: 12, display: 'block' }}>Personal workspace</strong>
              <small style={{ fontSize: 10, color: '#83899c', display: 'block', marginTop: 3 }}>
                {isPro ? 'Pro plan' : 'Free plan'}
              </small>
            </div>
          </div>

          {/* Nav — Workspace */}
          <div style={{ fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase',
            color: '#a3a7b4', fontWeight: 800, padding: '0 15px', margin: '12px 0' }}>Workspace</div>
          <nav style={{ display: 'grid', gap: 4 }}>
            {[
              { id: 'overview',  label: 'Overview',    icon: <Icons.Grid />  },
              { id: 'websites',  label: 'My websites', icon: <Icons.Globe />, count: siteList.length > 0 ? siteList.length : null },
              { id: 'history',   label: 'Scan history',icon: <Icons.Clock /> },
              { id: 'tasks',     label: 'Fix queue',   icon: <Icons.Check />, count: localReports.length > 0 ? 7 : null },
            ].map(({ id, label, icon, count }) => (
              <button key={id} onClick={() => { setView(id); setSidebarOpen(false); setSelectedDomain(null); }}
                style={{
                  border: 0, background: view === id ? '#f1edff' : 'transparent',
                  color: view === id ? '#7547ef' : '#707688',
                  display: 'flex', alignItems: 'center', gap: 13,
                  textAlign: 'left', padding: '13px 14px', borderRadius: 10,
                  fontWeight: 700, fontSize: 12, width: '100%', cursor: 'pointer',
                  transition: 'background .15s,color .15s',
                  fontFamily: 'inherit',
                }}>
                {icon}
                {label}
                {count != null && (
                  <span style={{ marginLeft: 'auto', background: '#eeeafa', borderRadius: 6,
                    padding: '3px 7px', color: '#7452d5', fontSize: 10 }}>{count}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Nav — Account */}
          <div style={{ fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase',
            color: '#a3a7b4', fontWeight: 800, padding: '0 15px', margin: '30px 0 12px' }}>Account</div>
          <nav style={{ display: 'grid', gap: 4 }}>
            {[
              { id: 'billing',  label: 'Plan & billing', icon: <Icons.Chart />   },
              ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: <Icons.Shield /> }] : []),
              { id: 'settings', label: 'Settings',       icon: <Icons.Settings />},
            ].map(({ id, label, icon }) => (
              <button key={id} onClick={() => { setView(id); setSidebarOpen(false); setSelectedDomain(null); }}
                style={{
                  border: 0, background: view === id ? '#f1edff' : 'transparent',
                  color: view === id ? '#7547ef' : '#707688',
                  display: 'flex', alignItems: 'center', gap: 13,
                  textAlign: 'left', padding: '13px 14px', borderRadius: 10,
                  fontWeight: 700, fontSize: 12, width: '100%', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>
                {icon}{label}
              </button>
            ))}
          </nav>

          {/* Bottom: upgrade + profile */}
          <div style={{ marginTop: 'auto' }}>
            {!isPro && (
              <div style={{ borderRadius: 15, background: '#171825', color: '#fff',
                padding: 17, margin: '0 3px 20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', width: 130, height: 130, background: '#7d53f8',
                  filter: 'blur(60px)', right: -65, top: -65, opacity: .6 }} />
                <div style={{ position: 'relative' }}>
                  <strong style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontSize: 13, fontWeight: 800, display: 'block' }}>Make every scan count.</strong>
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: '#afb1c1', margin: '8px 0 14px' }}>
                    Unlock fix guides, scan history, and progress tracking with Cernly Pro.
                  </p>
                  <button onClick={() => setModal('pro')}
                    style={{ border: 0, borderRadius: 8, background: '#fff', color: '#222',
                      padding: '9px 13px', fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Explore Pro →
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10,
              borderTop: '1px solid #e9eaf2', padding: '17px 9px 0' }}>
              {userAvatar
                ? <img src={userAvatar} alt="" style={{ width: 35, height: 35, borderRadius: 11, objectFit: 'cover' }} />
                : <div style={{ display: 'grid', placeItems: 'center', width: 35, height: 35,
                    borderRadius: 11, background: 'linear-gradient(135deg,#8050fa,#3d9cf9)',
                    color: '#fff', fontWeight: 800, fontSize: 14 }}>
                    {userName[0]?.toUpperCase()}
                  </div>
              }
              <div>
                <strong style={{ fontSize: 12, display: 'block' }}>{userName}</strong>
                <small style={{ display: 'block', color: '#83899c', fontSize: 10, marginTop: 3 }}>Personal account</small>
              </div>
              <button onClick={() => signOut(() => router.push('/'))}
                style={{ marginLeft: 'auto', border: 0, background: 'transparent',
                  color: '#a2a6b4', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
                title="Sign out">⋯</button>
            </div>
          </div>
        </aside>

        {/* ══════════════════ MAIN ══════════════════ */}
        <main style={{ minWidth: 0 }}>

          {/* Topbar */}
          <header style={{ height: 76, background: 'rgba(255,255,255,.86)',
            backdropFilter: 'blur(15px)', borderBottom: '1px solid #e9eaf2',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 clamp(22px,4.5vw,72px)', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setSidebarOpen(o => !o)}
                className="mobile-menu-btn"
                style={{ display: 'none', placeItems: 'center', width: 36, height: 36,
                  border: '1px solid #e9eaf2', borderRadius: 10, background: 'white',
                  color: '#73798b', cursor: 'pointer' }}>
                <Icons.Menu />
              </button>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center',
                color: '#9297a6', fontSize: 12 }}>
                Workspace <span>›</span>
                <b style={{ color: '#22232e' }}>{{
                  overview: 'Overview', websites: 'My websites', history: 'Scan history',
                  tasks: 'Fix queue', billing: 'Plan & billing',
                  admin: 'Admin', settings: 'Settings',
                }[view] || view}</b>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!isPro && (
                <span style={{ border: '1px solid #e7e2ff', color: '#7652dd', background: '#f6f3ff',
                  padding: '7px 10px', borderRadius: 9, fontSize: 11, fontWeight: 800 }}>
                  ✦ Free workspace
                </span>
              )}
              <button onClick={() => notify('You are all caught up.')}
                style={{ display: 'grid', placeItems: 'center', width: 36, height: 36,
                  border: '1px solid #e9eaf2', borderRadius: 10, background: 'white',
                  color: '#73798b', cursor: 'pointer' }}>
                <Icons.Bell />
              </button>
              <button onClick={() => setModal('pro')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 9,
                  background: '#171823', color: '#fff', border: 0, borderRadius: 10,
                  padding: '12px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  fontFamily: 'inherit' }}>
                {isPro ? 'Pro active ✓' : 'Upgrade to Pro'} <Icons.Arrow />
              </button>
            </div>
          </header>

          <div style={{ maxWidth: 1370, margin: 'auto', padding: 'clamp(22px,4.5vw,72px)',
            paddingTop: 45, paddingBottom: 90 }}>

            {/* ════════ OVERVIEW ════════ */}
            {view === 'overview' && (
              <>
                {/* Greeting */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'end', gap: 20, marginBottom: 31, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                      color: '#7652ee', fontWeight: 800, display: 'block' }}>YOUR WORKSPACE</span>
                    <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                      fontSize: 'clamp(29px,3.3vw,41px)', letterSpacing: '-.045em',
                      fontWeight: 800, margin: '9px 0' }}>
                      Good morning, {userName} ✳
                    </h1>
                    <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>
                      Here&apos;s where your websites stand—and what to improve next.
                    </p>
                  </div>
                </div>

                {/* Two-column layout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 315px', gap: 22 }}
                  className="dash-layout">

                  {/* Left */}
                  <div>
                    {/* Scan card */}
                    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                      boxShadow: '0 9px 25px #22233e05', padding: '25px 27px', marginBottom: 22,
                      position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', width: 330, height: 190, right: -100, top: -120,
                        background: 'radial-gradient(ellipse,#ece4ff,transparent 70%)', pointerEvents: 'none' }} />
                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                          fontSize: 18, fontWeight: 800, letterSpacing: '-.04em', margin: 0 }}>
                          What should we check today?
                        </h2>
                        <p style={{ fontSize: 12, color: '#83899c', margin: '7px 0 20px' }}>
                          Enter any publicly accessible website. No installation needed.
                        </p>
                        <form onSubmit={handleScan} style={{ display: 'flex', gap: 10 }}>
                          <div style={{ border: '1px solid #e4e6f0', background: '#fff', borderRadius: 10,
                            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', flex: 1, minWidth: 0 }}>
                            <Icons.Globe />
                            <input id="scan-url" type="text" value={url} onChange={e => setUrl(e.target.value)}
                              placeholder="https://yourwebsite.com" required
                              style={{ border: 0, outline: 0, padding: '14px 0', width: '100%',
                                fontSize: 12, background: '#fff', color: '#151621', fontFamily: 'inherit' }} />
                          </div>
                          <button type="submit" disabled={scanning}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 9,
                              color: 'white', background: 'linear-gradient(110deg,#8650fa,#3c8df6)',
                              border: 0, borderRadius: 10, padding: '12px 16px', fontSize: 12,
                              fontWeight: 800, cursor: scanning ? 'not-allowed' : 'pointer',
                              opacity: scanning ? .7 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            {scanning ? 'Scanning…' : <><span>Scan website</span> <Icons.Arrow /></>}
                          </button>
                        </form>
                        <div style={{ marginTop: 11, fontSize: 10, color: '#9ba0b0' }}>
                          Free preview · 47 checks · No install required
                        </div>
                      </div>
                    </div>

                    {/* Sites heading */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, margin: '25px 0 15px' }}>
                      <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                        fontSize: 17, fontWeight: 800, letterSpacing: '-.04em', margin: 0 }}>
                        Recent websites
                        <span style={{ fontFamily: 'inherit', fontWeight: 600, fontSize: 12, color: '#83899c', marginLeft: 8 }}>
                          ({Math.min(siteList.length, 4)}{siteList.length > 4 ? ` of ${siteList.length}` : ''})
                        </span>
                      </h2>
                      {siteList.length > 0 && (
                        <button onClick={() => setView('websites')}
                          style={{ border: 0, background: 'transparent', color: '#7651e8',
                            fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          View all websites →
                        </button>
                      )}
                    </div>

                    {/* Site cards grid — overview shows 4 most recent */}
                    {siteList.length === 0 ? (
                      <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                        padding: '40px 24px', textAlign: 'center' }}>
                        <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>
                          Run your first scan above to see your website here.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 15 }}
                        className="sites-grid">
                        {siteList.slice(0, 4).map(r => {
                          const domain = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
                          const s = r.scores || {};
                          const score = avgScore(s) ?? 0;
                          const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          return (
                            <article key={r.id}
                              style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                                boxShadow: '0 9px 25px #22233e05', padding: 19, cursor: 'pointer',
                                transition: 'border .2s,transform .2s' }}
                              onClick={() => router.push(`/report/${r.slug || r.id}`)}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                                  <div style={{ width: 38, height: 38, border: '1px solid #e9eaf2', borderRadius: 11,
                                    display: 'grid', placeItems: 'center', background: '#f8f9fc',
                                    color: '#6555d5', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                                    {domain[0]?.toUpperCase()}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <strong style={{ display: 'block', fontSize: 12, overflow: 'hidden',
                                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</strong>
                                    <small style={{ display: 'block', color: '#83899c', fontSize: 10, marginTop: 5 }}>
                                      Scanned {date}
                                    </small>
                                  </div>
                                </div>
                                <button onClick={e => { e.stopPropagation(); notify('Site actions coming soon.'); }}
                                  style={{ border: 0, background: 'transparent', color: '#9aa0af',
                                    fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>⋯</button>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '21px 0' }}>
                                <ScoreDonut score={score} />
                                <div>
                                  <strong style={{ fontSize: 12 }}>{scoreHealth(score)}</strong>
                                  <small style={{ display: 'block', color: '#83899c', fontSize: 11, marginTop: 5 }}>
                                    Based on latest scan
                                  </small>
                                </div>
                              </div>
                              <ScoreBars perf={s.performance} seo={s.seo} sec={s.security} a11y={s.accessibility} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                paddingTop: 13, borderTop: '1px solid #f0f1f5',
                                color: '#9296a5', fontSize: 10 }}>
                                <span>Performance · SEO · Security · A11y</span>
                                <button onClick={e => { e.stopPropagation(); router.push(`/report/${r.slug || r.id}`); }}
                                  style={{ border: 0, background: 'transparent', color: '#7551e4',
                                    fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  View report →
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}

                    {/* Fix queue preview */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, margin: '25px 0 15px' }}>
                      <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                        fontSize: 17, fontWeight: 800, letterSpacing: '-.04em', margin: 0 }}>
                        Priority fix queue
                      </h2>
                      <button onClick={() => setView('tasks')}
                        style={{ border: 0, background: 'transparent', color: '#7651e8',
                          fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        See all fixes →
                      </button>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                      boxShadow: '0 9px 25px #22233e05', padding: 22 }}>
                      {recommendations.slice(0, 3).map((rec, i) => {
                        const domain = rec.reportUrl ? (() => { try { return new URL(rec.reportUrl).hostname; } catch { return rec.reportUrl; } })() : '—';
                        const sev = (rec.priority === 'critical' || rec.priority === 'high') ? rec.priority : 'medium';
                        return (
                          <div key={rec.id || i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
                            padding: '14px 0', borderBottom: '1px solid #f0f1f5' }}
                            className="task-row-item">
                            <span style={{ width: 26, height: 26, display: 'grid', placeItems: 'center',
                              borderRadius: 8, background: '#f0ebff', color: '#7953df',
                              fontWeight: 800, fontSize: 11, flexShrink: 0 }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong style={{ fontSize: 12, display: 'block' }}>{rec.title}</strong>
                              <p style={{ fontSize: 11, color: '#8a90a1', margin: '5px 0 0' }}>
                                {domain} · {rec.category}
                              </p>
                            </div>
                            <SevBadge level={sev} />
                            {rec.reportSlug
                              ? <Link href={`/report/${rec.reportSlug}`}
                                  style={{ border: 0, background: '#f4f1ff', color: '#7651e4',
                                    fontSize: 10, fontWeight: 800, padding: '7px 9px', borderRadius: 7,
                                    flexShrink: 0, alignSelf: 'center', textDecoration: 'none',
                                    whiteSpace: 'nowrap' }}>
                                  View →
                                </Link>
                              : null}
                          </div>
                        );
                      })}
                      {recommendations.length === 0 && (
                        <div style={{ padding: '20px 0', textAlign: 'center', color: '#83899c', fontSize: 12 }}>
                          Run a scan to see recommended fixes here.
                        </div>
                      )}
                      <div style={{ height: 14 }} />
                    </div>
                  </div>

                  {/* ── Right column ── */}
                  <aside style={{ display: 'grid', alignContent: 'start', gap: 19 }}>

                    {/* Advisor card — Cernly's Take */}
                    {(() => {
                      const topRec = orderedRecs[takeIdx] || null;
                      const topDomain = topRec?.reportUrl
                        ? (() => { try { return new URL(topRec.reportUrl).hostname; } catch { return topRec.reportUrl; } })()
                        : null;
                      const firstAction = topRec?.actions?.[0] || null;
                      const priorityTagColors = {
                        critical: { bg: '#fff0f2', border: '#ffd6da', color: '#c0394a' },
                        high:     { bg: '#fff4e9', border: '#ffead6', color: '#b05d39' },
                        medium:   { bg: '#f1edff', border: '#e4daff', color: '#7948f6' },
                        low:      { bg: '#f4f5fb', border: '#e4e6f0', color: '#83899c' },
                      };
                      const tagStyle = priorityTagColors[topRec?.priority] || priorityTagColors.medium;
                      const total = orderedRecs.length;
                      return (
                        <div style={{ background: 'linear-gradient(145deg,#f6f1ff,#eef6ff 90%)',
                          border: '1px solid #e8e0ff', borderRadius: 17, padding: 22 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9,
                            color: '#6f4de1', fontWeight: 800, fontSize: 11 }}>
                            <span style={{ width: 28, height: 28, borderRadius: 9, background: '#e9ddff',
                              display: 'grid', placeItems: 'center' }}>
                              <Icons.Spark />
                            </span>
                            CERNLY&apos;S TAKE
                            {total > 1 && (
                              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9898b0', fontWeight: 600 }}>
                                {takeIdx + 1} of {total}
                              </span>
                            )}
                          </div>
                          <h3 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                            fontSize: 19, lineHeight: 1.3, letterSpacing: '-.04em',
                            fontWeight: 800, margin: '18px 0 10px' }}>
                            {topRec
                              ? `Your biggest opportunity? ${topRec.title}${topDomain ? ` on ${topDomain}` : ''}.`
                              : 'Run your first scan to get personalized advice.'}
                          </h3>
                          <p style={{ fontSize: 12, lineHeight: 1.7, color: '#73768c', margin: 0 }}>
                            {topRec
                              ? (topRec.explanation || topRec.why_it_matters || 'Addressing this will improve your site\'s overall health and user experience.')
                              : 'Enter a URL above and Cernly will analyze your site across performance, SEO, security, and accessibility.'}
                          </p>
                          {topRec && (
                            <>
                              {firstAction && (
                                <div style={{ background: 'rgba(255,255,255,.72)', border: '1px solid #e4daff',
                                  borderRadius: 10, padding: '12px 14px', margin: '14px 0 0' }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em',
                                    textTransform: 'uppercase', color: '#9898b0', marginBottom: 6 }}>
                                    Recommended next step
                                  </div>
                                  <p style={{ fontSize: 12, lineHeight: 1.6, color: '#5a5a78', margin: 0 }}>
                                    {firstAction.title && <strong>{firstAction.title}: </strong>}{firstAction.detail || firstAction.title}
                                  </p>
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 8, margin: '17px 0 16px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '6px 8px',
                                  borderRadius: 6, background: tagStyle.bg, border: `1px solid ${tagStyle.border}`, color: tagStyle.color,
                                  textTransform: 'capitalize' }}>
                                  {topRec.priority} priority
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '6px 8px',
                                  borderRadius: 6, background: '#eaf8f3', border: '1px solid #c7f0e2', color: '#1a8f6c' }}>
                                  {topRec.category}
                                </span>
                                {topRec.effort && (
                                  <span style={{ fontSize: 10, fontWeight: 800, padding: '6px 8px',
                                    borderRadius: 6, background: '#f4f5fb', border: '1px solid #e4e6f0', color: '#83899c',
                                    textTransform: 'capitalize' }}>
                                    {topRec.effort} effort
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setView('tasks')}
                                  style={{ flex: 1, background: 'white', color: '#343747', border: '1px solid #e9eaf2',
                                    borderRadius: 10, padding: '10px 12px', fontSize: 11, fontWeight: 800,
                                    cursor: 'pointer', fontFamily: 'inherit' }}>
                                  See all fixes
                                </button>
                                {topRec.reportSlug && (
                                  <Link href={`/report/${topRec.reportSlug}`}
                                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      gap: 6, color: 'white', background: 'linear-gradient(110deg,#8650fa,#3c8df6)',
                                      border: 0, borderRadius: 10, padding: '10px 12px', fontSize: 11,
                                      fontWeight: 800, textDecoration: 'none' }}>
                                    View report <Icons.Arrow />
                                  </Link>
                                )}
                              </div>
                              {total > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  marginTop: 16, paddingTop: 14, borderTop: '1px solid #e8e0ff' }}>
                                  <button onClick={() => setTakeIdx(i => Math.max(0, i - 1))}
                                    disabled={takeIdx === 0}
                                    style={{ border: 0, background: 'none',
                                      color: takeIdx === 0 ? '#c4b9f0' : '#7948f6',
                                      fontSize: 11, fontWeight: 800,
                                      cursor: takeIdx === 0 ? 'default' : 'pointer',
                                      fontFamily: 'inherit', padding: '4px 0' }}>
                                    ← Previous
                                  </button>
                                  <span style={{ fontSize: 10, color: '#9898b0', fontWeight: 600 }}>
                                    {takeIdx + 1} / {total}
                                  </span>
                                  <button onClick={() => setTakeIdx(i => Math.min(total - 1, i + 1))}
                                    disabled={takeIdx >= total - 1}
                                    style={{ border: 0, background: 'none',
                                      color: takeIdx >= total - 1 ? '#c4b9f0' : '#7948f6',
                                      fontSize: 11, fontWeight: 800,
                                      cursor: takeIdx >= total - 1 ? 'default' : 'pointer',
                                      fontFamily: 'inherit', padding: '4px 0' }}>
                                    Next →
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Scan allowance */}
                    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                      boxShadow: '0 9px 25px #22233e05', padding: 21 }}>
                      <h3 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                        fontSize: 14, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>
                        Your scan allowance
                      </h3>
                      <p style={{ fontSize: 11, color: '#83899c', lineHeight: 1.6, margin: '7px 0' }}>
                        {isPro ? 'Pro plan — unlimited scans' : 'Free preview usage this month'}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, margin: '20px 0 10px' }}>
                        <span>Scans used</span>
                        <b style={{ color: '#4c4c60' }}>{localReports.length} {!isPro && '/ 3'}</b>
                      </div>
                      <div style={{ height: 7, background: '#f0eff6', borderRadius: 20, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: isPro ? '40%' : `${Math.min(100, (localReports.length / 3) * 100)}%`,
                          background: 'linear-gradient(90deg,#8650fa,#4d8dfa)', borderRadius: 20 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 17, color: '#9b9faf', fontSize: 10 }}>
                        <span>Resets monthly</span>
                        {!isPro && (
                          <button onClick={() => setModal('pro')}
                            style={{ border: 0, background: 'transparent', color: '#7651e9',
                              fontWeight: 800, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Get more scans →
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Recent activity */}
                    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                      boxShadow: '0 9px 25px #22233e05', padding: '20px 22px' }}>
                      <h3 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                        fontSize: 14, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 4px' }}>
                        Recent activity
                      </h3>
                      {localReports.slice(0, 3).map(r => {
                        const domain = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
                        const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return (
                          <div key={r.id} style={{ display: 'flex', gap: 12, padding: '13px 0',
                            borderBottom: '1px solid #f0f1f6' }}>
                            <span style={{ width: 29, height: 29, borderRadius: 9, background: '#f1edff',
                              color: '#8054e9', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              <Icons.Check />
                            </span>
                            <div>
                              <strong style={{ fontSize: 11, display: 'block' }}>Scan completed</strong>
                              <p style={{ color: '#8c91a2', fontSize: 10, margin: '5px 0 0', lineHeight: 1.5 }}>
                                {domain} · {date}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      {localReports.length === 0 && (
                        <p style={{ fontSize: 11, color: '#83899c', margin: '12px 0 0' }}>No scans yet.</p>
                      )}
                    </div>

                  </aside>
                </div>
              </>
            )}

            {/* ════════ WEBSITES ════════ */}
            {view === 'websites' && !selectedDomain && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end',
                  gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                      color: '#7652ee', fontWeight: 800, display: 'block' }}>YOUR PORTFOLIO</span>
                    <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                      fontSize: 'clamp(29px,3.3vw,41px)', letterSpacing: '-.045em',
                      fontWeight: 800, margin: '9px 0' }}>My websites</h1>
                    <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>Click any row to see that site&apos;s full scan history.</p>
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17, overflow: 'hidden' }}>
                  <div style={{ padding: '18px 22px', borderBottom: '1px solid #e9eaf2' }}>
                    <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                      fontSize: 15, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>
                      Website portfolio
                    </h2>
                  </div>
                  {siteList.length === 0 ? (
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: '#83899c', fontSize: 13 }}>
                      No websites yet. Run a scan from the Overview to add your first one.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            {['Website', 'Score', 'Last scanned', 'Scans', ''].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '10px 14px',
                                fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
                                textTransform: 'uppercase', color: '#9398a8',
                                borderBottom: '1px solid #e9eaf2' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {siteList.map(r => {
                            const domain = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
                            const score = avgScore(r.scores ?? {}) ?? '—';
                            const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            const scanCount = localReports.filter(s => { try { return new URL(s.url).hostname === domain; } catch { return false; } }).length;
                            return (
                              <tr key={r.id} onClick={() => setSelectedDomain(domain)}
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2',
                                  fontWeight: 700, color: '#151621' }}>{domain}</td>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>
                                  {score} / 100
                                </td>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{date}</td>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                    background: '#f2efff', color: '#7650e9', borderRadius: 20,
                                    padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                                    {scanCount}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                    color: '#7650e9', fontSize: 11, fontWeight: 700 }}>
                                    View history →
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ════════ PER-DOMAIN SCAN HISTORY DRILL-DOWN ════════ */}
            {view === 'websites' && selectedDomain && (() => {
              const domainScans = localReports
                .filter(r => { try { return new URL(r.url).hostname === selectedDomain; } catch { return false; } })
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end',
                    gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                    <div>
                      <button onClick={() => setSelectedDomain(null)}
                        style={{ background: 'none', border: 'none', color: '#7650e9', fontSize: 12,
                          fontWeight: 700, cursor: 'pointer', padding: '0 0 6px', display: 'flex',
                          alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                        Back to all websites
                      </button>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                        color: '#7652ee', fontWeight: 800, display: 'block' }}>SCAN HISTORY</span>
                      <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                        fontSize: 'clamp(24px,2.8vw,36px)', letterSpacing: '-.045em',
                        fontWeight: 800, margin: '9px 0 4px', wordBreak: 'break-all' }}>{selectedDomain}</h1>
                      <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>
                        {domainScans.length} scan{domainScans.length !== 1 ? 's' : ''} — click any row to open that report.
                      </p>
                    </div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17, overflow: 'hidden' }}>
                    {domainScans.length === 0 ? (
                      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#83899c', fontSize: 13 }}>
                        No scans found for this domain.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              {['Date', 'Score', 'Performance', 'SEO', 'Security', 'Accessibility', ''].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '10px 14px',
                                  fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
                                  textTransform: 'uppercase', color: '#9398a8',
                                  borderBottom: '1px solid #e9eaf2' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {domainScans.map((r, idx) => {
                              const score = avgScore(r.scores ?? {}) ?? '—';
                              const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                              const sc = r.scores ?? {};
                              const fmt = v => v != null ? v : '—';
                              const isLatest = idx === 0;
                              return (
                                <tr key={r.id} onClick={() => router.push(`/report/${r.slug || r.id}`)}
                                  style={{ cursor: 'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f8f7ff'}
                                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#151621', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {date}
                                    {isLatest && (
                                      <span style={{ marginLeft: 7, background: '#f2efff', color: '#7650e9',
                                        fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 20,
                                        textTransform: 'uppercase', letterSpacing: '.05em' }}>Latest</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', fontWeight: 700,
                                    color: score >= 80 ? '#19b987' : score >= 60 ? '#efa642' : '#ef6473' }}>
                                    {score !== '—' ? `${score}/100` : '—'}
                                  </td>
                                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{fmt(sc.performance)}</td>
                                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{fmt(sc.seo)}</td>
                                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{fmt(sc.security)}</td>
                                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{fmt(sc.accessibility)}</td>
                                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2' }}>
                                    <button onClick={e => { e.stopPropagation(); router.push(`/report/${r.slug || r.id}`); }}
                                      style={{ background: '#f2efff', border: 0, color: '#7650e9',
                                        padding: '7px 11px', borderRadius: 7, fontSize: 11,
                                        fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Open
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* ════════ HISTORY ════════ */}
            {view === 'history' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end',
                  gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                      color: '#7652ee', fontWeight: 800, display: 'block' }}>TRACK YOUR PROGRESS</span>
                    <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                      fontSize: 'clamp(29px,3.3vw,41px)', letterSpacing: '-.045em',
                      fontWeight: 800, margin: '9px 0' }}>Scan history</h1>
                    <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>All your scans — view or delete any report.</p>
                  </div>
                  {!isPro && (
                    <button onClick={() => setModal('pro')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'linear-gradient(110deg,#8650fa,#3c8df6)', color: '#fff',
                        border: 0, borderRadius: 10, padding: '12px 16px', fontSize: 12,
                        fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Unlock trend tracking →
                    </button>
                  )}
                </div>
                <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17, overflow: 'hidden' }}>
                  {localReports.length === 0 ? (
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: '#83899c', fontSize: 13 }}>
                      No scans yet.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            {['Website', 'Date', 'Score', ''].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '10px 14px',
                                fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
                                textTransform: 'uppercase', color: '#9398a8',
                                borderBottom: '1px solid #e9eaf2' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {localReports.map(r => {
                            const domain = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
                            const score = avgScore(r.scores ?? {}) ?? '—';
                            const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            const isDeleting = deletingId === r.id;
                            return (
                              <tr key={r.id}>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2',
                                  fontWeight: 700, color: '#151621' }}>{domain}</td>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{date}</td>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{score}</td>
                                <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2' }}>
                                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                                    <button onClick={() => router.push(`/report/${r.slug || r.id}`)}
                                      style={{ background: '#f2efff', border: 0, color: '#7650e9',
                                        padding: '8px 11px', borderRadius: 7, fontSize: 11,
                                        fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      View
                                    </button>
                                    {isDeleting ? (
                                      <>
                                        <button onClick={() => handleDeleteReport(r.id)}
                                          style={{ background: '#fff0f2', border: '1px solid #f5c0c6', color: '#ef6473',
                                            padding: '7px 10px', borderRadius: 7, fontSize: 11,
                                            fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                          Confirm delete
                                        </button>
                                        <button onClick={() => setDeletingId(null)}
                                          style={{ background: 'transparent', border: 0, color: '#83899c',
                                            padding: '7px 8px', borderRadius: 7, fontSize: 11,
                                            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <button onClick={() => setDeletingId(r.id)}
                                        style={{ background: 'transparent', border: '1px solid #e9eaf2', color: '#9398a8',
                                          padding: '7px 10px', borderRadius: 7, fontSize: 11,
                                          fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                                        title="Delete scan">
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ════════ FIX QUEUE ════════ */}
            {view === 'tasks' && (
              <FixQueueView recommendations={recommendations} onOpenGuide={setModal} />
            )}

            {/* ════════ BILLING ════════ */}
            {view === 'billing' && (
              <>
                <div style={{ marginBottom: 28 }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                    color: '#7652ee', fontWeight: 800, display: 'block' }}>YOUR SUBSCRIPTION</span>
                  <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                    fontSize: 'clamp(29px,3.3vw,41px)', letterSpacing: '-.045em',
                    fontWeight: 800, margin: '9px 0 4px' }}>Plan &amp; billing</h1>
                  <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>Start free, unlock a report, or grow with Pro.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 14 }}>
                  {[
                    { name: 'Free', price: '$0', per: 'always', features: ['3 scans per month', 'Score preview', 'Top 3 issues'], featured: false, current: !isPro, cta: 'Current plan', action: null },
                    { name: 'Single Report', price: '$4.99', per: 'one-time per report', features: ['Full findings breakdown', 'AI fix recommendations', 'Shareable PDF export'], featured: false, current: false, cta: 'Get full report', action: () => notify('Checkout is handled by Stripe — connect your backend to enable.') },
                    { name: 'Pro', price: '$15', per: 'per month', features: ['Unlimited scans', 'Scan history & trends', 'Ask Cernly AI assistant', 'Dev handoff export', 'Monitoring & alerts'], featured: true, current: isPro, cta: isPro ? 'Active plan ✓' : 'Explore Pro', action: () => setModal('pro') },
                  ].map(plan => (
                    <div key={plan.name} style={{
                      background: plan.featured ? 'linear-gradient(145deg,#f9f6ff,#fff)' : '#fff',
                      border: `1px solid ${plan.featured ? '#c7b8ff' : '#e9eaf2'}`,
                      borderRadius: 17, padding: 22, boxShadow: '0 9px 25px #22233e05',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em',
                        textTransform: 'uppercase', color: plan.featured ? '#7948f6' : '#83899c',
                        marginBottom: 14 }}>{plan.name}</div>
                      <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                        fontWeight: 800, fontSize: 32, letterSpacing: '-.04em', marginBottom: 4 }}>{plan.price}</div>
                      <div style={{ fontSize: 11, color: '#83899c', marginBottom: 16 }}>{plan.per}</div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 8 }}>
                        {plan.features.map(f => (
                          <li key={f} style={{ fontSize: 12, color: '#5a5a6e', display: 'flex', gap: 8 }}>
                            <span style={{ color: '#7948f6', fontWeight: 800, flexShrink: 0 }}>✓</span>{f}
                          </li>
                        ))}
                      </ul>
                      <button onClick={plan.action || undefined} disabled={plan.current && !plan.action}
                        style={{
                          width: '100%', border: plan.featured ? 0 : '1px solid #e9eaf2',
                          borderRadius: 10, padding: '11px 14px', fontSize: 12, fontWeight: 800,
                          cursor: plan.current ? 'default' : 'pointer', fontFamily: 'inherit',
                          background: plan.featured ? '#171823' : '#fff',
                          color: plan.featured ? '#fff' : '#343747',
                          opacity: plan.current && plan.name === 'Free' ? .6 : 1,
                        }}>
                        {plan.cta}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ════════ ADMIN ════════ */}
            {view === 'admin' && isAdmin && (
              <>
                <div style={{ marginBottom: 28 }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                    color: '#7652ee', fontWeight: 800, display: 'block' }}>INTERNAL</span>
                  <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                    fontSize: 'clamp(29px,3.3vw,41px)', letterSpacing: '-.045em',
                    fontWeight: 800, margin: '9px 0 4px' }}>Cernly Admin</h1>
                  <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>
                    Protected by Clerk userId server-side check.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}
                  className="admin-grid">
                  {[
                    { label: 'Registered users', value: '—', sub: 'Live from DB' },
                    { label: 'Scans (30 days)',   value: localReports.length, sub: 'Across all users' },
                    { label: 'Report revenue',    value: '—', sub: 'Via Stripe' },
                    { label: 'Pro subscriptions', value: '—', sub: 'Active subs' },
                  ].map(t => (
                    <div key={t.label} style={{ background: '#fff', border: '1px solid #e9eaf2',
                      borderRadius: 17, padding: 18, boxShadow: '0 9px 25px #22233e05' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
                        textTransform: 'uppercase', color: '#83899c', marginBottom: 8 }}>{t.label}</div>
                      <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                        fontSize: 30, fontWeight: 800, letterSpacing: '-.03em' }}>{t.value}</div>
                      <div style={{ fontSize: 11, color: '#83899c', marginTop: 4 }}>{t.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17, overflow: 'hidden' }}>
                  <div style={{ padding: '18px 22px', borderBottom: '1px solid #e9eaf2' }}>
                    <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                      fontSize: 15, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>
                      Your recent scans
                    </h2>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {['URL', 'Plan', 'Score', 'Date'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '10px 14px',
                              fontSize: 10, fontWeight: 800, letterSpacing: '.07em',
                              textTransform: 'uppercase', color: '#83899c',
                              borderBottom: '1px solid #e9eaf2' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {localReports.slice(0, 10).map(r => {
                          const domain = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
                          const score = avgScore(r.scores ?? {}) ?? '—';
                          const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          return (
                            <tr key={r.id}>
                              <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2',
                                fontWeight: 700, color: '#151621' }}>{domain}</td>
                              <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2' }}>
                                <PlanChip plan={isPro ? 'pro' : 'free'} />
                              </td>
                              <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{score}</td>
                              <td style={{ padding: '12px 14px', borderBottom: '1px solid #e9eaf2', color: '#83899c' }}>{date}</td>
                            </tr>
                          );
                        })}
                        {localReports.length === 0 && (
                          <tr><td colSpan={4} style={{ padding: '24px 14px', color: '#83899c', fontSize: 12 }}>No scans yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ════════ SETTINGS ════════ */}
            {view === 'settings' && (
              <>
                <div style={{ marginBottom: 28 }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                    color: '#7652ee', fontWeight: 800, display: 'block' }}>PREFERENCES</span>
                  <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                    fontSize: 'clamp(29px,3.3vw,41px)', letterSpacing: '-.045em',
                    fontWeight: 800, margin: '9px 0 4px' }}>Settings</h1>
                  <p style={{ color: '#83899c', fontSize: 13, margin: 0 }}>Manage your workspace and account.</p>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17, padding: '26px 28px', maxWidth: 540 }}>
                  <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                    fontSize: 18, fontWeight: 800, letterSpacing: '-.04em', margin: '0 0 8px' }}>
                    Account profile
                  </h2>
                  <p style={{ fontSize: 13, color: '#83899c', lineHeight: 1.7, marginBottom: 24 }}>
                    Authentication is managed by Clerk. Changes to your email or password are made through your Clerk account.
                  </p>
                  <div style={{ display: 'grid', gap: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Display name
                      <input defaultValue={userName}
                        style={{ display: 'block', marginTop: 8, width: '100%', padding: 13,
                          border: '1px solid #e9eaf2', borderRadius: 9, color: '#151621',
                          background: '#fff', fontFamily: 'inherit', fontSize: 13 }} />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 700 }}>
                      Email
                      <input defaultValue={userEmail} readOnly
                        style={{ display: 'block', marginTop: 8, width: '100%', padding: 13,
                          border: '1px solid #e9eaf2', borderRadius: 9, color: '#83899c',
                          background: '#f8f9fd', fontFamily: 'inherit', fontSize: 13 }} />
                    </label>
                    <button onClick={() => notify('Preferences saved (UI only — backend not wired here).')}
                      style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'linear-gradient(110deg,#8650fa,#3c8df6)', color: '#fff',
                        border: 0, borderRadius: 10, padding: '12px 18px', fontSize: 12,
                        fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Save preferences
                    </button>
                    <hr style={{ border: 0, borderTop: '1px solid #e9eaf2', margin: '8px 0' }} />
                    <button onClick={() => signOut(() => router.push('/'))}
                      style={{ justifySelf: 'start', border: '1px solid #e9eaf2', background: '#fff',
                        color: '#ef6473', borderRadius: 10, padding: '11px 16px', fontSize: 12,
                        fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>
        </main>
      </div>

      {/* ── Toast ── */}
      <div role="status" aria-live="polite" style={{
        position: 'fixed', bottom: 24, left: '50%', transform: `translateX(-50%) translateY(${toast.show ? 0 : 20}px)`,
        background: '#1b1c2b', color: 'white', padding: '13px 18px', borderRadius: 11,
        boxShadow: '0 12px 40px #0003', opacity: toast.show ? 1 : 0,
        pointerEvents: toast.show ? 'auto' : 'none',
        transition: '.25s', zIndex: 100, fontSize: 12,
        maxWidth: 'calc(100vw - 30px)', whiteSpace: 'nowrap',
      }}>{toast.msg}</div>

      {/* ── Modal ── */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
          style={{ position: 'fixed', inset: 0, background: '#11132180', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 20 }}>
          <div style={{ width: 'min(510px,100%)', padding: 30, background: 'white',
            borderRadius: 20, boxShadow: '0 35px 100px #10112235', position: 'relative' }}>
            <button onClick={() => setModal(null)}
              style={{ position: 'absolute', right: 17, top: 17, border: 0,
                background: '#f4f4f8', borderRadius: 8, width: 32, height: 32,
                fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
            {modal === 'pro' ? (
              <>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                  color: '#7652ee', fontWeight: 800, display: 'block' }}>CERNLY PRO</span>
                <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                  fontSize: 25, letterSpacing: '-.04em', fontWeight: 800, margin: '9px 0' }}>
                  Turn scans into progress.
                </h2>
                <p style={{ color: '#858a9c', fontSize: 12, lineHeight: 1.7, margin: '0 0 16px' }}>
                  Pro is designed for people who want to improve their websites over time—not just run a one-off audit.
                </p>
                <div style={{ display: 'grid', gap: 10, margin: '0 0 20px' }}>
                  {['Historical scan comparisons', 'Guided remediation and task tracking', 'Monitoring and additional scan capacity'].map(f => (
                    <div key={f} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                      <b style={{ color: '#22b785' }}>✓</b> {f}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href="/api/checkout?plan=pro"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: 'linear-gradient(110deg,#8650fa,#3c8df6)', color: '#fff',
                      border: 0, borderRadius: 10, padding: '12px 18px', fontSize: 12,
                      fontWeight: 800, textDecoration: 'none' }}>
                    Explore $15/mo Pro →
                  </a>
                  <button onClick={() => setModal(null)}
                    style={{ background: '#fff', color: '#343747', border: '1px solid #e9eaf2',
                      borderRadius: 10, padding: '12px 16px', fontSize: 12, fontWeight: 800,
                      cursor: 'pointer', fontFamily: 'inherit' }}>
                    Not now
                  </button>
                </div>
              </>
            ) : (
              (() => {
                const g = guides[modal];
                return g ? (
                  <>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.16em',
                      color: '#7652ee', fontWeight: 800, display: 'block' }}>FIX GUIDE</span>
                    <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                      fontSize: 22, letterSpacing: '-.04em', fontWeight: 800, margin: '9px 0' }}>
                      {g.title}
                    </h2>
                    <div style={{ display: 'grid', gap: 10, margin: '16px 0 20px' }}>
                      {g.steps.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6f7486' }}>
                          <b style={{ color: '#7948f6', flexShrink: 0 }}>{i + 1}.</b> {s}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setModal(null)}
                      style={{ background: '#f4f1ff', color: '#7651e4', border: 0,
                        borderRadius: 10, padding: '11px 16px', fontSize: 12,
                        fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Got it
                    </button>
                  </>
                ) : null;
              })()
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.08);opacity:.85} }
        .task-row-item:last-child { border-bottom: none !important; }
        @media(max-width:900px){
          .dash-grid{ grid-template-columns: 1fr !important; }
          .dash-sidebar{ position:fixed; transform:translateX(-100%); transition:transform .25s; width:244px !important; }
          .dash-sidebar.open{ transform:translateX(0); }
          .mobile-menu-btn{ display:grid !important; }
          .dash-layout{ grid-template-columns: 1fr !important; }
          .admin-grid{ grid-template-columns: repeat(2,1fr) !important; }
        }
        @media(max-width:650px){
          .sites-grid{ grid-template-columns: 1fr !important; }
          .admin-grid{ grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
