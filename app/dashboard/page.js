import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserReports, getUserSubscription } from '@/lib/store';
import {
  ArrowRight, ExternalLink, Zap, Search, Shield, Eye,
  Plus, Crown
} from 'lucide-react';

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
          { label: 'Perf', icon: Zap,    val: s.performance },
          { label: 'SEO',  icon: Search, val: s.seo         },
          { label: 'Sec',  icon: Shield, val: s.security    },
          { label: 'A11y', icon: Eye,    val: s.accessibility },
        ].map(({ label, val }) => val != null
          ? <ScorePill key={label} score={val} />
          : null
        )}
      </div>

      <ArrowRight size={15} style={{ color: '#9099b2' }} />
    </Link>
  );
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Guard against DB tables not yet initialized
  const [reportsResult, subscriptionResult] = await Promise.allSettled([
    getUserReports(userId),
    getUserSubscription(userId),
  ]);
  const reports = reportsResult.status === 'fulfilled' ? reportsResult.value : [];
  const subscription = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
  if (reportsResult.status === 'rejected') {
    console.error('[Dashboard] DB error (reports):', reportsResult.reason?.message);
  }

  const isPro = !!subscription;

  return (
    <div style={{ background: '#fafaff', minHeight: '100vh',
      fontFamily: 'DM Sans, sans-serif' }}>

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: '#ffffffed',
        backdropFilter: 'blur(16px)', borderBottom: '1px solid #f0f0f4' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px',
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800,
            fontSize: 18, letterSpacing: '-0.06em', color: '#11131d', textDecoration: 'none' }}>
            cernly<span style={{ fontWeight: 600 }}>.ai</span>
          </Link>
          <Link href="/"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'linear-gradient(110deg, #8a46f8, #446af6 60%, #258de9)',
              color: '#fff', padding: '9px 16px', borderRadius: 10,
              fontSize: 13, fontWeight: 800, textDecoration: 'none',
              boxShadow: '0 4px 14px #6a58ec28' }}>
            <Plus size={13} /> New scan
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800,
              fontSize: 28, letterSpacing: '-0.05em', color: '#11131d', margin: 0 }}>
              Your reports
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
            <div style={{ background: '#fff', border: '1px solid #e8eaf1',
              borderRadius: 14, padding: '14px 18px', maxWidth: 260,
              boxShadow: '0 4px 16px #1b1d3208' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#11131d', marginBottom: 4 }}>
                Upgrade to Pro
              </div>
              <p style={{ fontSize: 12, color: '#9099b2', margin: '0 0 12px', lineHeight: 1.5 }}>
                Unlimited scans, trend tracking, and scheduled monitoring.
              </p>
              <Link href="/api/checkout?plan=pro"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, background: '#11131d', color: '#fff', borderRadius: 9,
                  padding: '9px 14px', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                Upgrade — $15/mo <ArrowRight size={11} />
              </Link>
            </div>
          )}
        </div>

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
            <p style={{ color: '#9099b2', fontSize: 14, marginBottom: 24 }}>
              Run your first website scan to see it here.
            </p>
            <Link href="/"
              style={{ background: 'linear-gradient(110deg, #8a46f8, #446af6 60%, #258de9)',
                color: '#fff', padding: '12px 24px', borderRadius: 11,
                fontWeight: 800, fontSize: 14, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                boxShadow: '0 8px 22px #6a58ec36' }}>
              Scan a website <ArrowRight size={13} />
            </Link>
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
      `}</style>
    </div>
  );
}
