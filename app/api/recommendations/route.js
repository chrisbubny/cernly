import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRecommendationsByUser } from '@/lib/store';

// GET /api/recommendations
// Returns the current user's deduplicated, prioritized recommendations.
export async function GET() {
  let userId = null;
  try { const { userId: uid } = await auth(); userId = uid || null; } catch {}
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const recommendations = await getRecommendationsByUser(userId, 20).catch(() => []);
  return NextResponse.json({ recommendations });
}
