'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

/* ── CSS matching home page design system ─────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Manrope:wght@600;800&display=swap');
:root {
  --ink: #11131d;
  --muted: #6f7280;
  --line: #e9eaf0;
  --violet: #7548f8;
  --blue: #3389ff;
  --green: #1cb985;
  --red: #e94545;
  --amber: #f5a623;
  --paper: #fff;
  --soft: #f7f8fc;
  --radius: 22px
}
* { box-sizing: border-box }
html { scroll-behavior: smooth }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'DM Sans', sans-serif;
  -webkit-font-smoothing: antialiased
}
a { text-decoration: none; color: inherit }
button { cursor: pointer; font: inherit }
h1,h2,h3 { font-family: Manrope, sans-serif; letter-spacing: -.025em; margin-top: 0 }
p { margin-top: 0; line-height: 1.7 }

/* topbar */
.topbar {
  position: sticky; top: 0; z-index: 50;
  background: #ffffffed; backdrop-filter: blur(18px);
  border-bottom: 1px solid #f0f0f4
}
.nav {
  width: min(1180px, calc(100% - 64px));
  margin: auto;
  height: 68px;
  display: flex; align-items: center; gap: 16px
}
.brand {
  display: inline-flex; align-items: center; gap: 10px;
  font: 800 20px Manrope, sans-serif; letter-spacing: -.07em
}
.brand svg { width: 22px; height: 22px }
.brand span { font-weight: 600 }
.domain-pill {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--soft); border: 1px solid var(--line);
  border-radius: 8px; padding: 6px 12px;
  font-size: 13px; color: var(--muted); font-weight: 600
}
.domain-pill svg { width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700; color: var(--muted);
  background: none; border: none; padding: 0;
}
.back-btn:hover { color: var(--ink) }
.back-btn svg { width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round }
.navright { margin-left: auto; display:flex; align-items:center; gap:16px }

/* page body */
.page { width: min(900px, calc(100% - 48px)); margin: 0 auto; padding: 48px 0 80px }

/* loading */
.loading-wrap {
  min-height: 70vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 0; text-align: center
}
.loading-mark {
  width: 72px; height: 72px;
  margin-bottom: 28px; flex: none
}
.loading-mark svg { width: 72px; height: 72px; display: block }
.loading-wrap h2 { font-size: 22px; margin-bottom: 8px }
.loading-wrap p { color: var(--muted); font-size: 14px; margin-bottom: 32px; min-height: 20px }
.steps-bar { display: flex; gap: 6px }
.step-dot {
  height: 5px; border-radius: 4px;
  transition: width .5s, background .5s
}

