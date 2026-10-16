'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';

/* ─── SVG icon helpers ─── */
const strokeAttrs = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Icon = ({ children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeAttrs} {...rest}>{children}</svg>
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
  Arrow:    () => <Icon><path d="M4 12h16m-7-7 7 7-7 7"/></Icon>,
  Back:     () => <Icon size={15}><path d="M20 12H4m7-7-7 7 7 7"/></Icon>,
  Shield:   () => <Icon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Icon>,
  Refresh:  () => <Icon size={14}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></Icon>,
  ChevDown: () => <Icon size={14}><path d="m6 9 6 6 6-6"/></Icon>,
  ChevUp:   () => <Icon size={14}><path d="m18 15-6-6-6 6"/></Icon>,
  Share:    () => <Icon size={14}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></Icon>,
};

/* Cernly logo mark */
const LogoMark = ({ size = 29 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
    <path fill="#151621" d="M50 5 C28 5 10 23 10 45 C10 55 14 64 21 71 L50 50 Z"/>
    <path fill="#7948f6" d="M50 5 C72 5 90 23 90 45 C90 55 86 64 79 71 L50 50 Z"/>
    <path fill="#3687fa" d="M21 71 C30 83 40 90 50 95 C60 90 70 83 79 71 L50 50 Z"/>
  </svg>
);

/* ─── Score tile (large colored number, no ring) ─── */
function ScoreTile({ score, label }) {
  const color = score == null ? '#83899c' : score >= 80 ? '#19b987' : score >= 60 ? '#efa642' : '#ef6473';
  const val = score ?? '—';
  return (
    <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
      padding: '26px 18px', textAlign: 'center', boxShadow: '0 2px 10px #1b1d3206' }}>
      <div style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
        fontSize: 52, lineHeight: 1, color, marginBottom: 10 }}>{val}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#83899c', letterSpacing: '.02em' }}>{label}</div>
    </div>
  );
}

