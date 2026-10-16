import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { deleteReport } from '@/lib/store';

// DELETE /api/reports/[id]
// Deletes the report if it belongs to the current user
export async function DELETE(request, { params }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Report ID required' }, { status: 400 });
    }

    const deleted = await deleteReport(id, userId);
    if (!deleted) {
      return NextResponse.json({ error: 'Report not found or not owned by you' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE report]', err.message);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}
