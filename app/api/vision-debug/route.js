import { NextResponse } from 'next/server';

// Disabled: diagnostics must never expose report data or use API credentials
// through a public HTTP endpoint. Keep a deterministic response for old links.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