/* ─── Impact badge ─── */
function ImpactBadge({ level }) {
  const map = {
    high:   { bg: '#fff4e5', color: '#d97706', label: 'HIGH IMPACT' },
    medium: { bg: '#f1edff', color: '#7948f6', label: 'MEDIUM IMPACT' },
    low:    { bg: '#f0fdf4', color: '#16a34a', label: 'LOW IMPACT' },
  };
  const s = map[level?.toLowerCase()] || map.medium;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em',
      padding: '4px 9px', borderRadius: 6, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

/* ─── Fix accordion item ─── */
function FixItem({ n, title, detail, fix, impact = 'medium', defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid #e9eaf2', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: open ? '#fafaff' : '#fff', border: 0,
          padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: '#f1edff',
          color: '#7948f6', display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
          {String(n).padStart(2, '0')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#151621',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
        </div>
        <ImpactBadge level={impact} />
        <span style={{ color: '#83899c', flexShrink: 0 }}>
          {open ? <Icons.ChevUp /> : <Icons.ChevDown />}
        </span>
      </button>

      {open && (
        <div style={{ padding: '14px 18px 18px', borderTop: '1px solid #f0f0f8' }}>
          {detail && (
            <p style={{ fontSize: 13, color: '#4b5168', lineHeight: 1.75, margin: '0 0 14px' }}>
              {detail}
            </p>
          )}
          {fix && (
            <div style={{ background: '#f7f4ff', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#7948f6',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>How to fix</div>
              <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.65 }}>{fix}</p>
            </div>
          )}
          <button style={{ fontSize: 12, fontWeight: 700, color: '#7948f6', background: 'none',
            border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            Read fix guide →
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Detailed section accordion ─── */
function DetailSection({ title, issues = [], accent }) {
  const [collapsed, setCollapsed] = useState(true);
  const critCount = issues.filter(i => i.severity === 'critical').length;
  const warnCount = issues.filter(i => i.severity === 'warning').length;
  const goodCount = issues.filter(i => i.severity === 'good').length;

  return (
    <div style={{ border: '1px solid #e9eaf2', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setCollapsed(c => !c)}
        style={{ width: '100%', background: '#fafaff', border: 0,
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: '#151621', flex: 1,
          fontFamily: 'var(--font-manrope, Manrope, sans-serif)' }}>{title}</span>
        <span style={{ fontSize: 11, color: '#83899c' }}>
          {critCount > 0 && `${critCount} critical · `}
          {warnCount > 0 && `${warnCount} warnings · `}
          {goodCount > 0 && `${goodCount} passed`}
          {issues.length === 0 && 'No issues'}
        </span>
        <span style={{ color: '#83899c' }}>{collapsed ? <Icons.ChevDown /> : <Icons.ChevUp />}</span>
      </button>
      {!collapsed && (
        <div style={{ padding: '4px 20px 16px' }}>
          {issues.length === 0
            ? <p style={{ fontSize: 13, color: '#83899c', margin: '12px 0 4px' }}>No issues detected.</p>
            : issues.map((issue, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: i < issues.length - 1 ? '1px solid #f0f0f8' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                    background: issue.severity === 'critical' ? '#ef6473' : issue.severity === 'warning' ? '#efa642' : issue.severity === 'good' ? '#19b987' : '#83899c'
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#151621' }}>{issue.message}</div>
                    {issue.area && <div style={{ fontSize: 11, color: '#83899c', marginTop: 2 }}>{issue.area}</div>}
                    {issue.detail && <div style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.6 }}>{issue.detail}</div>}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════════ */
export default function ReportClient({ isPro, userName, userAvatar, userEmail }) {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const router = useRouter();
  const { signOut } = useClerk();

  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ id });
    if (sessionId) params.set('session_id', sessionId);
    fetch(`/api/report?${params}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setStatus('error'); return; } setReport(d); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, [id, sessionId]);

  const domain = (() => {
    try { return new URL(report?.url || '').hostname; } catch { return report?.url || ''; }
  })();

  const displayName = userName || userEmail?.split('@')[0] || 'User';

  /* ── Sidebar ────────────────────────────────────────────────────────────── */
  const Sidebar = () => (
    <aside style={{
      background: '#fff', borderRight: '1px solid #e9eaf2',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
      padding: '27px 15px 18px', zIndex: 20, overflowY: 'auto',
    }} className={`dash-sidebar${sidebarOpen ? ' open' : ''}`}>

      {/* Logo */}
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10,
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
          { href: '/dashboard',          label: 'Overview',     icon: <Icons.Grid />  },
          { href: '/dashboard?v=websites',label: 'My websites',  icon: <Icons.Globe /> },
          { href: '/dashboard?v=history', label: 'Scan history', icon: <Icons.Clock /> },
          { href: '/dashboard?v=tasks',   label: 'Fix queue',    icon: <Icons.Check /> },
        ].map(({ href, label, icon }) => (
          <Link key={href} href={href} style={{
            border: 0, background: 'transparent',
            color: '#707688',
            display: 'flex', alignItems: 'center', gap: 13,
            textAlign: 'left', padding: '13px 14px', borderRadius: 10,
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
            textDecoration: 'none',
          }}>{icon}{label}</Link>
        ))}
      </nav>

      {/* Nav — Account */}
      <div style={{ fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase',
        color: '#a3a7b4', fontWeight: 800, padding: '0 15px', margin: '30px 0 12px' }}>Account</div>
      <nav style={{ display: 'grid', gap: 4 }}>
        {[
          { href: '/dashboard?v=billing',  label: 'Plan & billing', icon: <Icons.Chart />    },
          { href: '/dashboard?v=settings', label: 'Settings',       icon: <Icons.Settings /> },
        ].map(({ href, label, icon }) => (
          <Link key={href} href={href} style={{
            border: 0, background: 'transparent', color: '#707688',
            display: 'flex', alignItems: 'center', gap: 13,
            padding: '13px 14px', borderRadius: 10, fontWeight: 700,
            fontSize: 12, textDecoration: 'none',
          }}>{icon}{label}</Link>
        ))}
      </nav>

      {/* Bottom */}
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
              <Link href="/dashboard?v=billing"
                style={{ border: 0, borderRadius: 8, background: '#fff', color: '#222',
                  padding: '9px 13px', fontWeight: 800, fontSize: 11, cursor: 'pointer',
                  textDecoration: 'none', display: 'inline-block' }}>
                Explore Pro →
              </Link>
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
                {displayName[0]?.toUpperCase()}
              </div>
          }
          <div>
            <strong style={{ fontSize: 12, display: 'block' }}>{displayName}</strong>
            <small style={{ display: 'block', color: '#83899c', fontSize: 10, marginTop: 3 }}>Personal account</small>
          </div>
          <button onClick={() => signOut(() => router.push('/'))}
            style={{ marginLeft: 'auto', border: 0, background: 'transparent',
              color: '#a2a6b4', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
            title="Sign out">⋯</button>
        </div>
      </div>
    </aside>
  );

  /* ── Global styles ─────────────────────────────────────────────────────── */
  const globalStyles = `
    :root { color-scheme: light }
    *, *::before, *::after { box-sizing: border-box }
    @keyframes spin { to { transform: rotate(360deg) } }
    @media (max-width: 768px) {
      .report-grid { grid-template-columns: 1fr !important }
      .dash-sidebar { position: fixed; left: -260px; top: 0; bottom: 0; transition: left .25s; }
      .dash-sidebar.open { left: 0; }
    }
  `;

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (status === 'loading') {
    return (
      <div style={{ background: '#f8f9fd', minHeight: '100vh', colorScheme: 'light',
        fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)' }}>
        <style>{globalStyles}</style>
        <div style={{ display: 'grid', gridTemplateColumns: '244px minmax(0,1fr)', minHeight: '100vh' }} className="report-grid">
          <Sidebar />
          <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, border: '3px solid #e9eaf2',
                borderTopColor: '#7948f6', borderRadius: '50%', animation: 'spin .7s linear infinite',
                margin: '0 auto 16px' }} />
              <p style={{ color: '#83899c', fontSize: 14 }}>Loading report…</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────────── */
  if (status === 'error') {
    return (
      <div style={{ background: '#f8f9fd', minHeight: '100vh', colorScheme: 'light',
        fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)' }}>
        <style>{globalStyles}</style>
        <div style={{ display: 'grid', gridTemplateColumns: '244px minmax(0,1fr)', minHeight: '100vh' }} className="report-grid">
          <Sidebar />
          <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                fontSize: 22, color: '#151621', marginBottom: 8 }}>Report not found</h2>
              <p style={{ color: '#83899c', fontSize: 14, marginBottom: 24 }}>
                This report may have expired or the link is invalid.
              </p>
              <Link href="/dashboard" style={{ background: '#7948f6', color: '#fff',
                padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                ← Back to dashboard
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /* ── Build priorities from issues ───────────────────────────────────── */
  const allIssues = report.issues || [];
  const priorities = allIssues
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 8);

  const getImpact = (i, idx) => {
    if (i.severity === 'critical' || idx === 0) return 'high';
    if (i.severity === 'warning' || idx < 3) return 'high';
    return 'medium';
  };

  const scoreCategories = [
    { key: 'performance',   label: 'Performance',   score: report.scores?.performance   },
    { key: 'seo',           label: 'SEO',            score: report.scores?.seo           },
    { key: 'security',      label: 'Security',       score: report.scores?.security      },
    { key: 'accessibility', label: 'Accessibility',  score: report.scores?.accessibility },
  ];

  const detailCategories = [
    { key: 'perf',   label: 'Performance',    accent: '#7948f6', match: 'perf' },
    { key: 'seo',    label: 'SEO',            accent: '#3687fa', match: 'seo'  },
    { key: 'sec',    label: 'Security',       accent: '#19b987', match: 'sec'  },
    { key: 'a11y',   label: 'Accessibility',  accent: '#efa642', match: 'access' },
  ];

  const createdAt = report.createdAt
    ? new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ background: '#f8f9fd', minHeight: '100vh', colorScheme: 'light',
      fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)', color: '#151621' }}>
      <style>{globalStyles}</style>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: '#0d102060', zIndex: 19 }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '244px minmax(0,1fr)', minHeight: '100vh' }}
        className="report-grid">

        <Sidebar />

        <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>

          {/* ── Topbar ── */}
          <header style={{ height: 68, background: '#ffffffee', backdropFilter: 'blur(12px)',
            borderBottom: '1px solid #e9eaf2', display: 'flex', alignItems: 'center',
            padding: '0 28px', gap: 16, position: 'sticky', top: 0, zIndex: 10,
            flexShrink: 0 }}>
            {/* Mobile menu */}
            <button onClick={() => setSidebarOpen(o => !o)}
              style={{ display: 'none', border: 0, background: 'none', cursor: 'pointer',
                padding: 6, color: '#83899c' }} className="menu-btn">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </button>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
              color: '#83899c', flex: 1 }}>
              <Link href="/dashboard" style={{ color: '#83899c', textDecoration: 'none', fontWeight: 600 }}>
                Workspace
              </Link>
              <span style={{ opacity: .5 }}>›</span>
              <span style={{ color: '#151621', fontWeight: 700 }}>Website report</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href)
                    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
                    .catch(() => {});
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  background: copied ? '#edf9f4' : '#f1edff', color: copied ? '#19b987' : '#7948f6',
                  border: 0, borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit' }}>
                <Icons.Share />
                {copied ? 'Copied!' : 'Share'}
              </button>
              <Link href={`/dashboard?rescan=${encodeURIComponent(report.url || '')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  background: '#151621', color: '#fff', borderRadius: 9,
                  fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
                <Icons.Refresh /> Re-scan
              </Link>
              <div style={{ width: 34, height: 34, borderRadius: 9,
                background: 'linear-gradient(135deg,#8050fa,#3d9cf9)',
                display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                {displayName[0]?.toUpperCase()}
              </div>
            </div>
          </header>

          {/* ── Content ── */}
          <div style={{ padding: '28px 28px 64px', flex: 1, overflowY: 'auto' }}>

            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13, fontWeight: 600, color: '#83899c', textDecoration: 'none' }}>
                  <Icons.Back /> Back to overview
                </Link>
                <div style={{ width: 1, height: 18, background: '#e9eaf2' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em',
                    textTransform: 'uppercase', color: '#83899c' }}>
                    Website Report
                  </span>
                  {createdAt && (
                    <span style={{ fontSize: 11, color: '#b0b4c4' }}>· {createdAt}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Domain heading */}
            <h1 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
              fontSize: 'clamp(22px, 3vw, 30px)', letterSpacing: '-.05em',
              color: '#151621', margin: '0 0 24px' }}>
              {domain}
            </h1>

            {/* Score tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
              {scoreCategories.map(c => (
                <ScoreTile key={c.key} score={c.score} label={c.label} />
              ))}
            </div>

            {/* Cernly's take */}
            {report.aiSummary && (
              <div style={{ background: 'linear-gradient(145deg,#f6f1ff,#eef6ff 90%)',
                border: '1px solid #e5deff', borderRadius: 17, padding: '22px 24px',
                marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 15 }}>✦</span>
                  <span style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)',
                    fontWeight: 800, fontSize: 14, color: '#7948f6' }}>Cernly's take</span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.75, color: '#4b5168', margin: 0 }}>
                  {report.aiSummary}
                </p>
              </div>
            )}

            {/* Recommended fixes */}
            {priorities.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e9eaf2', borderRadius: 17,
                padding: '22px 24px', marginBottom: 24, boxShadow: '0 2px 10px #1b1d3206' }}>
                <div style={{ marginBottom: 18 }}>
                  <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
                    fontSize: 16, color: '#151621', margin: '0 0 4px', letterSpacing: '-.03em' }}>
                    Your recommended fixes
                  </h2>
                  <p style={{ fontSize: 13, color: '#83899c', margin: 0 }}>
                    Prioritised improvements — highest impact first.
                  </p>
                </div>
                {priorities.map((issue, i) => (
                  <FixItem
                    key={i}
                    n={i + 1}
                    title={issue.message}
                    detail={issue.detail}
                    fix={issue.fix}
                    impact={getImpact(issue, i)}
                    defaultOpen={i === 0}
                  />
                ))}
              </div>
            )}

            {/* Detailed findings */}
            <h2 style={{ fontFamily: 'var(--font-manrope, Manrope, sans-serif)', fontWeight: 800,
              fontSize: 16, letterSpacing: '-.03em', color: '#151621', margin: '0 0 14px' }}>
              Detailed findings
            </h2>
            {detailCategories.map(({ key, label, accent, match }) => (
              <DetailSection
                key={key}
                title={label}
                accent={accent}
                issues={allIssues.filter(i =>
                  i.area?.toLowerCase().includes(match) ||
                  i.category?.toLowerCase().includes(match)
                )}
              />
            ))}

          </div>
        </main>
      </div>
    </div>
  );
}
