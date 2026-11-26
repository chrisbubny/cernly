'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import NavAuthButton from './components/NavAuthButton';
import CSS from './home.css.js';

const CernlyMark = () => (
  <svg aria-hidden="true" className="cernly-mark" focusable="false" viewBox="195 175 895 875" xmlns="http://www.w3.org/2000/svg">
    <path d="M210.88,597.17c-1.92.12-3.93-.58-4.48-1.24s-.97-3.06-.76-3.98c11.39-48.88,50.84-84.6,92.76-109.56,22.3-13.27,43.7-26.1,64.87-41.11,52.4-37.15,79.11-75.36,113.03-127.89l22.43-34.73c32.23-45.08,77.97-78.01,131.24-93.68,1.22-.36,3.93.09,4.54.91,4.51,6.07,2.51,50.21,1.38,67.19-3.77,56.96-14.7,113.18-38.87,164.93-13.55,29-31.57,54.3-54.59,76.43-27.97,26.89-60.01,47.21-96.52,60.57-21.05,7.7-41.49,13.71-63.62,18.52-56.54,12.3-113.27,20.1-171.42,23.65Z" fill="currentColor"/>
    <path d="M1075.29,597.22c-31.29-1.76-60.75-5.23-91.32-10.14-37.13-5.96-73.16-12.14-109.51-21.48-27.2-6.99-52.73-16.08-77.11-30.07-33.58-19.26-62.54-45.19-85.19-76.57-48.6-67.35-61.22-165.28-63.01-246.88l.74-24.19c.05-1.52,3.3-3.46,5.17-2.9,53.27,15.99,99.4,48.96,131.58,94.27l22.01,34.17c13.38,20.77,26.25,40.89,41.62,60.34,22.14,28.03,47.79,51.58,77.4,71.53l58.53,36.52c42.76,26.68,80.77,59.15,93.2,109.88.25,1.03.24,2.45.06,3.15-.23.87-2.89,2.45-4.15,2.38Z" fill="currentColor"/>
    <path d="M797.68,922.67c-32.2,56.52-79.76,98.45-142.12,117.91-2.48.77-5.89-.81-6-3.3l-1.25-29.38c.14-35.36,2.94-69.78,8.88-104.64,13.49-79.23,45.35-148.57,105.28-202.8,48.34-43.74,98.6-62.82,162.34-73.88,48.62-8.44,96.94-12.45,146.2-14.26,3.25-.12,7.35-.34,8.71,2.82-6.63,31.45-27.79,62.34-51.1,84.47-14.25,13.53-29.63,24.26-46.24,34.8l-57.5,36.51c-60.34,41.66-91.74,89.48-127.22,151.75Z" fill="currentColor"/>
    <path d="M514.03,962.58c-12.71-15.68-22.44-31.35-32.26-48.38-33.85-58.7-64.66-101.62-121.01-140.94l-53.53-34.47c-14.35-9.24-27.95-18.02-40.98-29.06-21.42-18.16-38.67-39.75-50.78-65.11-4.26-8.93-11.63-27.71-9.12-30.62.57-.66,2.66-1.41,3.76-1.35,48.35,2.7,95.64,7.89,143.41,15.64,62.11,10.07,110.39,25.7,159.44,65.72,46.02,37.55,79.42,86.64,97.86,143.16,20.51,62.84,24.72,132.93,23.74,198.93-.02,1.03-1.13,3.48-1.92,4.05-.95.69-3.35.77-5,.24-44.69-14.26-83.75-41-113.6-77.81Z" fill="currentColor"/>
  </svg>
);


/* ---------- helpers ---------- */

