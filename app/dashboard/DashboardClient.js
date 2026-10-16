'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, ExternalLink, Zap, Search, Shield, Eye,
  Crown, LogOut, Globe
} from 'lucide-react';
import { useClerk } from '@clerk/nextjs';

function ScorePill({ score }) {
  const color = score >= 80 ? '#1cb985' : score >= 60 ? '#e8a147' : '#ee6b76';
  const bg    = score >= 80 ? '#eaf8f2' : score >= 60 ? '#fff8ed' : '#fff0f0';
  return (
    <span style={{ background: bg, color, fontSize: 11, fontWeight: 800,
      padding: '3px 8px', borderRadius: 6 }}>
      {score}
    </span>
  );
}

function ReportRow({ report }) {
  const domain = (() => { try { return new URL(report.url).hostname; } catch { return report.url; } })();
  const date = new Date(report.created_at).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
  const s = report.scores || {};

  return (
    <Link href={`/report/${report.id}`}
      style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
        alignItems: 'center', gap: 16, padding: '16px 22px',
        borderBottom: '1px solid #f0f0f5', textDecoration: 'none',
        color: 'inherit', transition: 'background .15s' }}
      className="report-row">
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#11131d',
          display: 'flex', alignItems: 'center', gap: 6 }}>
          {domain}
          <ExternalLink size={11} style={{ color: '#9099b2' }} />
        </div>
        <div style={{ fontSize: 12, color: '#9099b2', marginTop: 2 }}>{date}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[
          { label: 'Perf', val: s.performance },
          { label: 'SEO',  val: s.seo         },
          { label: 'Sec',  val: s.security    },
          { label: 'A11y', val: s.accessibility },
        ].map(({ label, val }) => val != null
          ? <ScorePill key={label} score={val} />
          : null
        )}
      </div>
      <ArrowRight size={15} style={{ color: '#9099b2' }} />
    </Link>
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

