import { Suspense } from 'react';
import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserReports, getUserSubscription } from '@/lib/store';
import DashboardClient from './DashboardClient';

async function DashboardData() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const [reportsResult, subscriptionResult, user] = await Promise.allSettled([
    getUserReports(userId),
    getUserSubscription(userId),
    currentUser(),
  ]);

  const reports = reportsResult.status === 'fulfilled' ? reportsResult.value : [];
  const subscription = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
  const clerkUser = user.status === 'fulfilled' ? user.value : null;

  if (reportsResult.status === 'rejected') {
    console.error('[Dashboard] DB error (reports):', reportsResult.reason?.message);
  }

  return (
    <DashboardClient
      reports={reports}
      isPro={!!subscription}
      userName={clerkUser?.firstName || clerkUser?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'there'}
      userAvatar={clerkUser?.imageUrl || null}
      userEmail={clerkUser?.emailAddresses?.[0]?.emailAddress || ''}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#f8f9fd', display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: '#83899c', fontSize: 13 }}>
        Loading…
      </div>
    }>
      <DashboardData />
    </Suspense>
  );
}