// Shared 1.1s ticker that drives the looping demo animations.
// Frozen at a "finished" frame for visitors who prefer reduced motion.
function useTick(ms = 1100) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setT(6); return; }
    const id = setInterval(() => setT(n => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

const Arrow = () => <span aria-hidden="true">→</span>;
const Spark = ({ size = 20 }) => (
  <span className="spark-tile" style={{ width: size, height: size }} aria-hidden="true">✦</span>
);

function Ring({ score, size = 60, r = 26, stroke = 6, delay = 0, fontSize = 18 }) {
  const c = 2 * Math.PI * r;
  const good = score >= 80;
  const color = good ? '#10b981' : '#f59e0b';
  const ink = good ? '#047857' : '#b45309';
  return (
    <div className="ring-box" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f1f8" strokeWidth={stroke} />
        <circle className="ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          style={{ strokeDasharray: c, strokeDashoffset: c, '--o': c * (1 - score / 100), animationDelay: `${delay}s` }} />
      </svg>
      <div className="num h" style={{ fontSize, color: ink }}>{score}</div>
    </div>
  );
}

function BrowserBar({ url, scan }) {
  return (
    <div className="browserbar">
      <div className="lights" aria-hidden="true"><i /><i /><i /></div>
      {url && <div className="urlbar">{url}</div>}
      {scan && <div className="scanline" aria-hidden="true"><i /></div>}
    </div>
  );
}

/* ---------- demo content (illustrative example site) ---------- */

const HERO_SCORES = [
  { label: 'Performance', score: 63, note: '2 critical', bad: true },
  { label: 'SEO', score: 78, note: '1 critical', bad: true },
  { label: 'Security', score: 100, note: 'Excellent' },
  { label: 'Accessibility', score: 82, note: '1 critical', bad: true },
];

const SCAN_ROWS = [['Performance', '12 checks'], ['Search visibility', '14 checks'], ['Accessibility', '13 checks'], ['Security', '8 checks']];

const FIX_ROWS = [
  ['Optimize the hero image', 'Est. savings 1,545 KiB', 'HIGH', 'high'],
  ['Add alt text to 4 images', 'Accessibility · 10 min', 'HIGH', 'high'],
  ['Write a meta description', 'SEO · 5 min', 'MEDIUM', 'med'],
  ['Defer non-critical CSS', 'Performance · 30 min', 'MEDIUM', 'med'],
];

const SITES = [
  { i: 'N', domain: 'northwindbikes.com', date: 'Nov 14', score: 81, status: 'Looking healthy', bars: [[63, '#f59e0b'], [78, '#f59e0b'], [100, '#10b981'], [82, '#10b981']] },
  { i: 'S', domain: 'stillwater-studio.com', date: 'Oct 30', score: 69, status: 'Needs attention', bars: [[58, '#f59e0b'], [52, '#f59e0b'], [100, '#10b981'], [90, '#10b981']] },
  { i: 'H', domain: 'harborlaw.co', date: 'Oct 28', score: 77, status: 'Needs attention', bars: [[34, '#ef4444'], [70, '#f59e0b'], [100, '#10b981'], [95, '#10b981']] },
  { i: 'F', domain: 'fieldnotes.blog', date: 'Oct 27', score: 83, status: 'Looking healthy', bars: [[64, '#f59e0b'], [72, '#f59e0b'], [100, '#10b981'], [96, '#10b981']] },
];

const PLAN_ROWS = [
  ['Fix accessibility barriers', 'Accessibility', '#ef4444', 'HIGH IMPACT', 'high'],
  ['Reduce critical request chain depth', 'Performance', '#ef4444', 'HIGH IMPACT', 'high'],
  ['Fix missing or weak SEO metadata', 'SEO', '#f59e0b', 'MEDIUM IMPACT', 'med'],
  ['Improve Time to Interactive', 'Performance', '#f59e0b', 'MEDIUM IMPACT', 'med'],
  ['Improve First Contentful Paint', 'Performance', '#f59e0b', 'LOW IMPACT', 'low'],
];

const CHECK_TABS = [
  { id: 'chk-performance', label: 'Performance' },
  { id: 'chk-seo', label: 'SEO' },
  { id: 'chk-accessibility', label: 'Accessibility' },
  { id: 'chk-security', label: 'Security' },
  { id: 'chk-action', label: 'AI action plan' },
];

const SEC_ROWS = ['HTTPS connection', 'Strict-Transport-Security', 'Content-Security-Policy', 'HTTP → HTTPS redirect'];

const AI_PLAN = [
  ['Optimize the largest homepage image', 'Biggest single cause of the 8.7s load — compress and resize featured_Bike.jpg.', 'Start here'],
  ['Label the newsletter form fields', 'Helps assistive technology identify what each field is asking for.', '≈ 10 min'],
  ['Write a page description', "Make the page's purpose clear in search previews.", '≈ 5 min'],
];

const FAQS = [
  ['Do I need to install anything?', 'No. Paste any public URL and Cernly scans it from the outside — no code or plugin required. You just need a free account, which includes 3 scans a month. The WordPress plugin is optional, for people who want findings inside their dashboard.'],
  ['How is this different from PageSpeed Insights or Lighthouse?', 'Those tools give you scores and raw diagnostics. Cernly runs similar checks, then connects related findings, explains what is actually causing the problem in plain English, and gives you a prioritized plan — then checks your fixes on the next scan.'],
  ['What does Cernly check?', '47 checks across performance, search visibility, accessibility and security — from Core Web Vitals and image weight to metadata, alt text, contrast and security headers.'],
  ['Is the $4.99 report a subscription?', 'No. The full report is a one-time purchase covering a deep audit of up to 50 pages, with an AI-prioritized fix plan you can share.'],
  ['Who is Cernly for?', 'Site owners, marketers and small teams who want to know what to fix without becoming performance or accessibility experts — and agencies who want a clear, shareable starting point for clients.'],
];

/* ---------- page ---------- */

export default function Home() {
  const router = useRouter();
  const t = useTick();
  const [urlInput, setUrlInput] = useState('');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [tab, setTab] = useState('overview');
  const [activeCheck, setActiveCheck] = useState(CHECK_TABS[0].id);
  const [openFaq, setOpenFaq] = useState(0);
  const toastTimerRef = useRef(null);
  const checksRef = useRef(null);
  const scrollFrameRef = useRef(null);

  function notice(msg) {
    setToast(msg);
    setToastVisible(true);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 4200);
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (!urlInput) {
      document.getElementById('hero-url')?.focus();
      return;
    }
    try {
      const u = urlInput.startsWith('http') ? urlInput : 'https://' + urlInput;
      new URL(u);
      router.push('/analyze?url=' + encodeURIComponent(u));
    } catch {
      notice('Please enter a valid URL, e.g. https://yourwebsite.com');
    }
  }

  function focusHero(e) {
    e?.preventDefault();
    const form = document.getElementById('hero-form');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    form?.querySelector('input')?.focus({ preventScroll: true });
  }

  // Sticky "What Cernly checks" nav: highlight the panel crossing ~36% of the viewport.
  useEffect(() => {
    const section = checksRef.current;
    const panels = section ? section.querySelectorAll('.check-panel') : [];
    if (!section || panels.length === 0) return;

    function updateActive() {
      scrollFrameRef.current = null;
      const bounds = section.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
      const referenceY = window.innerHeight * 0.36;
      let current = panels[0].id;
      for (const panel of panels) {
        if (panel.getBoundingClientRect().top <= referenceY) current = panel.id;
        else break;
      }
      setActiveCheck(current);
    }
    function schedule() {
      if (scrollFrameRef.current === null) scrollFrameRef.current = requestAnimationFrame(updateActive);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  function scrollToCheck(id) {
    setActiveCheck(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  // Animation phases derived from the shared ticker.
  const scanStep = t % 7;
  const fixStep = t % 7;
  const fixedCount = FIX_ROWS.filter((_, i) => fixStep > i + 1).length;
  const chatStep = t % 11;
  const hotPlan = t % 3;
  const checkIndex = Math.max(0, CHECK_TABS.findIndex(c => c.id === activeCheck));

  return (
    <div className="home">
      <style>{CSS}</style>

      {/* NAV */}
      <header className="topbar">
        <div className="wrap nav">
          <a aria-label="Cernly home" className="brand" href="#top">
            <CernlyMark />
            cernly<span>.ai</span>
          </a>
          <nav aria-label="Main navigation" className="navlinks">
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
            <a href="#checks">What we check</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="navright">
            <NavAuthButton />
            <a className="btn btn-dark" href="#hero-form" onClick={focusHero}>Try it free <Arrow /></a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero-outer">
          <div className="band hero">
            <div className="orb a" aria-hidden="true" />
            <div className="orb b" aria-hidden="true" />
            <div className="orb c" aria-hidden="true" />

            <div className="hero-copy">
              <h1 className="h">See what&apos;s holding<br />your website back.</h1>
              <p className="hero-sub">Cernly scans your site, explains what&apos;s slowing it down, hurting visibility, or frustrating visitors — then hands you a prioritized plan to fix it.</p>
              <form className="urlform" id="hero-form" onSubmit={handleFormSubmit}>
                <label htmlFor="hero-url" className="sr-only">Website address</label>
                <div className="field">
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>
                  <input id="hero-url" type="text" inputMode="url" autoComplete="url" placeholder="yourwebsite.com" value={urlInput} onChange={e => setUrlInput(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-grad">Analyze my site <Arrow /></button>
              </form>
              <div className="hero-ticks">
                <span>✓ Free account · 3 scans a month</span><span>✓ 47 checks</span><span>✓ Nothing to install</span>
              </div>
            </div>

            <div className="mock-wrap">
              <div className="float-chip left hide-sm" aria-hidden="true">
                <div className="trend-tile"><svg className="icon" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg></div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Largest Contentful Paint</div>
                  <div className="h" style={{ fontSize: 17 }}>8.7s <span style={{ color: 'var(--muted)' }}>→</span> <span style={{ color: 'var(--green-ink)' }}>2.1s</span></div>
                </div>
              </div>
              <div className="float-chip right hide-sm" aria-hidden="true">
                <div className="take-label" style={{ color: 'var(--violet-200)', fontSize: 12 }}><Spark size={22} /> ASK CERNLY</div>
                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: '#e4e2f0' }}>“Start with the hero image. Compressing <b style={{ color: '#fff' }}>featured_Bike.jpg</b> alone saves ~480 KB on every visit.”</div>
              </div>

              <div className="mock" role="img" aria-label="Example Cernly website report showing scores, Cernly's take, and an action plan">
                <BrowserBar url="app.cernly.ai/report/northwindbikes.com" scan />
                <div className="app">
                  <div className="side hide-sm">
                    <div className="ws"><span className="ws-icon">✦</span><div><div style={{ fontSize: 12, fontWeight: 700 }}>Personal workspace</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Free plan</div></div></div>
                    <div className="side-label">WORKSPACE</div>
                    <div className="side-item">Overview</div>
                    <div className="side-item on">My websites</div>
                    <div className="side-item">Scan history</div>
                    <div className="side-item">Fix queue <small>7</small></div>
                  </div>
                  <div className="app-main">
                    <div className="app-head">
                      <div><div className="kicker">WEBSITE REPORT</div><div className="h" style={{ fontSize: 26, marginTop: 2 }}>northwindbikes.com</div></div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span className="mini-btn" style={{ background: 'var(--grad)' }}>✦ Ask Cernly</span>
                        <span className="mini-btn" style={{ background: 'var(--ink)' }}>↻ Re-scan</span>
                      </div>
                    </div>
                    <div className="score-grid">
                      {HERO_SCORES.map((s, i) => (
                        <div className="score-card" key={s.label}>
                          <Ring score={s.score} delay={0.3 + i * 0.15} />
                          <div><div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div><div style={{ fontSize: 11, fontWeight: 600, color: s.bad ? '#c2410c' : 'var(--green-ink)' }}>{s.note}</div></div>
                        </div>
                      ))}
                    </div>
                    <div className="two-col">
                      <div className="card take">
                        <div className="take-label"><Spark /> CERNLY&apos;S TAKE</div>
                        <div className="h" style={{ fontSize: 19, lineHeight: 1.2 }}>Fast server, slow visual loading — LCP is 8.7s</div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--body)' }}>Your server responds in 100 ms and the main thread is clear. The delay is what the browser has to download before the page looks complete.</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }} aria-hidden="true">
                          <span className="shimmer" style={{ width: '92%', height: 8 }} /><span className="shimmer" style={{ width: '74%', height: 8 }} />
                        </div>
                      </div>
                      <div className="nextstep">
                        <div className="glowball" aria-hidden="true" style={{ right: -60, top: -60, width: 200, height: 200, background: 'radial-gradient(circle, rgba(124,92,255,.45), transparent 70%)' }} />
                        <div className="eyebrow light" style={{ fontSize: 11 }}>NEXT BEST STEP</div>
                        <div className="h" style={{ fontSize: 19 }}>Optimize images</div>
                        <div style={{ fontSize: 13, color: '#cfcde0', lineHeight: 1.55 }}>Resize and compress featured_Bike.jpg — 491 KB of its 617 KB is wasted.</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 600 }}>↯ Est. savings 1,545 KiB</span>
                          <span className="mini-btn" style={{ background: 'var(--grad)' }}>Guide me through this fix →</span>
                        </div>
                      </div>
                    </div>
                    <div className="card" style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)', fontSize: 13, fontWeight: 700 }}>Action plan <span style={{ fontWeight: 600, color: 'var(--muted)' }}>7 prioritized fixes</span></div>
                      {PLAN_ROWS.slice(0, 3).map(([label, , dot, impact, cls], i) => (
                        <div className="plan-row fadeUp" key={label} style={{ animationDelay: `${0.9 + i * 0.15}s` }}>
                          <span className="dot" style={{ background: dot }} /><strong>{label}</strong><span className={`pill ${cls}`}>{impact}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LOOP */}
        <section id="how" className="wrap section">
          <div className="sec-head">
            <div style={{ maxWidth: 640 }}>
              <div className="eyebrow">More than a score</div>
              <h2 className="h h2" style={{ marginBottom: 0 }}>Discover. Understand.<br /><span className="grad-text">Fix. Verify.</span></h2>
            </div>
            <p className="lead" style={{ maxWidth: 400 }}>Audit tools stop at a number. Cernly keeps going — explaining what the number means, what to do about it, and whether your fix actually worked.</p>
          </div>

          <div className="bento">
            <div className="tile soft">
              <div><div className="tile-num">01 · DISCOVER</div><h3 className="h">Paste a URL. That&apos;s the setup.</h3><p>Nothing to install. Cernly runs every check in parallel.</p></div>
              <div className="panel discover">
                <div className="radar-box" aria-hidden="true">
                  <div className="radar-ring" />
                  <div className="radar-ring" style={{ borderColor: 'var(--blue)', animationDelay: '1.2s' }} />
                  <div className="radar-core"><svg className="icon" style={{ width: 36, height: 36 }} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" /></svg></div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                  <div className="typed-url mono" aria-hidden="true"><span className="type">northwindbikes.com</span><span className="caret">|</span></div>
                  {SCAN_ROWS.map(([label, meta], i) => (
                    <div className="scan-row" key={label}>
                      {scanStep > i + 1 ? <span className="done-dot" aria-hidden="true">✓</span> : <span className="spinner" aria-hidden="true" />}
                      <span>{label}</span><small>{meta}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="tile dark">
              <div className="glowball glow" aria-hidden="true" style={{ right: -120, bottom: -120, width: 380, height: 380, background: 'radial-gradient(circle, rgba(124,92,255,.5), transparent 65%)' }} />
              <div style={{ position: 'relative' }}><div className="tile-num">02 · UNDERSTAND</div><h3 className="h">Answers, not jargon.</h3><p>Cernly connects related findings into one plain-English explanation of what&apos;s really going on.</p></div>
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['LCP 8.7s', 'TTFB 100ms', 'TBT 0ms', 'unused-css', 'chain depth 6'].map(m => <span className="metric mono" key={m}>{m}</span>)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }} aria-hidden="true"><svg width="24" height="34" viewBox="0 0 24 34" fill="none" stroke="#7c5cff" strokeWidth="2"><path d="M12 2v28M5 23l7 7 7-7" /></svg></div>
                <div className="glass">
                  <div className="take-label" style={{ color: 'var(--violet-200)' }}><Spark /> CERNLY&apos;S TAKE <span style={{ fontWeight: 500, letterSpacing: 0, color: '#a7a4c0' }}>· based on this scan</span></div>
                  <div className="h" style={{ marginTop: 10, fontSize: 20, lineHeight: 1.25 }}>Your server is fast. Your images aren&apos;t.</div>
                  <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: '#cfcde0' }}>Every slow metric points to the same cause: the browser downloads too much before the page looks complete. Fix delivery first; SEO and accessibility are real but secondary.</div>
                </div>
              </div>
            </div>

            <div className="tile soft">
              <div><div className="tile-num">03 · FIX</div><h3 className="h">A plan, ranked by impact.</h3><p>Step-by-step guidance for each fix, in the order that moves the needle most.</p></div>
              <div className="panel" style={{ padding: '8px 0' }}>
                {FIX_ROWS.map(([label, sub, impact, cls], i) => {
                  const done = fixStep > i + 1;
                  return (
                    <div className="fix-row" key={label}>
                      {done ? <span className="fix-box done" aria-hidden="true">✓</span> : <span className="fix-box open" aria-hidden="true">{i + 1}</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: done ? 'var(--muted)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>{label}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>
                      </div>
                      <span className={`pill ${cls}`}>{impact}</span>
                    </div>
                  );
                })}
                <div style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="progress"><i style={{ width: `${fixedCount * 25}%` }} /></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet-800)' }}>{fixedCount} of 4 fixed</span>
                </div>
              </div>
            </div>

            <div className="tile tint">
              <div><div className="tile-num">04 · VERIFY</div><h3 className="h">Re-scan. See it improve.</h3><p>Cernly compares scans, confirms what&apos;s resolved, and flags anything that slipped.</p></div>
              <div className="panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div><div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Performance score</div><div className="h" style={{ fontSize: 34 }}>63 <span style={{ color: 'var(--muted)', fontSize: 22 }}>→</span> <span style={{ color: 'var(--green-ink)' }}>91</span></div></div>
                  <span className="chip green">+28 over 4 scans</span>
                </div>
                <svg viewBox="0 0 400 130" width="100%" height="130" role="img" aria-label="Line chart: performance score rising from 63 to 91 across four scans" preserveAspectRatio="none">
                  <defs><linearGradient id="vf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c5cff" stopOpacity=".25" /><stop offset="1" stopColor="#7c5cff" stopOpacity="0" /></linearGradient></defs>
                  <path d="M0 32H400M0 72H400M0 112H400" stroke="#f1eff7" strokeWidth="1" />
                  <path d="M10 104 C 80 98, 100 76, 140 72 S 230 50, 270 40 S 360 18, 390 16 L390 130 L10 130 Z" fill="url(#vf)" />
                  <path className="draw" pathLength="1" d="M10 104 C 80 98, 100 76, 140 72 S 230 50, 270 40 S 360 18, 390 16" fill="none" stroke="#6a4cff" strokeWidth="3" strokeLinecap="round" />
                  {[[10, 104], [140, 72], [270, 40]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" fill="#fff" stroke="#6a4cff" strokeWidth="3" />)}
                  <circle cx="390" cy="16" r="5" fill="#6a4cff" />
                </svg>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip green">✓ 5 findings resolved</span><span className="chip amber">! 1 regression</span><span className="chip violet">2 still open</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRODUCT SHOWCASE */}
        <section id="product" style={{ padding: '100px 16px 40px' }}>
          <div className="band showcase">
            <div className="glowball glow" aria-hidden="true" style={{ left: '50%', top: -260, width: 900, height: 520, marginLeft: -450, background: 'radial-gradient(ellipse, rgba(106,76,255,.55), transparent 65%)' }} />
            <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
              <div className="eyebrow light">Inside Cernly</div>
              <h2 className="h h2" style={{ color: '#fff' }}>One workspace for every site you care about.</h2>
              <p className="lead" style={{ color: '#cfcde0' }}>Track all your sites, dig into any report, and work through fixes — with Cernly pointing to the biggest opportunity at every step.</p>
            </div>
            <div className="tablist" role="tablist" aria-label="Product screens">
              {[['overview', 'Workspace overview'], ['report', 'Website report'], ['plan', 'Action plan']].map(([id, label]) => (
                <button key={id} type="button" role="tab" id={`tab-${id}`} aria-controls="showcase-panel" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            <div className="screen">
              <BrowserBar />
              <div className="screen-scroll">
                <div className="screen-body" id="showcase-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
                  {tab === 'overview' && <OverviewScreen />}
                  {tab === 'report' && <ReportScreen />}
                  {tab === 'plan' && <PlanScreen />}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHAT CERNLY CHECKS */}
        <section id="checks" className="wrap section" style={{ paddingTop: 100 }} ref={checksRef}>
          <div style={{ maxWidth: 680, marginBottom: 64 }}>
            <div className="eyebrow">◆ What Cernly checks</div>
            <h2 className="h h2">Everything that matters.<br /><span style={{ color: 'var(--faint)' }}>Nothing you don&apos;t need.</span></h2>
            <p className="lead">Explore the signals behind a healthier website. Every finding comes with context — why it matters and what to do — not just another red warning.</p>
          </div>
          <div className="checks-layout">
            <nav aria-label="Check categories" className="checks-nav hide-sm">
              {CHECK_TABS.map((c, i) => (
                <button key={c.id} type="button" aria-current={activeCheck === c.id} onClick={() => scrollToCheck(c.id)}>
                  <small>0{i + 1}</small>{c.label}
                </button>
              ))}
              <div className="checks-progress" aria-hidden="true"><i style={{ width: `${(checkIndex + 1) * 20}%` }} /></div>
            </nav>

            <div className="checks-panels">
              <div className="check-panel" id="chk-performance">
                <div className="check-head"><span className="cat-icon" style={{ background: 'var(--amber-50)', color: '#c2410c' }}><svg className="icon" viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg></span><span className="eyebrow">01 / Performance</span></div>
                <h3 className="h">Know what&apos;s slowing you down.</h3>
                <p>See how quickly your pages load, what slows them down, and which improvements are worth your time.</p>
                <div className="frame">
                  <div className="frame-card" role="img" aria-label="Request waterfall: the hero image is the slowest download">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>Request waterfall <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>northwindbikes.com</span></div>
                    {[['document', 0, 14, '#10b981'], ['styles.css', 12, 30, '#7c5cff'], ['fonts.woff2', 16, 22, '#7c5cff'], ['app.js', 18, 34, '#4f6bff'], ['featured_Bike.jpg', 26, 100, '#f59e0b']].map(([f, pad, w, c], i) => (
                      <div className={`wf-row${i === 4 ? ' hot' : ''}`} key={f}><span>{f}</span><div style={{ paddingLeft: `${pad}%` }}><i style={{ width: `${w}%`, background: c, animationDelay: `${i * 0.12}s` }} /></div></div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                      <span className="chip amber">LCP 8.7s</span><span className="chip plain">FCP 3.6s</span><span className="chip green">TBT 0ms</span><span className="chip green">TTFB 100ms</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="check-panel" id="chk-seo">
                <div className="check-head"><span className="cat-icon" style={{ background: '#eef2ff', color: '#4338ca' }}><svg className="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" /></svg></span><span className="eyebrow">02 / Search visibility</span></div>
                <h3 className="h">Get found by the right people.</h3>
                <p>Spot overlooked fundamentals — metadata, headings, indexability and structured data.</p>
                <div className="frame">
                  <div className="frame-card">
                    <div style={{ fontSize: 14, fontWeight: 700 }}>How you appear in search</div>
                    <div className="serp">
                      <div style={{ fontSize: 12, color: 'var(--green-ink)' }}>northwindbikes.com › bikes</div>
                      <div style={{ fontSize: 18, color: '#1a0dab', fontWeight: 500, marginTop: 3 }}>Northwind Bikes | Road &amp; Gravel Bikes</div>
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }} aria-hidden="true"><span className="shimmer" style={{ width: '86%' }} /><span className="shimmer" style={{ width: '60%' }} /></div>
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--amber-ink)' }}>Meta description missing — Google is guessing</div>
                    </div>
                    <div className="audit first"><span>✓ Page title is present</span><b className="pass">Passed</b></div>
                    <div className="audit"><span>✓ Canonical URL is defined</span><b className="pass">Passed</b></div>
                    <div className="audit"><span>✓ Page is indexable</span><b className="pass">Passed</b></div>
                    <div className="audit"><span>○ Structured data is missing</span><b className="warn">Action needed</b></div>
                  </div>
                </div>
              </div>

              <div className="check-panel" id="chk-accessibility">
                <div className="check-head"><span className="cat-icon" style={{ background: 'var(--green-50)', color: 'var(--green-ink)' }}><svg className="icon" viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="1.8" /><path d="M5 8l7 1.5L19 8M12 9.5V15m0 0l-3.5 6M12 15l3.5 6" /></svg></span><span className="eyebrow">03 / Accessibility</span></div>
                <h3 className="h">Make your website easier for everyone.</h3>
                <p>Catch barriers in images, forms, contrast and navigation — with practical fixes you can make today.</p>
                <div className="frame">
                  <div className="frame-card" style={{ gap: 18 }}>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div className="img-flag" aria-hidden="true">
                        <svg width="180" height="130" viewBox="0 0 104 84"><circle cx="30" cy="58" r="14" fill="none" stroke="#3730a3" strokeWidth="3" /><circle cx="74" cy="58" r="14" fill="none" stroke="#3730a3" strokeWidth="3" /><path d="M30 58l14-22h22l8 22M44 36l-4-8h-6M52 58l14-22" fill="none" stroke="#3730a3" strokeWidth="3" /></svg>
                        <b>no alt text</b>
                      </div>
                      <div className="code mono" aria-hidden="true">&lt;img src=&quot;bike.jpg&quot;<br />&nbsp;&nbsp;alt=&quot;<span className="type" style={{ color: 'var(--green-ink)', animationDuration: '5s' }}>Red gravel bike</span><span className="caret">|</span>&quot;&gt;</div>
                    </div>
                    <div className="audit first"><span>○ 4 images need text alternatives</span><b className="bad">High impact</b></div>
                    <div className="audit"><span>○ Low-contrast text on light backgrounds</span><b className="warn">Review</b></div>
                    <div className="audit"><span>✓ Document language is specified</span><b className="pass">Passed</b></div>
                  </div>
                </div>
              </div>

              <div className="check-panel" id="chk-security">
                <div className="check-head"><span className="cat-icon" style={{ background: 'var(--violet-50)', color: 'var(--violet-800)' }}><svg className="icon" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg></span><span className="eyebrow">04 / Security</span></div>
                <h3 className="h">Spot risks before they become problems.</h3>
                <p>Check public-facing basics — HTTPS and response headers — without becoming a security expert.</p>
                <div className="frame">
                  <div className="frame-card" style={{ flexDirection: 'row', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="sec-badge" aria-hidden="true">
                      <div className="radar-ring" />
                      <div><span className="h" style={{ fontSize: 30 }}>100</span><span style={{ fontSize: 11, fontWeight: 600 }}>Excellent</span></div>
                    </div>
                    <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {SEC_ROWS.map((label, i) => (
                        <div className="sec-row" key={label}><span className="done-dot" style={{ animationDelay: `${0.1 + i * 0.2}s` }} aria-hidden="true">✓</span><span className="mono">{label}</span><b style={{ fontSize: 13, color: 'var(--green-ink)' }}>Passed</b></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="check-panel" id="chk-action">
                <div className="check-head"><span className="cat-icon" style={{ background: 'var(--grad)', color: '#fff' }}>✦</span><span className="eyebrow">05 / Your next steps</span></div>
                <h3 className="h">Know exactly what to fix next.</h3>
                <p>Cernly turns every finding above into one prioritized plan, with clear explanations and practical steps.</p>
                <div className="frame dark">
                  <div className="glowball glow" aria-hidden="true" style={{ right: -120, top: -120, width: 380, height: 380, background: 'radial-gradient(circle, rgba(124,92,255,.5), transparent 65%)' }} />
                  <div className="glass" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, color: '#fff', padding: 26 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span className="eyebrow light">✦ Your suggested action plan</span><span style={{ fontSize: 12, color: '#a7a4c0' }}>Ranked by impact and effort</span></div>
                    {AI_PLAN.map(([title, why, tag], i) => (
                      <div className={`ai-row${hotPlan === i ? ' hot' : ''}`} key={title}>
                        <span className="n">{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 13, color: '#cfcde0', marginTop: 3, lineHeight: 1.5 }}>{why}</div></div>
                        <span className={`tag${i === 0 ? ' first' : ''}`}>{tag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ASK CERNLY */}
        <section className="wrap section">
          <div className="ask-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="eyebrow">Ask Cernly</div>
              <h2 className="h h2" style={{ margin: 0 }}>Got a question about your report? <span className="grad-text">Just ask.</span></h2>
              <p className="lead">Cernly knows every finding on your site. Ask what to fix first, how long it&apos;ll take, or how to make a specific change — and get an answer grounded in your actual scan.</p>
              <div className="ticks-list">
                <div><span className="tick">✓</span>Answers reference your real files, metrics and pages</div>
                <div><span className="tick">✓</span>Step-by-step guidance for owners, CMS admins and developers</div>
                <div><span className="tick">✓</span>Tied to the specific finding you&apos;re looking at</div>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <div aria-hidden="true" style={{ position: 'absolute', inset: -30, borderRadius: 40, background: 'radial-gradient(circle at 30% 30%, #e9e3ff, transparent 60%), radial-gradient(circle at 80% 80%, #dfe6ff, transparent 60%)' }} />
              <div className="chat" role="img" aria-label="Example Ask Cernly conversation about what to fix first">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                  <Spark size={30} /><div><div style={{ fontSize: 14, fontWeight: 700 }}>Ask Cernly</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>northwindbikes.com · latest scan</div></div>
                </div>
                <div className="chat-body">
                  {chatStep >= 1 && <div className="bubble me">What should I prioritize first?</div>}
                  {(chatStep === 2 || chatStep === 3) && <div className="bubble ai typing"><i /><i /><i /></div>}
                  {chatStep >= 4 && (
                    <div className="bubble ai">Start with <b>image delivery</b>. Your server is fast, so the 8.7s LCP is almost entirely download weight — and <b>featured_Bike.jpg</b> is 80% wasted bytes.
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}><span className="chip green" style={{ padding: '4px 8px' }}>≈ 20 min</span><span className="chip violet" style={{ padding: '4px 8px', background: '#fff' }}>Biggest score gain</span></div>
                    </div>
                  )}
                  {chatStep >= 5 && <div className="bubble me">How do I do that in WordPress?</div>}
                  {chatStep >= 7 && <div className="bubble ai">Open <b>Media › featured_Bike.jpg</b>, replace it with a 1600px WebP, then re-scan. I&apos;ll confirm the fix and update your plan.</div>}
                </div>
                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}><span className="suggest">How long will these fixes take?</span><span className="suggest">Explain LCP simply</span></div>
                  <div className="ask-input"><span style={{ flex: 1, fontSize: 14, color: 'var(--muted)' }}>Ask about this report…</span><span className="send"><svg className="icon" style={{ width: 16, height: 16 }} viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg></span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TWO WAYS */}
        <section id="wordpress" style={{ padding: '100px 16px 40px' }}>
          <div className="band paths">
            <div className="paths-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center' }}>
                <div className="eyebrow">Two ways to start</div>
                <h2 className="h" style={{ margin: 0, fontSize: 'clamp(32px, 3.8vw, 48px)', lineHeight: 1.05 }}>Scan any website. Go further with WordPress.</h2>
                <p className="lead" style={{ fontSize: 16 }}>Start with a URL — nothing to install. Running WordPress? Bring Cernly into your dashboard and fix issues where you manage content.</p>
              </div>
              <div className="path-card">
                <span className="path-icon" style={{ background: 'var(--grad)', color: '#fff' }}><svg className="icon" style={{ width: 22, height: 22 }} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.5-4.5" /></svg></span>
                <h3 className="h">Analyze any URL</h3>
                <p>Paste any public URL for scores, top findings and Cernly&apos;s take.</p>
                <ul className="feat-list"><li>✓ Free account · 3 scans a month</li><li>✓ Performance, SEO, Security &amp; Accessibility</li><li>✓ Full audit up to 50 pages — $4.99</li></ul>
                <a className="btn btn-grad block" href="#hero-form" onClick={focusHero}>Analyze a URL <Arrow /></a>
              </div>
              <div className="path-card">
                <span className="path-icon" style={{ background: '#f6f7f7' }}><img src="/wordpress-logo.png" alt="" width={34} height={34} style={{ objectFit: 'contain' }} /></span>
                <h3 className="h">Connect your WordPress site</h3>
                <p>See findings right next to the content they affect, with the Cernly WordPress plugin.</p>
                <ul className="feat-list"><li>✓ Built for WordPress workflows</li><li>✓ Review issues alongside your site</li><li>✓ Room to grow into monitoring</li></ul>
                <button className="btn btn-outline block" type="button" onClick={() => notice('WordPress plugin availability and setup will be linked here.')}>Explore the plugin <Arrow /></button>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="wrap section" style={{ paddingTop: 100 }}>
          <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 48px' }}>
            <div className="eyebrow">Straightforward pricing</div>
            <h2 className="h h2">Start free. Go deeper when you&apos;re ready.</h2>
            <p className="lead">No subscription required to get real answers.</p>
          </div>
          <div className="price-grid">
            <div className="price-card">
              <div className="tier">FREE</div>
              <div className="price h">$0</div>
              <div style={{ fontSize: 15, color: 'var(--body)' }}>See where your site stands.</div>
              <hr />
              <ul className="feat-list"><li>✓ Core website scores</li><li>✓ Top findings preview</li><li>✓ 3 scans a month</li></ul>
              <a className="btn btn-outline block" href="#hero-form" onClick={focusHero}>Start free <Arrow /></a>
            </div>
            <div className="price-card feature">
              <div className="glowball glow" aria-hidden="true" style={{ right: -100, top: -100, width: 300, height: 300, background: 'radial-gradient(circle, rgba(124,92,255,.6), transparent 65%)' }} />
              <div className="tier" style={{ position: 'relative' }}>FULL REPORT <span className="badge" style={{ background: 'var(--grad)', color: '#fff' }}>MOST POPULAR</span></div>
              <div className="price h" style={{ position: 'relative' }}>$4.99 <small>one-time</small></div>
              <div style={{ position: 'relative', fontSize: 15, color: '#cfcde0' }}>Know exactly what to fix and why.</div>
              <hr />
              <ul className="feat-list" style={{ position: 'relative', color: '#fff' }}><li>✓ Deep audit up to 50 pages</li><li>✓ UX &amp; conversion analysis</li><li>✓ AI-prioritized fix plan</li><li>✓ Shareable report</li></ul>
              <a className="btn btn-grad block" style={{ position: 'relative' }} href="#hero-form" onClick={focusHero}>Unlock full report <Arrow /></a>
            </div>
            <div className="price-card">
              <div className="tier">PRO <span className="badge" style={{ background: 'var(--violet-50)', color: 'var(--violet-800)' }}>COMING SOON</span></div>
              <div className="price h">Pro</div>
              <div style={{ fontSize: 15, color: 'var(--body)' }}>Keep getting better, scan after scan.</div>
              <hr />
              <ul className="feat-list"><li>✓ Repeat audits &amp; progress tracking</li><li>✓ History and trends</li><li>✓ WordPress integration</li></ul>
              <button className="btn btn-outline block" type="button" onClick={() => notice('Pro plan details are still being finalized.')}>Explore Pro <Arrow /></button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="wrap section" style={{ paddingTop: 100 }}>
          <div className="faq-grid">
            <div>
              <div className="eyebrow">FAQ</div>
              <h2 className="h" style={{ margin: '12px 0 14px', fontSize: 'clamp(32px, 3.8vw, 48px)', lineHeight: 1.05 }}>Questions, answered.</h2>
              <p className="lead" style={{ fontSize: 16 }}>Something else on your mind? <a href="mailto:hello@cernly.ai" style={{ color: 'var(--violet-700)', fontWeight: 600 }}>Get in touch</a>.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FAQS.map(([q, a], i) => {
                const open = openFaq === i;
                return (
                  <div className={`faq-item${open ? ' open' : ''}`} key={q}>
                    <button type="button" aria-expanded={open} aria-controls={`faq-${i}`} onClick={() => setOpenFaq(open ? -1 : i)}>{q}<span aria-hidden="true">+</span></button>
                    {open && <p id={`faq-${i}`} className="fadeUp">{a}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section style={{ padding: '80px 16px 24px' }}>
          <div className="band closing">
            <div className="glowball glow" aria-hidden="true" style={{ left: '-10%', bottom: '-60%', width: '70%', height: '140%', background: 'radial-gradient(circle, rgba(106,76,255,.6), transparent 60%)' }} />
            <div className="glowball glow" aria-hidden="true" style={{ right: '-10%', top: '-60%', width: '60%', height: '140%', background: 'radial-gradient(circle, rgba(79,107,255,.5), transparent 60%)', animationDelay: '2.5s' }} />
            <div className="hide-sm" aria-hidden="true" style={{ position: 'absolute', left: '8%', top: '22%' }}>
              <div className="glass-chip" style={{ width: 92, height: 92, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'floaty 6s ease-in-out infinite' }}><span className="h" style={{ color: '#6ee7b7', fontSize: 30 }}>91</span></div>
            </div>
            <div className="hide-sm" aria-hidden="true" style={{ position: 'absolute', right: '9%', bottom: '22%' }}>
              <div className="glass-chip" style={{ animation: 'floaty2 7s ease-in-out infinite' }}>✓ 5 fixes confirmed</div>
            </div>
            <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
              <h2 className="h">A better website starts with <span className="grad-text">knowing what to fix.</span></h2>
              <p style={{ margin: 0, color: '#cfcde0', fontSize: 18, lineHeight: 1.6 }}>Stop guessing. Get a clear picture of what&apos;s wrong, what matters most, and where to start.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <a className="btn btn-grad" href="#hero-form" onClick={focusHero}>Analyze my site <Arrow /></a>
                <a className="btn btn-ghost-light" href="#pricing">See pricing</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap footer">
        <a className="brand" href="#top" style={{ fontSize: 17 }}><CernlyMark />cernly<span>.ai</span></a>
        <nav aria-label="Footer">
          <a href="#product">Product</a><a href="#checks">What we check</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a href="mailto:hello@cernly.ai">Contact</a>
        </nav>
        <small>© 2026 Cernly</small>
      </footer>

      <div aria-live="polite" className={`toast${toastVisible ? ' show' : ''}`} role="status">{toast}</div>
    </div>
  );
}

/* ---------- showcase screens ---------- */

function OverviewScreen() {
  return (
    <div className="fadeUp split">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 11 }}>Your workspace</div>
          <div className="h" style={{ fontSize: 32, marginTop: 4 }}>Good morning, Alex ✳</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>Here&apos;s where your websites stand — and what to improve next.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {SITES.map(s => (
            <div className="site-card" key={s.domain}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="site-initial">{s.i}</span><div><div style={{ fontSize: 14, fontWeight: 700 }}>{s.domain}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Scanned {s.date}</div></div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Ring score={s.score} size={68} r={30} fontSize={20} />
                <div><div style={{ fontSize: 14, fontWeight: 700 }}>{s.status}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Based on latest scan</div></div>
              </div>
              <div className="bars4" aria-hidden="true">
                {s.bars.map(([w, c], i) => <div key={i}><i style={{ width: `${w}%`, background: c, animationDelay: `${0.2 + i * 0.1}s` }} /></div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'linear-gradient(170deg, #f4f1ff, #fff)', border: '1px solid #e7e2fb', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="take-label">✦ CERNLY&apos;S TAKE</div>
          <div className="h" style={{ fontSize: 19, lineHeight: 1.25 }}>Biggest opportunity? Fix accessibility barriers on northwindbikes.com.</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--body)' }}>Screen reader users can&apos;t tell what four images show, which also creates compliance risk.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="chip" style={{ fontSize: 11, color: 'var(--red-ink)', background: '#fef2f2', padding: '4px 8px' }}>Critical priority</span><span className="chip green" style={{ fontSize: 11, padding: '4px 8px' }}>Low effort</span></div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Priority fix queue</div>
          <div className="mini-list">
            {['Fix accessibility barriers', 'Reduce request chain depth', 'Reduce resource downloads'].map((l, i) => <div key={l}><span className="num-badge">0{i + 1}</span><span style={{ flex: 1, fontWeight: 600 }}>{l}</span></div>)}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Recent activity</div>
          <div className="mini-list">
            <div><span className="act-icon" style={{ background: 'var(--violet-50)', color: 'var(--violet-800)' }}>✓</span><div><div style={{ fontWeight: 600 }}>Scan completed</div><div style={{ color: 'var(--muted)' }}>northwindbikes.com</div></div></div>
            <div><span className="act-icon" style={{ background: 'var(--green-50)', color: 'var(--green-ink)' }}>↑</span><div><div style={{ fontWeight: 600 }}>3 fixes confirmed</div><div style={{ color: 'var(--muted)' }}>fieldnotes.blog</div></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportScreen() {
  return (
    <div className="fadeUp" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><div className="kicker">← BACK · WEBSITE REPORT</div><div className="h" style={{ fontSize: 32, marginTop: 4 }}>northwindbikes.com</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {HERO_SCORES.map(s => (
          <div className="card" key={s.label} style={{ padding: 20, textAlign: 'center' }}>
            <div className="h" style={{ fontSize: 42, color: s.score >= 80 ? '#059669' : '#d97706', animation: 'popIn .35s cubic-bezier(.3,1.6,.5,1) both' }}>{s.score}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{s.label}</div>
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: s.bad ? '#c2410c' : 'var(--green-ink)' }}>{s.note}</div>
          </div>
        ))}
      </div>
      <div className="split" style={{ gap: 18 }}>
        <div className="nextstep" style={{ background: 'linear-gradient(160deg, #1b1840, #14152a)', borderRadius: 18, padding: 26, gap: 12 }}>
          <div className="eyebrow light" style={{ fontSize: 11 }}>NEXT BEST STEP</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--violet-200)', background: 'rgba(124,92,255,.25)', padding: '4px 8px', borderRadius: 6, width: 'fit-content' }}>Performance</span>
          <div className="h" style={{ fontSize: 24 }}>Optimize images</div>
          <div style={{ fontSize: 14, color: '#cfcde0', lineHeight: 1.55 }}>Oversized images make the page heavier to download, which slows the visible content and frustrates visitors on slower connections.</div>
          <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 12, padding: 14, fontSize: 13, color: '#cfcde0', lineHeight: 1.55 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--violet-200)', marginBottom: 4 }}>WHAT WE FOUND</div>
            1,545 KiB of savings from better image delivery. The largest example is featured_Bike.jpg — 491,704 of 617,304 bytes wasted.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ fontSize: 13, color: '#6ee7b7', fontWeight: 600 }}>↯ Est. savings 1,545 KiB</span><span className="mini-btn" style={{ background: 'var(--grad)', fontSize: 13, padding: '10px 14px' }}>Guide me through this fix →</span></div>
        </div>
        <div className="card" style={{ padding: 20, borderRadius: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>✓ What&apos;s working well</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            {['HTTPS, HSTS and a Content Security Policy are all in place.', "Server response is fast — the delay isn't the root document.", 'No main-thread blocking or layout shift problems.', 'Single H1, canonical tag and document language present.'].map(l => (
              <div key={l} style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--green-ink)' }}>●</span>{l}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 20, borderRadius: 18, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <span className="chip amber" style={{ fontWeight: 700 }}>02</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--amber-ink)' }}>ACCESSIBILITY <span className="pill low" style={{ marginLeft: 6 }}>HIGH CONFIDENCE</span></div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>Four images lack alt attributes</div>
          <div style={{ fontSize: 13, color: 'var(--body)', marginTop: 4, lineHeight: 1.55 }}>This affects screen reader users and image search indexing. Lighthouse reports it as critical for both accessibility and SEO.</div>
        </div>
      </div>
    </div>
  );
}

function PlanScreen() {
  return (
    <div className="fadeUp" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>Understand <span aria-hidden="true">›</span> <span className="num-badge">Fix</span> <span aria-hidden="true">›</span> Verify</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><div className="h" style={{ fontSize: 30 }}>Action plan</div><div style={{ fontSize: 14, color: 'var(--muted)' }}>7 prioritized fixes · mark progress as you go</div></div>
        <span className="chip amber" style={{ fontWeight: 700 }}>7 open</span>
      </div>
      <div className="card" style={{ border: '2px solid var(--violet-200)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span className="dot" style={{ background: '#ef4444', width: 9, height: 9 }} /><span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Reduce unnecessary resource downloads</span><span style={{ fontSize: 12, color: 'var(--muted)' }}>Performance</span><span className="pill high">HIGH IMPACT</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {['Export featured_Bike.jpg at 1600px wide and convert it to WebP.', 'Add width and height attributes and lazy-load images below the fold.', 'Re-scan to confirm Largest Contentful Paint improved.'].map((s, i) => (
            <div key={s} style={{ background: 'var(--soft-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, fontSize: 13, lineHeight: 1.5 }}><div style={{ fontWeight: 700, color: 'var(--violet-800)', fontSize: 12 }}>STEP {i + 1}</div>{s}</div>
          ))}
        </div>
      </div>
      {PLAN_ROWS.map(([label, cat, dot, impact, cls]) => (
        <div className="card" key={label} style={{ borderRadius: 14, padding: '15px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="dot" style={{ background: dot, width: 9, height: 9 }} /><span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{label}</span><span style={{ fontSize: 12, color: 'var(--muted)' }}>{cat}</span><span className={`pill ${cls}`}>{impact}</span>
        </div>
      ))}
    </div>
  );
}
