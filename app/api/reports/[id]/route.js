import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { deleteReport, setReportPublic } from '@/lib/store';

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

// PATCH /api/reports/[id]
// Body: { isPublic: boolean }
// Toggles the is_public flag on a report owned by the current user
export async function PATCH(request, { params }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Report ID required' }, { status: 400 });
    }

    let body = {};
    try { body = await request.json(); } catch {}
    const isPublic = !!body.isPublic;

    const updated = await setReportPublic(id, userId, isPublic);
    if (!updated) {
      return NextResponse.json({ error: 'Report not found or not owned by you' }, { status: 404 });
    }

    return NextResponse.json({ success: true, isPublic: updated.is_public });
  } catch (err) {
    console.error('[PATCH report]', err.message);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}
