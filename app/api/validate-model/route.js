import { NextResponse } from 'next/server';

// GET /api/validate-model
// Validates that claude-haiku-5-5 is accepted by the configured Anthropic API key.
// This route is intentionally simple — call it once, then delete the file.
export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json();

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        model: data.model,
        response: data.content?.[0]?.text,
        status: res.status,
      });
    }

    return NextResponse.json({
      ok: false,
      status: res.status,
      error: data.error?.message || JSON.stringify(data),
      errorType: data.error?.type,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