export default function DashboardClient({ reports, isPro, userName, userAvatar, userEmail }) {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const router = useRouter();
  const { signOut } = useClerk();

  async function handleScan(e) {
    e.preventDefault();
    if (!url.trim()) return;
    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
    setScanning(true);
    setScanStage(0);

    // Cycle through stages while fetch is in flight
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
      if (data.reportId) {
        router.push(`/report/${data.reportId}`);
      } else {
        alert(data.error || 'Scan failed. Please try again.');
        setScanning(false);
      }
    } catch {
      clearInterval(stageTimer);
      alert('Scan failed. Please try again.');
      setScanning(false);
    }
  }

  const stage = SCAN_STAGES[scanStage];

  return (
    <div style={{ background: '#fafaff', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Analyzing overlay — matches homepage experience */}
      {scanning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(17,19,29,0.72)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '40px 48px',
            textAlign: 'center', maxWidth: 360, width: '90%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
            {/* Animated logo mark */}
            <div style={{ width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg,#8a46f8,#258de9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', animation: 'pulse 1.4s ease-in-out infinite' }}>
              <Search size={24} color="#fff" />
            </div>
            <h3 style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800,
              fontSize: 18, letterSpacing: '-0.04em', color: '#11131d', margin: '0 0 8px' }}>
              Analyzing your website
            </h3>
            <p style={{ fontSize: 13, color: '#9099b2', margin: '0 0 24px', lineHeight: 1.5 }}>
              {stage.label}
            </p>
            {/* Progress bar */}
            <div style={{ background: '#f0f0f5', borderRadius: 100, height: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 100,
                background: 'linear-gradient(90deg,#8a46f8,#258de9)',
                width: `${stage.pct}%`, transition: 'width 0.8s ease' }} />
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: '#ffffffed',
        backdropFilter: 'blur(16px)', borderBottom: '1px solid #f0f0f4' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px',
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo — matches homepage brand mark */}
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
            fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20,
            letterSpacing: '-0.07em', color: '#11131d', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="9" fill="url(#dg)"/>
              <circle cx="14" cy="14" r="6" stroke="#fff" strokeWidth="2.2" fill="none"/>
              <line x1="18.8" y1="18.8" x2="25" y2="25" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
              <defs><linearGradient id="dg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#8a46f8"/><stop offset="1" stopColor="#258de9"/>
              </linearGradient></defs>
            </svg>
            cernly<span style={{ fontWeight: 600 }}>.ai</span>
          </Link>

          {/* Profile */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setProfileOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none',
                border: '1px solid #e8eaf1', borderRadius: 10, padding: '6px 12px 6px 6px',
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              {userAvatar
                ? <img src={userAvatar} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
                : <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#8a46f8,#258de9)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#fff' }}>
                    {userName[0]?.toUpperCase()}
                  </div>
              }
              <span style={{ fontSize: 13, fontWeight: 700, color: '#11131d' }}>{userName}</span>
            </button>

            {profileOpen && (
              <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff',
                border: '1px solid #e8eaf1', borderRadius: 12, padding: 8, minWidth: 200,
                boxShadow: '0 8px 32px #1b1d3218', zIndex: 100 }}>
                <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid #f0f0f5', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#11131d' }}>{userName}</div>
                  <div style={{ fontSize: 12, color: '#9099b2', marginTop: 2 }}>{userEmail}</div>
                </div>
                {isPro && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px',
                    fontSize: 13, color: '#7548f8', fontWeight: 700 }}>
                    <Crown size={13} /> Pro plan active
                  </div>
                )}
                <button onClick={() => signOut(() => router.push('/'))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, color: '#ee6b76', fontWeight: 600, borderRadius: 8,
                    fontFamily: 'DM Sans, sans-serif' }}>
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px 80px' }}>

        {/* Greeting + plan */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800,
              fontSize: 28, letterSpacing: '-0.05em', color: '#11131d', margin: 0 }}>
              Hey, {userName} 👋
            </h1>
            <p style={{ color: '#9099b2', fontSize: 14, margin: '6px 0 0' }}>
              {reports.length} {reports.length === 1 ? 'scan' : 'scans'} in your history
            </p>
          </div>

          {isPro ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              background: '#f7f3ff', border: '1px solid #e8e0ff',
              borderRadius: 12, padding: '9px 14px' }}>
              <Crown size={14} style={{ color: '#7548f8' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#7548f8' }}>Pro plan active</span>
            </div>
          ) : (
            <Link href="/api/checkout?plan=pro"
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                background: '#11131d', color: '#fff', padding: '9px 16px',
                borderRadius: 10, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
              Upgrade to Pro <ArrowRight size={12} />
            </Link>
          )}
        </div>

        {/* Scan form */}
        <form onSubmit={handleScan}
          style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
            <Globe size={15} style={{ position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', color: '#9099b2', pointerEvents: 'none' }} />
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Enter a URL to scan…"
              style={{ width: '100%', padding: '12px 14px 12px 36px', fontSize: 14,
                border: '1.5px solid #e8eaf1', borderRadius: 11, outline: 'none',
                fontFamily: 'DM Sans, sans-serif', background: '#fff',
                color: '#11131d', boxSizing: 'border-box' }}
            />
          </div>
          <button type="submit" disabled={scanning}
            style={{ background: 'linear-gradient(110deg, #8a46f8, #446af6 60%, #258de9)',
              color: '#fff', padding: '12px 22px', borderRadius: 11, border: 'none',
              fontSize: 14, fontWeight: 800, cursor: scanning ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, opacity: scanning ? 0.7 : 1,
              fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>
            {scanning ? 'Scanning…' : <><Search size={14} /> Scan website</>}
          </button>
        </form>

        {/* Reports list */}
        {reports.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e9eaf0',
            borderRadius: 18, padding: '56px 24px', textAlign: 'center',
            boxShadow: '0 4px 16px #1b1d3208' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16,
              background: '#f0ebff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 20px' }}>
              <Search size={22} style={{ color: '#7548f8' }} />
            </div>
            <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800,
              fontSize: 18, color: '#11131d', marginBottom: 8 }}>
              No scans yet
            </h3>
            <p style={{ color: '#9099b2', fontSize: 14, marginBottom: 0 }}>
              Enter a URL above to run your first scan.
            </p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e9eaf0',
            borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 4px 16px #1b1d3208' }}>
            {reports.map(report => (
              <ReportRow key={report.id} report={report} />
            ))}
          </div>
        )}
      </main>

      <style>{`
        .report-row:hover { background: #fafaff !important; }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
