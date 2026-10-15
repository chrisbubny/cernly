'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Zap, Shield, Search, BarChart2, Globe, CheckCircle2,
  ArrowRight, ChevronRight, Sparkles, Lock, Eye,
  AlertTriangle, TrendingUp, Code2
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function normalizeUrl(raw) {
    let u = raw.trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try { new URL(u); return u; } catch { return ''; }
  }

  async function handleAnalyze(e) {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) { setError('Please enter a valid website URL.'); return; }
    setError('');
    setLoading(true);
    const encoded = encodeURIComponent(normalized);
    router.push(`/analyze?url=${encoded}`);
  }

  return (
    <div className="min-h-screen" style={{ background: '#050B14' }}>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(5,11,20,0.85)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00D4AA,#A78BFA)' }}>
              <Eye size={14} color="#0a1020" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ color: '#E8EFF7' }}>cernly</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: '#A8B8CE' }}>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm px-4 py-2 rounded-lg transition-colors" style={{ color: '#A8B8CE' }}
              onMouseEnter={e => e.target.style.color='#E8EFF7'} onMouseLeave={e => e.target.style.color='#A8B8CE'}>
              Sign in
            </Link>
            <Link href="/sign-up" className="btn-brand text-sm px-4 py-2 rounded-lg">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden grid-bg">
        {/* Glow orbs */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(0,212,170,0.3) 0%, rgba(167,139,250,0.2) 50%, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="absolute top-10 right-10 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #A78BFA, transparent)', filter: 'blur(40px)' }} />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-sm border"
            style={{ background: 'rgba(0,212,170,0.08)', borderColor: 'rgba(0,212,170,0.2)', color: '#00D4AA' }}>
            <Sparkles size={13} />
            <span>AI-powered website intelligence</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-none" style={{ color: '#E8EFF7' }}>
            Know your website.
            <br />
            <span className="gradient-text">Improve what matters.</span>
          </h1>

          <p className="text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed" style={{ color: '#A8B8CE' }}>
            Cernly scans your website in seconds — speed, SEO, security, accessibility — then tells you exactly what to fix and why it matters.
          </p>

          {/* URL Form */}
          <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3 p-2 rounded-2xl border" style={{ background: 'rgba(13,21,38,0.6)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
              <div className="flex-1 flex items-center gap-3 px-4">
                <Globe size={16} style={{ color: '#8899B5', flexShrink: 0 }} />
                <input
                  type="text"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(''); }}
                  placeholder="yourwebsite.com"
                  className="w-full bg-transparent text-base py-3 focus:outline-none"
                  style={{ color: '#E8EFF7' }}
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="btn-brand px-7 py-3 rounded-xl font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>Analyze site <ArrowRight size={16} /></>
                )}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-center" style={{ color: '#FF5D5D' }}>{error}</p>}
            <p className="mt-4 text-sm" style={{ color: '#8899B5' }}>
              Free score summary · No account required to start
            </p>
          </form>
        </div>

        {/* Fake score preview */}
        <div className="relative max-w-3xl mx-auto mt-20">
          <div className="rounded-2xl border p-6 shadow-2xl" style={{ background: '#0D1526', borderColor: '#1A2740' }}>
            {/* Browser chrome */}
            <div className="flex items-center gap-2 mb-5 pb-4 border-b" style={{ borderColor: '#1A2740' }}>
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: '#FF5D5D' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#F5A623' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: '#00D4AA' }} />
              </div>
              <div className="flex-1 mx-4 px-3 py-1.5 rounded-lg text-xs font-mono" style={{ background: '#080C14', color: '#8899B5' }}>
                cernly.ai/analyze?url=yoursite.com
              </div>
            </div>

            {/* Score cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Performance', score: 74, color: '#F5A623' },
                { label: 'SEO', score: 88, color: '#00D4AA' },
                { label: 'Security', score: 91, color: '#00D4AA' },
                { label: 'Accessibility', score: 62, color: '#FF5D5D' },
              ].map(({ label, score, color }) => (
                <div key={label} className="rounded-xl p-4 text-center" style={{ background: '#080C14', border: '1px solid #1A2740' }}>
                  <div className="text-3xl font-black mb-1" style={{ color }}>{score}</div>
                  <div className="text-xs" style={{ color: '#8899B5' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* AI summary bar */}
            <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)' }}>
              <Sparkles size={16} style={{ color: '#00D4AA', marginTop: 2, flexShrink: 0 }} />
              <p className="text-sm leading-relaxed" style={{ color: '#A8B8CE' }}>
                <span style={{ color: '#00D4AA', fontWeight: 600 }}>AI Summary:</span> Your site has strong SEO foundations but accessibility issues are costing you users — and potentially search rankings. 3 critical fixes could improve your score by 24 points.
              </p>
            </div>
          </div>
          {/* Blur fade at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-16 rounded-b-2xl pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, #050B14)' }} />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#E8EFF7' }}>
              Everything that affects your website's performance
            </h2>
            <p className="text-lg" style={{ color: '#8899B5' }}>One scan. Complete picture.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Zap,
                title: 'Page Speed',
                desc: 'Mobile & desktop Lighthouse scores, Core Web Vitals (LCP, CLS, FID), load time breakdown — with fixes ranked by impact.',
                color: '#F5A623',
              },
              {
                icon: Search,
                title: 'SEO Audit',
                desc: 'Title tags, meta descriptions, heading structure, schema markup, Open Graph, sitemap, robots.txt — 40+ checks.',
                color: '#00D4AA',
              },
              {
                icon: Shield,
                title: 'Security',
                desc: 'SSL certificate health, security headers (HSTS, CSP, X-Frame), mixed content, vulnerability signals.',
                color: '#A78BFA',
              },
              {
                icon: Eye,
                title: 'Accessibility',
                desc: 'WCAG compliance checks, alt text coverage, contrast ratios, keyboard navigation, ARIA labels.',
                color: '#00D4AA',
              },
              {
                icon: Code2,
                title: 'Tech Stack',
                desc: 'Detect CMS, frameworks, analytics tools, tag managers, CDN, hosting, and third-party scripts.',
                color: '#F5A623',
              },
              {
                icon: Sparkles,
                title: 'AI Recommendations',
                desc: 'Claude analyzes your results and explains what to fix first, why it matters, and the expected impact — in plain English.',
                color: '#A78BFA',
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="card-hover rounded-2xl p-6 border" style={{ background: '#0D1526', borderColor: '#1A2740' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}18` }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <h3 className="font-semibold mb-2" style={{ color: '#E8EFF7' }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#8899B5' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6" style={{ background: '#080C14' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#E8EFF7' }}>How it works</h2>
            <p style={{ color: '#8899B5' }}>From URL to actionable insights in under 60 seconds.</p>
          </div>

          <div className="space-y-4">
            {[
              { step: '01', title: 'Enter your URL', desc: 'Type any website address. No account required to see your free score summary.' },
              { step: '02', title: 'We scan everything', desc: 'Cernly runs PageSpeed, SEO, security, and accessibility checks simultaneously — real data, not estimates.' },
              { step: '03', title: 'AI interprets your results', desc: 'Claude analyzes the data and writes a plain-English summary explaining what matters most for your specific site.' },
              { step: '04', title: 'Get a full action plan', desc: 'Unlock a detailed report with prioritized fixes, expected impact, and step-by-step guidance for $4.99 — or subscribe for ongoing monitoring.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-6 p-6 rounded-2xl border" style={{ background: '#0D1526', borderColor: '#1A2740' }}>
                <div className="text-2xl font-black flex-shrink-0 gradient-text">{step}</div>
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: '#E8EFF7' }}>{title}</h3>
                  <p className="text-sm" style={{ color: '#8899B5' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#E8EFF7' }}>Simple pricing</h2>
            <p style={{ color: '#8899B5' }}>Start free. Pay only when you need more.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="rounded-2xl p-6 border" style={{ background: '#0D1526', borderColor: '#1A2740' }}>
              <div className="mb-6">
                <div className="text-sm font-medium mb-2" style={{ color: '#8899B5' }}>Free</div>
                <div className="text-4xl font-black mb-1" style={{ color: '#E8EFF7' }}>$0</div>
                <div className="text-sm" style={{ color: '#8899B5' }}>No account required</div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Score summary (4 categories)',
                  'AI overview paragraph',
                  'Pass/fail indicators',
                  'Unlimited scans',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: '#A8B8CE' }}>
                    <CheckCircle2 size={14} style={{ color: '#00D4AA', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button className="w-full py-3 rounded-xl font-semibold text-sm transition-colors border"
                style={{ borderColor: '#1A2740', color: '#A8B8CE', background: 'transparent' }}
                onClick={() => document.getElementById('hero-input')?.focus()}>
                Start analyzing
              </button>
            </div>

            {/* One-time Report — featured */}
            <div className="rounded-2xl p-6 border relative" style={{ background: '#0D1526', borderColor: 'rgba(0,212,170,0.4)', boxShadow: '0 0 40px rgba(0,212,170,0.1)' }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'linear-gradient(135deg,#00D4AA,#A78BFA)', color: '#0a1020' }}>
                Most popular
              </div>
              <div className="mb-6">
                <div className="text-sm font-medium mb-2" style={{ color: '#00D4AA' }}>Full Report</div>
                <div className="text-4xl font-black mb-1" style={{ color: '#E8EFF7' }}>$4.99</div>
                <div className="text-sm" style={{ color: '#8899B5' }}>One-time, per report</div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Everything in Free',
                  'Detailed issue breakdown',
                  'Fix-by-fix recommendations',
                  'Competitor comparison',
                  'Priority scores per issue',
                  'Shareable PDF report',
                  'AI action plan',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: '#A8B8CE' }}>
                    <CheckCircle2 size={14} style={{ color: '#00D4AA', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button className="btn-brand w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
                Get full report <ArrowRight size={14} />
              </button>
            </div>

            {/* Subscription */}
            <div className="rounded-2xl p-6 border" style={{ background: '#0D1526', borderColor: '#1A2740' }}>
              <div className="mb-6">
                <div className="text-sm font-medium mb-2" style={{ color: '#A78BFA' }}>Pro</div>
                <div className="text-4xl font-black mb-1" style={{ color: '#E8EFF7' }}>$15<span className="text-lg font-normal" style={{ color: '#8899B5' }}>/mo</span></div>
                <div className="text-sm" style={{ color: '#8899B5' }}>Per site, cancel anytime</div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Everything in Full Report',
                  'Weekly automated scans',
                  'Score trend tracking',
                  'Issue regression alerts',
                  'Multi-page analysis',
                  'White-label PDF reports',
                  'Priority support',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: '#A8B8CE' }}>
                    <CheckCircle2 size={14} style={{ color: '#A78BFA', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button className="w-full py-3 rounded-xl font-semibold text-sm transition-all border"
                style={{ borderColor: 'rgba(167,139,250,0.3)', color: '#A78BFA', background: 'rgba(167,139,250,0.06)' }}>
                Start free trial
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6" style={{ background: '#080C14' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#E8EFF7' }}>
            Your website deserves a real diagnosis.
          </h2>
          <p className="mb-10 text-lg" style={{ color: '#8899B5' }}>
            Enter any URL and see your scores in under 60 seconds — free.
          </p>
          <form onSubmit={handleAnalyze} className="max-w-xl mx-auto flex gap-3">
            <input
              id="hero-input"
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="yourwebsite.com"
              className="url-input flex-1 px-5 py-3.5 rounded-xl text-sm"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !url.trim()}
              className="btn-brand px-6 py-3.5 rounded-xl font-semibold text-sm whitespace-nowrap disabled:opacity-40 flex items-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><Zap size={14} /> Analyze</>}
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 px-6" style={{ borderColor: '#1A2740' }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00D4AA,#A78BFA)' }}>
              <Eye size={12} color="#0a1020" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm" style={{ color: '#E8EFF7' }}>cernly</span>
          </div>
          <div className="flex gap-6 text-sm" style={{ color: '#8899B5' }}>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
            <a href="mailto:hello@cernly.ai" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="text-xs" style={{ color: '#8899B5' }}>
            © {new Date().getFullYear()} Cernly. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
