'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Eye, ArrowLeft, Zap, Search, Shield, AlertCircle,
  CheckCircle2, XCircle, Sparkles, ExternalLink, Lock, ArrowRight
} from 'lucide-react';

function ScoreRing({ score, size = 80 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 80 ? '#00D4AA' : score >= 60 ? '#F5A623' : '#FF5D5D';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.22} fontWeight="800" fontFamily="Inter, sans-serif">
        {score}
      </text>
    </svg>
  );
}

function AnalyzeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('loading'); // loading | results | error
  const [loadingStep, setLoadingStep] = useState(0);

  const steps = [
    'Fetching page…',
    'Running PageSpeed analysis…',
    'Auditing SEO signals…',
    'Checking security headers…',
    'Scanning accessibility…',
    'Generating AI insights…',
  ];

  useEffect(() => {
    if (!url) { router.push('/'); return; }

    let stepTimer;
    let step = 0;
    setLoadingStep(0);
    stepTimer = setInterval(() => {
      step++;
      if (step < steps.length) setLoadingStep(step);
    }, 2200);

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(r => r.json())
      .then(d => {
        clearInterval(stepTimer);
        if (d.error) { setError(d.error); setPhase('error'); }
        else { setData(d); setPhase('results'); }
      })
      .catch(e => {
        clearInterval(stepTimer);
        setError('Something went wrong. Please try again.');
        setPhase('error');
      });

    return () => clearInterval(stepTimer);
  }, [url]);

  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  // ── Loading ──────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#050B14' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
          style={{ background: 'linear-gradient(135deg,#00D4AA,#A78BFA)' }}>
          <Eye size={28} color="#0a1020" />
        </div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: '#E8EFF7' }}>Analyzing {domain}</h2>
        <p className="text-sm mb-10 h-5 transition-all" style={{ color: '#8899B5' }}>{steps[loadingStep]}</p>

        {/* Progress dots */}
        <div className="flex gap-2">
          {steps.map((_, i) => (
            <div key={i} className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: i <= loadingStep ? 24 : 8,
                background: i <= loadingStep ? 'linear-gradient(90deg,#00D4AA,#A78BFA)' : 'rgba(255,255,255,0.1)',
              }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#050B14' }}>
        <AlertCircle size={48} style={{ color: '#FF5D5D' }} className="mb-4" />
        <h2 className="text-xl font-semibold mb-2" style={{ color: '#E8EFF7' }}>Analysis failed</h2>
        <p className="text-sm mb-8" style={{ color: '#8899B5' }}>{error}</p>
        <Link href="/" className="btn-brand px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2">
          <ArrowLeft size={14} /> Try another URL
        </Link>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────
  const { scores, aiSummary, issues, reportId } = data;
  const categories = [
    { key: 'performance', label: 'Performance', icon: Zap },
    { key: 'seo', label: 'SEO', icon: Search },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'accessibility', label: 'Accessibility', icon: Eye },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#050B14' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(5,11,20,0.9)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00D4AA,#A78BFA)' }}>
              <Eye size={12} color="#0a1020" strokeWidth={2.5} />
            </div>
            <span className="font-bold" style={{ color: '#E8EFF7' }}>cernly</span>
          </Link>
          <div className="flex items-center gap-2 text-sm" style={{ color: '#8899B5' }}>
            <Globe2 size={13} />
            <span className="font-mono">{domain}</span>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Score grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {categories.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-2xl p-5 text-center border card-hover" style={{ background: '#0D1526', borderColor: '#1A2740' }}>
              <div className="flex justify-center mb-3">
                <ScoreRing score={scores[key] ?? 0} size={72} />
              </div>
              <div className="flex items-center justify-center gap-1.5 text-sm" style={{ color: '#A8B8CE' }}>
                <Icon size={12} />
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* AI Summary */}
        <div className="rounded-2xl p-6 mb-8 border" style={{ background: 'rgba(0,212,170,0.05)', borderColor: 'rgba(0,212,170,0.2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={15} style={{ color: '#00D4AA' }} />
            <span className="text-sm font-semibold" style={{ color: '#00D4AA' }}>AI Analysis</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: '#C8D5E6' }}>{aiSummary}</p>
        </div>

        {/* Free issues preview (blurred after 3) */}
        <div className="mb-8">
          <h3 className="font-semibold mb-4" style={{ color: '#E8EFF7' }}>Issues found</h3>
          <div className="space-y-3">
            {issues.slice(0, 3).map((issue, i) => (
              <IssueRow key={i} issue={issue} />
            ))}
          </div>

          {/* Locked issues */}
          {issues.length > 3 && (
            <div className="relative mt-3">
              <div className="space-y-3 opacity-30 pointer-events-none select-none" style={{ filter: 'blur(3px)' }}>
                {issues.slice(3, 7).map((issue, i) => (
                  <IssueRow key={i} issue={issue} />
                ))}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="rounded-2xl p-6 text-center border" style={{ background: '#0D1526', borderColor: 'rgba(0,212,170,0.3)', maxWidth: 360 }}>
                  <Lock size={20} style={{ color: '#00D4AA', margin: '0 auto 12px' }} />
                  <div className="font-semibold mb-1" style={{ color: '#E8EFF7' }}>
                    {issues.length - 3} more issues found
                  </div>
                  <div className="text-sm mb-5" style={{ color: '#8899B5' }}>
                    Get the full breakdown with fixes, priorities, and an AI action plan.
                  </div>
                  <Link href={`/checkout?reportId=${reportId}`} className="btn-brand px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                    Unlock full report — $4.99 <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Upgrade CTA */}
        <div className="rounded-2xl p-8 text-center border" style={{ background: '#0D1526', borderColor: 'rgba(0,212,170,0.2)' }}>
          <h3 className="text-xl font-bold mb-2" style={{ color: '#E8EFF7' }}>Ready to fix what's holding your site back?</h3>
          <p className="text-sm mb-6" style={{ color: '#8899B5' }}>Get the full report with prioritized fixes, detailed AI recommendations, and a shareable PDF.</p>
          <Link href={`/checkout?reportId=${reportId}`} className="btn-brand inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold">
            Get full report — $4.99 <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function IssueRow({ issue }) {
  const sev = issue.severity || 'warning';
  const colors = { critical: '#FF5D5D', warning: '#F5A623', info: '#8899B5', good: '#00D4AA' };
  const icons = {
    critical: <XCircle size={14} style={{ color: colors.critical }} />,
    warning: <AlertCircle size={14} style={{ color: colors.warning }} />,
    info: <AlertCircle size={14} style={{ color: colors.info }} />,
    good: <CheckCircle2 size={14} style={{ color: colors.good }} />,
  };

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border" style={{ background: '#0D1526', borderColor: '#1A2740' }}>
      <div className="mt-0.5">{icons[sev]}</div>
      <div>
        <div className="text-sm font-medium mb-0.5" style={{ color: '#C8D5E6' }}>{issue.message}</div>
        {issue.area && <div className="text-xs" style={{ color: '#8899B5' }}>{issue.area}</div>}
      </div>
    </div>
  );
}

// Workaround for Globe2 not in older lucide
function Globe2({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
}

export default function AnalyzePage() {
  return (
    <Suspense>
      <AnalyzeContent />
    </Suspense>
  );
}
