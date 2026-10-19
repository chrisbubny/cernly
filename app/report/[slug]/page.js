import { auth, currentUser } from '@clerk/nextjs/server';
import { getUserSubscription } from '@/lib/store';
import ReportClient from './ReportClient';

export default async function ReportPage() {
  const { userId } = await auth();

  let isPro = false;
  let userName = 'User';
  let userAvatar = null;
  let userEmail = '';

  if (userId) {
    const [subResult, userResult] = await Promise.allSettled([
      getUserSubscription(userId),
      currentUser(),
    ]);

    if (subResult.status === 'fulfilled' && subResult.value) {
      isPro = subResult.value.plan === 'pro';
    }

    if (userResult.status === 'fulfilled' && userResult.value) {
      const u = userResult.value;
      userName =
        u.firstName ||
        u.username ||
        u.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
        'User';
      userAvatar = u.imageUrl || null;
      userEmail = u.emailAddresses?.[0]?.emailAddress || '';
    }
  }

  return (
    <ReportClient
      isPro={isPro}
      userName={userName}
      userAvatar={userAvatar}
      userEmail={userEmail}
    />
  );
}
