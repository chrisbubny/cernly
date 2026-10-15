'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Zap, Search, Shield, Eye, Sparkles, CheckCircle2,
  XCircle, AlertCircle, ExternalLink, ArrowLeft,
  ChevronDown, ChevronUp, Share2, Download, RefreshCw
} from 'lucide-react';

// ── Shared helpers ─────────────────────────────────────────────────────────

function ScoreRing({ score, size = 80 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? '#1cb985' : score >= 60 ? '#e8a147' : '#ee6b76';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="#f0f0f7" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.22} fontWeight="800"
        fontFamily="Manrope, sans-serif">
        {score}
      </text>
    </svg>
  );
}

function ScoreLabel({ score }) {
  if (score >= 80) return <span style={{ color: '#1cb985', fontWeight: 700 }}>Good</span>;
  if (score >= 60) return <span style={{ color: '#e8a147', fontWeight: 700 }}>Needs work</span>;
  return <span style={{ color: '#ee6b76', fontWeight: 700 }}>Poor</span>;
}

function SeverityBadge({ severity }) {
  const map = {
    critical: { bg: '#fff0f0', color: '#c0392b', label: 'Critical' },
    warning:  { bg: '#fff8ed', color: '#c87535', label: 'Warning' },
    info:     { bg: '#f0f4ff', color: '#4a6fa5', label: 'Info' },
    good:     { bg: '#eaf8f2', color: '#19946a', label: 'Passed' },
  };
  const s = map[severity] || map.info;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 800,
      padding: '3px 8px', borderRadius: 6 }}>
      {s.label}
    </span>
  );
}

