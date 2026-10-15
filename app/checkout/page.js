'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('reportId');
  const [status, setStatus] = useState('idle'); // idle | loading | error

  useEffect(() => {
    if (!reportId) return;

    setStatus('loading');
    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.url) {
          window.location.href = d.url; // redirect to Stripe
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [reportId]);

  if (!reportId) {
    return (
      <div style={styles.center}>
        <AlertCircle size={40} style={{ color: '#ee6b76', marginBottom: 16 }} />
        <h2 style={styles.title}>Missing report ID</h2>
        <p style={styles.sub}>Start by scanning your website first.</p>
        <Link href="/" style={styles.btn}>Go back home</Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={styles.center}>
        <AlertCircle size={40} style={{ color: '#ee6b76', marginBottom: 16 }} />
        <h2 style={styles.title}>Checkout failed</h2>
        <p style={styles.sub}>Something went wrong starting your checkout. Please try again.</p>
        <button onClick={() => { setStatus('idle'); }} style={styles.btn}>Retry</button>
        <Link href="/" style={{ ...styles.btn, background: '#f0f0f7', color: '#444', marginLeft: 10 }}>
          Cancel
        </Link>
      </div>
    );
  }

  // Loading / redirecting to Stripe
  return (
    <div style={styles.center}>
      <div style={styles.card}>
        <div style={{ width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(130deg, #824cf8, #3b89fb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: '0 9px 23px #6755e92b' }}>
          <Sparkles size={22} color="#fff" />
        </div>
        <h2 style={{ ...styles.title, marginBottom: 8 }}>Full Website Report</h2>
        <div style={{ fontSize: 36, fontFamily: 'Manrope, sans-serif', fontWeight: 800,
          letterSpacing: '-0.06em', color: '#11131d', margin: '0 0 4px' }}>
          $4.99
        </div>
        <p style={{ ...styles.sub, marginBottom: 24 }}>One-time · No subscription</p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px',
          textAlign: 'left', display: 'grid', gap: 12, fontSize: 13, color: '#555' }}>
          {[
            'All issues with detailed explanations',
            'Prioritized AI action plan',
            'How-to-fix guidance per issue',
            'Shareable report link',
            'Re-scan to track progress',
          ].map(item => (
            <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <CheckCircle2 size={15} style={{ color: '#1cb985', flexShrink: 0 }} />
              {item}
            </li>
          ))}
        </ul>

        {status === 'loading' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, fontSize: 14, color: '#7548f8', fontWeight: 700 }}>
            <div style={{ width: 18, height: 18, border: '2px solid #e8e0ff',
              borderTopColor: '#7548f8', borderRadius: '50%',
              animation: 'spin 0.7s linear infinite' }} />
            Redirecting to checkout…
          </div>
        ) : (
          <button
            onClick={() => setStatus('loading')}
            style={{ width: '100%', background: 'linear-gradient(110deg, #8a46f8, #446af6 60%, #258de9)',
              color: '#fff', border: 0, borderRadius: 11, padding: '14px',
              fontSize: 15, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 8px 22px #6a58ec36' }}>
            Continue to payment →
          </button>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: '#9099b2', textAlign: 'center' }}>
          Secured by Stripe · No card stored
        </div>

        <Link href={reportId ? `/analyze?reportId=${reportId}` : '/'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, marginTop: 14, fontSize: 13, color: '#9099b2', textDecoration: 'none' }}>
          <ArrowLeft size={12} /> Back to preview
        </Link>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

const styles = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fafaff',
    padding: '0 20px',
    textAlign: 'center',
    fontFamily: 'DM Sans, sans-serif',
  },
  card: {
    background: '#fff',
    border: '1px solid #e8eaf1',
    borderRadius: 22,
    padding: '36px 32px',
    maxWidth: 400,
    width: '100%',
    boxShadow: '0 20px 60px #1b1d3210',
  },
  title: {
    fontFamily: 'Manrope, sans-serif',
    fontWeight: 800,
    fontSize: 22,
    color: '#11131d',
    letterSpacing: '-0.05em',
    margin: 0,
  },
  sub: {
    fontSize: 14,
    color: '#9099b2',
    margin: 0,
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#7548f8',
    color: '#fff',
    padding: '12px 22px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    border: 0,
    cursor: 'pointer',
    marginTop: 20,
  },
};

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutContent />
    </Suspense>
  );
}