/* score grid */
.score-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px; margin-bottom: 28px
}
@media (max-width: 700px) { .score-grid { grid-template-columns: repeat(3, 1fr) } }
@media (max-width: 440px) { .score-grid { grid-template-columns: repeat(2, 1fr) } }
.score-card {
  padding: 22px 12px 18px; text-align: center;
  background: var(--soft); border: 1px solid var(--line);
  border-radius: 18px
}
.score-card.null-score { opacity: .5 }
.ring {
  width: 68px; height: 68px; border-radius: 50%;
  display: grid; place-items: center; margin: 0 auto 12px;
  background: conic-gradient(var(--c) calc(var(--n)*1%), #e9eaf0 0)
}
.ring:before {
  content:''; grid-area:1/1; width:54px; height:54px;
  background: var(--soft); border-radius: 50%
}
.ring b { grid-area:1/1; z-index:1; font: 800 17px Manrope; color: var(--c) }
.score-label { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .08em }

/* AI summary */
.ai-box {
  background: linear-gradient(110deg, #f7f3ff, #f0f7ff);
  border: 1px solid #e2daff; border-radius: 18px;
  padding: 24px 28px; margin-bottom: 28px
}
.ai-box-head {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 800; color: var(--violet);
  margin-bottom: 10px
}
.ai-box-head svg { width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round }
.ai-box p { font-size: 14px; color: #4a4e60; margin: 0; line-height: 1.7 }

/* site type badge */
.site-type-row { display:flex; align-items:center; gap:10px; margin-bottom:28px; flex-wrap:wrap }
.site-type-badge {
  display:inline-flex; align-items:center; gap:7px;
  background: #f1edff; color: #6033dd;
  border-radius: 8px; padding: 7px 14px;
  font-size: 12px; font-weight: 800; text-transform:uppercase; letter-spacing:.06em
}
.site-type-badge svg { width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2 }

/* issues */
.section-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 16px
}
.section-head h3 { font-size: 17px; margin: 0 }
.section-head span { font-size: 12px; color: var(--muted) }
.issue-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px }
.issue-row {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px 16px; border-radius: 14px;
  border: 1px solid var(--line); background: #fff
}
.issue-icon { width: 18px; height: 18px; flex: none; margin-top: 1px }
.issue-icon svg { width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round }
.issue-body strong { font-size: 14px; display: block; margin-bottom: 2px }
.issue-body span { font-size: 12px; color: var(--muted) }
.area-tag {
  display:inline-block; font-size:10px; font-weight:800; letter-spacing:.07em;
  text-transform:uppercase; padding: 3px 8px; border-radius:5px;
  margin-left: 8px; vertical-align: middle
}

/* paywall */
.paywall-wrap { position: relative; margin-bottom: 28px }
.paywall-blur { filter: blur(4px); pointer-events: none; user-select: none; opacity: .45 }
.paywall-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 28px
}
.paywall-card {
  background: #fff; border: 1px solid #ded6ff;
  box-shadow: 0 20px 50px #6b50d920; border-radius: 20px;
  padding: 32px 36px; text-align: center; max-width: 360px
}
.lock-icon {
  width: 48px; height: 48px; border-radius: 14px;
  background: linear-gradient(135deg, #8a46f8, #3389ff);
  display: grid; place-items: center; margin: 0 auto 16px
}
.lock-icon svg { width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round }
.paywall-card h3 { font-size: 18px; margin-bottom: 8px }
.paywall-card p { font-size: 13px; color: var(--muted); margin-bottom: 24px }
.btn-gradient {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 14px 24px; border-radius: 6px; border: 0;
  font-size: 14px; font-weight: 800; color: white;
  background: linear-gradient(110deg, #8a46f8, #446af6 60%, #258de9);
  box-shadow: 0 8px 22px #6a58ec36; text-decoration: none;
  transition: transform .2s; cursor: pointer
}
.btn-gradient:hover { transform: translateY(-2px) }

/* upgrade CTA */
.upgrade-cta {
  background: linear-gradient(110deg, #f7f3ff, #f0f7ff);
  border: 1px solid #e2daff; border-radius: 20px;
  padding: 40px; text-align: center
}
.upgrade-cta h3 { font-size: 22px; margin-bottom: 10px }
.upgrade-cta p { color: var(--muted); font-size: 14px; margin-bottom: 28px }

/* error */
.error-wrap {
  min-height: 60vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; gap: 0
}
.error-wrap svg { margin-bottom: 20px }
.error-wrap h2 { font-size: 22px; margin-bottom: 8px }
.error-wrap p { color: var(--muted); font-size: 14px; margin-bottom: 28px }
.btn-outline {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px; border-radius: 6px;
  font-size: 14px; font-weight: 800; color: var(--ink);
  background: #fff; border: 1.5px solid var(--line);
  text-decoration: none; transition: transform .2s
}
.btn-outline:hover { transform: translateY(-2px) }
`;

/* ── Cernly logo mark ──────────────────────────────────────────────────── */
/* Plain mark — fill="currentColor", matches home page header */
function CernlyMark({ style = {} }) {
  return (
    <svg aria-hidden="true" viewBox="195 175 895 875" xmlns="http://www.w3.org/2000/svg" style={{display:'block',...style}}>
      <path d="M210.88,597.17c-1.92.12-3.93-.58-4.48-1.24s-.97-3.06-.76-3.98c11.39-48.88,50.84-84.6,92.76-109.56,22.3-13.27,43.7-26.1,64.87-41.11,52.4-37.15,79.11-75.36,113.03-127.89l22.43-34.73c32.23-45.08,77.97-78.01,131.24-93.68,1.22-.36,3.93.09,4.54.91,4.51,6.07,2.51,50.21,1.38,67.19-3.77,56.96-14.7,113.18-38.87,164.93-13.55,29-31.57,54.3-54.59,76.43-27.97,26.89-60.01,47.21-96.52,60.57-21.05,7.7-41.49,13.71-63.62,18.52-56.54,12.3-113.27,20.1-171.42,23.65Z" fill="currentColor"/>
      <path d="M1075.29,597.22c-31.29-1.76-60.75-5.23-91.32-10.14-37.13-5.96-73.16-12.14-109.51-21.48-27.2-6.99-52.73-16.08-77.11-30.07-33.58-19.26-62.54-45.19-85.19-76.57-48.6-67.35-61.22-165.28-63.01-246.88l.74-24.19c.05-1.52,3.3-3.46,5.17-2.9,53.27,15.99,99.4,48.96,131.58,94.27l22.01,34.17c13.38,20.77,26.25,40.89,41.62,60.34,22.14,28.03,47.79,51.58,77.4,71.53l58.53,36.52c42.76,26.68,80.77,59.15,93.2,109.88.25,1.03.24,2.45.06,3.15-.23.87-2.89,2.45-4.15,2.38Z" fill="currentColor"/>
      <path d="M797.68,922.67c-32.2,56.52-79.76,98.45-142.12,117.91-2.48.77-5.89-.81-6-3.3l-1.25-29.38c.14-35.36,2.94-69.78,8.88-104.64,13.49-79.23,45.35-148.57,105.28-202.8,48.34-43.74,98.6-62.82,162.34-73.88,48.62-8.44,96.94-12.45,146.2-14.26,3.25-.12,7.35-.34,8.71,2.82-6.63,31.45-27.79,62.34-51.1,84.47-14.25,13.53-29.63,24.26-46.24,34.8l-57.5,36.51c-60.34,41.66-91.74,89.48-127.22,151.75Z" fill="currentColor"/>
      <path d="M514.03,962.58c-12.71-15.68-22.44-31.35-32.26-48.38-33.85-58.7-64.66-101.62-121.01-140.94l-53.53-34.47c-14.35-9.24-27.95-18.02-40.98-29.06-21.42-18.16-38.67-39.75-50.78-65.11-4.26-8.93-11.63-27.71-9.12-30.62.57-.66,2.66-1.41,3.76-1.35,48.35,2.7,95.64,7.89,143.41,15.64,62.11,10.07,110.39,25.7,159.44,65.72,46.02,37.55,79.42,86.64,97.86,143.16,20.51,62.84,24.72,132.93,23.74,198.93-.02,1.03-1.13,3.48-1.92,4.05-.95.69-3.35.77-5,.24-44.69-14.26-83.75-41-113.6-77.81Z" fill="currentColor"/>
    </svg>
  );
}

/* Colored gradient mark — used ONLY on the loading screen */
function CernlyColorMark() {
  return (
    <svg aria-hidden="true" viewBox="195 175 895 875" xmlns="http://www.w3.org/2000/svg" style={{display:'block',width:72,height:72}}>
      <defs>
        <linearGradient id="cmark-g" x1="1090" y1="1050" x2="195" y2="175" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3389ff"/>
          <stop offset="1" stopColor="#8a46f8"/>
        </linearGradient>
      </defs>
      <rect x="195" y="175" width="895" height="875" rx="150" ry="150" fill="url(#cmark-g)"/>
      <path d="M210.88,597.17c-1.92.12-3.93-.58-4.48-1.24s-.97-3.06-.76-3.98c11.39-48.88,50.84-84.6,92.76-109.56,22.3-13.27,43.7-26.1,64.87-41.11,52.4-37.15,79.11-75.36,113.03-127.89l22.43-34.73c32.23-45.08,77.97-78.01,131.24-93.68,1.22-.36,3.93.09,4.54.91,4.51,6.07,2.51,50.21,1.38,67.19-3.77,56.96-14.7,113.18-38.87,164.93-13.55,29-31.57,54.3-54.59,76.43-27.97,26.89-60.01,47.21-96.52,60.57-21.05,7.7-41.49,13.71-63.62,18.52-56.54,12.3-113.27,20.1-171.42,23.65Z" fill="#fff"/>
      <path d="M1075.29,597.22c-31.29-1.76-60.75-5.23-91.32-10.14-37.13-5.96-73.16-12.14-109.51-21.48-27.2-6.99-52.73-16.08-77.11-30.07-33.58-19.26-62.54-45.19-85.19-76.57-48.6-67.35-61.22-165.28-63.01-246.88l.74-24.19c.05-1.52,3.3-3.46,5.17-2.9,53.27,15.99,99.4,48.96,131.58,94.27l22.01,34.17c13.38,20.77,26.25,40.89,41.62,60.34,22.14,28.03,47.79,51.58,77.4,71.53l58.53,36.52c42.76,26.68,80.77,59.15,93.2,109.88.25,1.03.24,2.45.06,3.15-.23.87-2.89,2.45-4.15,2.38Z" fill="#fff"/>
      <path d="M797.68,922.67c-32.2,56.52-79.76,98.45-142.12,117.91-2.48.77-5.89-.81-6-3.3l-1.25-29.38c.14-35.36,2.94-69.78,8.88-104.64,13.49-79.23,45.35-148.57,105.28-202.8,48.34-43.74,98.6-62.82,162.34-73.88,48.62-8.44,96.94-12.45,146.2-14.26,3.25-.12,7.35-.34,8.71,2.82-6.63,31.45-27.79,62.34-51.1,84.47-14.25,13.53-29.63,24.26-46.24,34.8l-57.5,36.51c-60.34,41.66-91.74,89.48-127.22,151.75Z" fill="#fff"/>
      <path d="M514.03,962.58c-12.71-15.68-22.44-31.35-32.26-48.38-33.85-58.7-64.66-101.62-121.01-140.94l-53.53-34.47c-14.35-9.24-27.95-18.02-40.98-29.06-21.42-18.16-38.67-39.75-50.78-65.11-4.26-8.93-11.63-27.71-9.12-30.62.57-.66,2.66-1.41,3.76-1.35,48.35,2.7,95.64,7.89,143.41,15.64,62.11,10.07,110.39,25.7,159.44,65.72,46.02,37.55,79.42,86.64,97.86,143.16,20.51,62.84,24.72,132.93,23.74,198.93-.02,1.03-1.13,3.48-1.92,4.05-.95.69-3.35.77-5,.24-44.69-14.26-83.75-41-113.6-77.81Z" fill="#fff"/>
    </svg>
  );
}

/* ── Score ring ────────────────────────────────────────────────────────── */
function ScoreRing({ score, label }) {
  const isNull = score === null || score === undefined;
  const n = isNull ? 0 : score;
  const c = n >= 80 ? '#1cb985' : n >= 60 ? '#f5a623' : n >= 1 ? '#e94545' : '#c8cad6';
  return (
    <div className={`score-card${isNull ? ' null-score' : ''}`}>
      <div className="ring" style={{'--n': n, '--c': c}}>
        <b>{isNull ? '—' : n}</b>
      </div>
      <div className="score-label">{label}</div>
    </div>
  );
}

/* ── Issue row ─────────────────────────────────────────────────────────── */
const SEV_COLORS = { critical: '#e94545', warning: '#f5a623', info: '#8899b5', good: '#1cb985' };
const AREA_COLORS = {
  Performance: { bg: '#fff3f3', fg: '#c93b3b' },
  SEO:         { bg: '#fffbf0', fg: '#9a6200' },
  Security:    { bg: '#f0fff8', fg: '#147a57' },
  Accessibility:{ bg: '#f0f3ff', fg: '#3653c4' },
  UX:          { bg: '#f7f0ff', fg: '#6a28cc' },
};

function IssueRow({ issue }) {
  const sev = issue.severity || 'info';
  const color = SEV_COLORS[sev] || SEV_COLORS.info;
  const areaStyle = AREA_COLORS[issue.area] || { bg: '#f4f5f8', fg: '#6f7280' };

  const SevIcon = () => {
    if (sev === 'critical') return (
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></svg>
    );
    if (sev === 'good') return (
      <svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></svg>
    );
    return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/></svg>;
  };

  return (
    <div className="issue-row">
      <div className="issue-icon" style={{ color }}>
        <SevIcon />
      </div>
      <div className="issue-body">
        <strong>
          {issue.message}
          {issue.area && (
            <span className="area-tag" style={{ background: areaStyle.bg, color: areaStyle.fg }}>
              {issue.area}
            </span>
          )}
        </strong>
        {issue.description && <span>{issue.description}</span>}
      </div>
    </div>
  );
}

/* ── Main content ──────────────────────────────────────────────────────── */
function AnalyzeContent() {
  const searchParams = useSearchParams();
  const rawUrl = searchParams.get('url') || '';
  const url = rawUrl && !/^https?:\/\//i.test(rawUrl) ? 'https://' + rawUrl : rawUrl;

  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [phase, setPhase]     = useState('loading');
  const [loadingStep, setLoadingStep] = useState(0);

  const steps = [
    'Fetching page…',
    'Running performance analysis…',
    'Auditing SEO signals…',
    'Checking security headers…',
    'Scanning accessibility…',
    'Identifying site type & UX…',
    'Writing AI insights…',
  ];

  useEffect(() => {
    if (!url) { window.location.href = '/'; return; }

    let step = 0;
    const timer = setInterval(() => {
      step++;
      if (step < steps.length) setLoadingStep(step);
    }, 2000);

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(r => r.json())
      .then(d => {
        clearInterval(timer);
        if (d.error) { setError(d.error); setPhase('error'); }
        else {
          // Redirect to the full report page
          const slug = d.reportSlug || d.reportId;
          if (slug) {
            window.location.href = `/report/${slug}`;
          } else {
            setData(d); setPhase('results');
          }
        }
      })
      .catch(() => {
        clearInterval(timer);
        setError('Something went wrong. Please try again.');
        setPhase('error');
      });

    return () => clearInterval(timer);
  }, [url]);

  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  /* ── Loading ── */
  if (phase === 'loading') return (
    <>
      <style>{CSS}</style>
      <header className="topbar">
        <div className="nav">
          <a className="brand" href="/">
            <CernlyMark/>
            cernly<span>.ai</span>
          </a>
        </div>
      </header>
      <div className="page">
        <div className="loading-wrap">
          <div className="loading-mark">
            <CernlyColorMark/>
          </div>
          <h2>Analyzing {domain}</h2>
          <p>{steps[loadingStep]}</p>
          <div className="steps-bar">
            {steps.map((_, i) => (
              <div key={i} className="step-dot" style={{
                width: i <= loadingStep ? 24 : 8,
                background: i <= loadingStep
                  ? 'linear-gradient(90deg,#8a46f8,#3389ff)'
                  : '#e5e6ed',
              }}/>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  /* ── Error ── */
  if (phase === 'error') return (
    <>
      <style>{CSS}</style>
      <header className="topbar">
        <div className="nav">
          <a className="brand" href="/">
            <CernlyMark/>
            cernly<span>.ai</span>
          </a>
        </div>
      </header>
      <div className="page">
        <div className="error-wrap">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e94545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>
          </svg>
          <h2>Analysis failed</h2>
          <p>{error}</p>
          <a href="/" className="btn-outline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5m7-7-7 7 7 7"/>
            </svg>
            Try another URL
          </a>
        </div>
      </div>
    </>
  );

  /* ── Results ── */
  const { scores, aiSummary, issues, reportId, reportSlug, siteType, uxInsights } = data;
  const reportRef = reportSlug || reportId; // use slug for URLs, fall back to integer id

  const categories = [
    { key: 'performance',   label: 'Performance' },
    { key: 'seo',           label: 'SEO' },
    { key: 'ux',            label: 'UX' },
    { key: 'security',      label: 'Security' },
    { key: 'accessibility', label: 'Accessibility' },
  ];

  const visibleIssues  = issues.slice(0, 3);
  const lockedIssues   = issues.slice(3, 8);
  const hasLocked      = issues.length > 3;

  return (
    <>
      <style>{CSS}</style>
      <header className="topbar">
        <div className="nav">
          <a className="brand" href="/">
            <CernlyMark/>
            cernly<span>.ai</span>
          </a>
          <div className="domain-pill">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            {domain}
          </div>
          <div className="navright">
            <a href={url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'var(--muted)',fontWeight:700,display:'flex',alignItems:'center',gap:5}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
              Visit site
            </a>
            <a href="/" className="btn-outline" style={{padding:'8px 16px',fontSize:12}}>
              ← New analysis
            </a>
          </div>
        </div>
      </header>

      <div className="page">
        {/* Site type badge */}
        {siteType && (
          <div className="site-type-row">
            <div className="site-type-badge">
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>
              {siteType}
            </div>
            {uxInsights?.conversion_focus && (
              <span style={{fontSize:13,color:'var(--muted)'}}>Optimized for: <strong style={{color:'var(--ink)'}}>{uxInsights.conversion_focus}</strong></span>
            )}
          </div>
        )}

        {/* Score grid */}
        <div className="score-grid">
          {categories.map(({ key, label }) => (
            <ScoreRing key={key} score={scores[key] ?? null} label={label} />
          ))}
        </div>

        {/* AI summary */}
        {aiSummary && (
          <div className="ai-box">
            <div className="ai-box-head">
              <svg viewBox="0 0 24 24"><path d="M12 2.5c1.4 5.1 4.4 8.1 9.5 9.5-5.1 1.4-8.1 4.4-9.5 9.5-1.4-5.1-4.4-8.1-9.5-9.5 5.1-1.4 8.1-4.4 9.5-9.5Z"/></svg>
              AI Analysis
            </div>
            <p>{aiSummary}</p>
          </div>
        )}

        {/* Visible issues */}
        {visibleIssues.length > 0 && (
          <>
            <div className="section-head">
              <h3>Issues found</h3>
              <span>{issues.length} total</span>
            </div>
            <div className="issue-list">
              {visibleIssues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
            </div>
          </>
        )}

        {/* Locked issues + paywall */}
        {hasLocked && (
          <div className="paywall-wrap">
            <div className="issue-list paywall-blur">
              {lockedIssues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
            </div>
            <div className="paywall-overlay">
              <div className="paywall-card">
                <div className="lock-icon">
                  <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                </div>
                <h3>{issues.length - 3} more issues found</h3>
                <p>Get the full breakdown with fixes, priorities, UX recommendations, and an AI action plan — all in one shareable report.</p>
                <a href={`/checkout?reportId=${reportRef}`} className="btn-gradient">
                  Unlock full report — $4.99
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16m-7-7 7 7-7 7"/></svg>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade CTA */}
        <div className="upgrade-cta">
          <h3>Ready to fix what's holding your site back?</h3>
          <p>The full report covers up to 50 pages — with UX &amp; conversion analysis, prioritized fixes, detailed AI recommendations, and a shareable PDF.</p>
          <a href={`/checkout?reportId=${reportRef}`} className="btn-gradient">
            Get full report — $4.99
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16m-7-7 7 7-7 7"/></svg>
          </a>
        </div>
      </div>
    </>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense>
      <AnalyzeContent />
    </Suspense>
  );
}