function IssueRow({ issue }) {
  const [open, setOpen] = useState(false);
  const sev = issue.severity || 'info';
  const iconColor = { critical: '#ee6b76', warning: '#e8a147', info: '#9099b2', good: '#1cb985' };
  const Icon = sev === 'good' ? CheckCircle2 : sev === 'critical' ? XCircle : AlertCircle;
  const hasDetail = issue.detail || issue.fix;

  return (
    <div style={{ borderBottom: '1px solid #f0f0f7' }}>
      <button onClick={() => hasDetail && setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 0, textAlign: 'left',
          padding: '14px 0', display: 'flex', alignItems: 'flex-start', gap: 12,
          cursor: hasDetail ? 'pointer' : 'default' }}>
        <Icon size={15} style={{ color: iconColor[sev], marginTop: 1, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#11131d',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{issue.message}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <SeverityBadge severity={sev} />
              {hasDetail && (open
                ? <ChevronUp size={14} style={{ color: '#9099b2' }} />
                : <ChevronDown size={14} style={{ color: '#9099b2' }} />)}
            </div>
          </div>
          {issue.area && (
            <div style={{ fontSize: 11, color: '#9099b2', marginTop: 3 }}>{issue.area}</div>
          )}
        </div>
      </button>

      {open && hasDetail && (
        <div style={{ paddingBottom: 16, paddingLeft: 27 }}>
          {issue.detail && (
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, margin: '0 0 10px' }}>
              {issue.detail}
            </p>
          )}
          {issue.fix && (
            <div style={{ background: '#f7f3ff', border: '1px solid #e8e0ff',
              borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#7548f8',
                marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                How to fix
              </div>
              <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.6 }}>{issue.fix}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, score, issues = [], accent }) {
  const [collapsed, setCollapsed] = useState(false);
  const counts = issues.reduce((acc, i) => {
    acc[i.severity || 'info'] = (acc[i.severity || 'info'] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ border: '1px solid #e9eaf0', borderRadius: 18,
      overflow: 'hidden', marginBottom: 16 }}>
      <button onClick={() => setCollapsed(c => !c)}
        style={{ width: '100%', background: '#fafaff', border: 0,
          padding: '18px 22px', display: 'flex', alignItems: 'center',
          gap: 14, cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: accent + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#11131d',
              fontFamily: 'Manrope, sans-serif' }}>{title}</span>
            {score != null && <ScoreLabel score={score} />}
          </div>
          <div style={{ fontSize: 12, color: '#9099b2', marginTop: 2, display: 'flex', gap: 10 }}>
            {counts.critical > 0 && <span>{counts.critical} critical</span>}
            {counts.warning > 0 && <span>{counts.warning} warnings</span>}
            {counts.good > 0 && <span>{counts.good} passed</span>}
            {issues.length === 0 && <span>No issues</span>}
          </div>
        </div>
        <ScoreRing score={score ?? 0} size={52} />
        {collapsed
          ? <ChevronDown size={16} style={{ color: '#9099b2' }} />
          : <ChevronUp size={16} style={{ color: '#9099b2' }} />}
      </button>

      {!collapsed && (
        <div style={{ padding: '0 22px' }}>
          {issues.length === 0
            ? <p style={{ fontSize: 13, color: '#9099b2', padding: '16px 0' }}>
                No issues detected.
              </p>
            : issues.map((issue, i) => <IssueRow key={i} issue={issue} />)
          }
        </div>
      )}
    </div>
  );
}

// ── Priority action plan ───────────────────────────────────────────────────

function PriorityItem({ n, title, detail, tag }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto',
      alignItems: 'start', gap: 14, padding: '16px 0',
      borderBottom: '1px solid #f0f0f7' }}>
      <div style={{ width: 28, height: 28, background: '#f0ebff', color: '#7548f8',
        borderRadius: 9, display: 'grid', placeItems: 'center',
        fontSize: 12, fontWeight: 800 }}>{n}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#11131d' }}>{title}</div>
        {detail && <div style={{ fontSize: 12, color: '#6f7280', marginTop: 4, lineHeight: 1.6 }}>{detail}</div>}
      </div>
      {tag && (
        <span style={{ fontSize: 10, fontWeight: 800, background: '#f2eeff',
          color: '#7855df', padding: '5px 9px', borderRadius: 7, whiteSpace: 'nowrap' }}>
          {tag}
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ReportPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ id });
    if (sessionId) params.set('session_id', sessionId);

    fetch(`/api/report?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setStatus('error'); return; }
        setReport(d);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [id, sessionId]);

  function handleCopy() {
    navigator.clipboard.writeText(window.location.origin + '/report/' + id)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  const domain = (() => {
    try { return new URL(report?.url || '').hostname; } catch { return report?.url || ''; }
  })();

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: '3px solid #f0f0f7',
            borderTopColor: '#7548f8', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            margin: '0 auto 16px' }} />
          <p style={{ color: '#9099b2', fontSize: 14 }}>Loading report…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#fff', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <AlertCircle size={40} style={{ color: '#ee6b76', margin: '0 auto 16px' }} />
          <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800,
            fontSize: 22, color: '#11131d', marginBottom: 8 }}>Report not found</h2>
          <p style={{ color: '#9099b2', fontSize: 14, marginBottom: 24 }}>
            This report may have expired or the link is invalid.
          </p>
          <Link href="/" style={{ background: '#7548f8', color: '#fff',
            padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14,
            display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ArrowLeft size={14} /> Run a new scan
          </Link>
        </div>
      </div>
    );
  }

  // ── Bucket issues by category ────────────────────────────────────────────
  const byCategory = (cat) =>
    (report.issues || []).filter(i => i.area?.toLowerCase().startsWith(cat));

  const categories = [
    { key: 'perf',   title: 'Performance', icon: Zap,    score: report.scores?.performance, accent: '#7548f8' },
    { key: 'seo',    title: 'SEO',          icon: Search, score: report.scores?.seo,         accent: '#3389ff' },
    { key: 'sec',    title: 'Security',     icon: Shield, score: report.scores?.security,    accent: '#1cb985' },
    { key: 'a11y',   title: 'Accessibility',icon: Eye,    score: report.scores?.accessibility,accent: '#41c9eb' },
  ];

  // Build a priority list: top criticals first, then warnings, max 5
  const priorities = (report.issues || [])
    .filter(i => i.severity === 'critical' || i.severity === 'warning')
    .slice(0, 5);

  const createdAt = report.createdAt
    ? new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ background: '#fafaff', minHeight: '100vh',
      fontFamily: 'DM Sans, sans-serif' }}>

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: '#ffffffed',
        backdropFilter: 'blur(16px)', borderBottom: '1px solid #f0f0f4' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px',
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}>
            <ArrowLeft size={16} style={{ color: '#9099b2' }} />
            <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800,
              fontSize: 18, letterSpacing: '-0.06em', color: '#11131d' }}>
              cernly<span style={{ fontWeight: 600 }}>.ai</span>
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href={report.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                color: '#6f7280', textDecoration: 'none' }}>
              <span style={{ fontWeight: 600 }}>{domain}</span>
              <ExternalLink size={12} />
            </a>
            <button onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                fontWeight: 700, background: copied ? '#eaf8f2' : '#f0ebff',
                color: copied ? '#19946a' : '#7548f8', border: 0, borderRadius: 9,
                padding: '8px 14px', cursor: 'pointer', transition: 'all .2s' }}>
              <Share2 size={13} />
              {copied ? 'Copied!' : 'Share'}
            </button>
            <Link href={`/analyze?url=${encodeURIComponent(report.url)}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                fontWeight: 700, background: '#11131d', color: '#fff', borderRadius: 9,
                padding: '8px 14px', textDecoration: 'none' }}>
              <RefreshCw size={12} /> Re-scan
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: '#7548f8' }}>Website Report</span>
            {createdAt && (
              <span style={{ fontSize: 11, color: '#9099b2' }}>· {createdAt}</span>
            )}
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800,
            fontSize: 'clamp(24px, 4vw, 34px)', letterSpacing: '-0.05em',
            color: '#11131d', margin: 0 }}>
            {domain}
          </h1>
        </div>

        {/* Score grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12, marginBottom: 28 }}>
          {categories.map(({ key, title, icon: Icon, score, accent }) => (
            <div key={key} style={{ background: '#fff', border: '1px solid #e9eaf0',
              borderRadius: 18, padding: '20px 12px', textAlign: 'center',
              boxShadow: '0 4px 16px #1b1d3208' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: accent + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px' }}>
                <Icon size={16} style={{ color: accent }} />
              </div>
              <ScoreRing score={score ?? 0} size={64} />
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6f7280', marginTop: 8 }}>{title}</div>
            </div>
          ))}
        </div>

        {/* AI Summary */}
        <div style={{ background: 'linear-gradient(110deg, #f7f3ff, #f0f7ff)',
          border: '1px solid #eae5ff', borderRadius: 18, padding: '22px 24px',
          marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles size={15} style={{ color: '#7548f8' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#7548f8' }}>Cernly's take</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: '#444', margin: 0 }}>
            {report.aiSummary || 'AI analysis not available for this report.'}
          </p>
        </div>

        {/* Priority action plan */}
        {priorities.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e9eaf0', borderRadius: 18,
            padding: '22px 24px', marginBottom: 28,
            boxShadow: '0 4px 16px #1b1d3208' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Sparkles size={14} style={{ color: '#7548f8' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#11131d' }}>
                Your action plan
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#9099b2', margin: '0 0 16px' }}>
              Start with these — highest impact for your scores.
            </p>
            {priorities.map((issue, i) => (
              <PriorityItem
                key={i}
                n={i + 1}
                title={issue.message}
                detail={issue.fix || issue.detail}
                tag={i === 0 ? 'Start here' : i < 3 ? 'Next' : null}
              />
            ))}
          </div>
        )}

        {/* Detailed sections */}
        <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 18,
          letterSpacing: '-0.04em', color: '#11131d', margin: '0 0 16px' }}>
          Detailed findings
        </h2>
        {categories.map(({ key, title, icon, score, accent }) => (
          <Section
            key={key}
            title={title}
            icon={icon}
            score={score}
            issues={(report.issues || []).filter(i =>
              i.area?.toLowerCase().includes(key === 'perf' ? 'perf' :
              key === 'a11y' ? 'access' : key)
            )}
            accent={accent}
          />
        ))}

        {/* Re-scan CTA */}
        <div style={{ marginTop: 32, background: '#10121b', borderRadius: 20,
          padding: '32px 28px', textAlign: 'center', color: '#fff' }}>
          <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20,
            letterSpacing: '-0.04em', marginBottom: 8 }}>
            Fixed something? Re-scan to check.
          </h3>
          <p style={{ color: '#a5a9ba', fontSize: 14, marginBottom: 20 }}>
            Run another audit to see how your changes moved the needle.
          </p>
          <Link href={`/analyze?url=${encodeURIComponent(report.url)}`}
            style={{ background: 'linear-gradient(110deg, #8a46f8, #446af6 60%, #258de9)',
              color: '#fff', padding: '13px 28px', borderRadius: 11, fontWeight: 800,
              fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8,
              textDecoration: 'none', boxShadow: '0 8px 22px #6a58ec36' }}>
            <RefreshCw size={14} /> Re-scan {domain}
          </Link>
        </div>
      </main>
    </div>
  );
}
