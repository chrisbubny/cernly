import { NextResponse } from 'next/server';
import { getReport } from '@/lib/store';

// GET /api/vision-debug?reportId=XXX
// Diagnostic endpoint — tests each step of the vision pipeline in isolation.
// Remove this file before any public launch.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get('reportId');
  const results = { timestamp: new Date().toISOString() };

  // ── 1. API key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  results.step1_apiKey = {
    present: !!apiKey,
    prefix: apiKey ? apiKey.slice(0, 12) + '…' : null,
  };

  // ── 2. Report / lhData ───────────────────────────────────────────────────────
  if (reportId) {
    try {
      const report = await getReport(reportId);
      if (!report) {
        results.step2_report = { found: false };
      } else {
        const sd = report.lhData?.screenshotDataUrl || null;
        results.step2_report = {
          found: true,
          url: report.url,
          hasUxAnnotations: !!report.uxAnnotations,
          lhDataKeys: report.lhData ? Object.keys(report.lhData) : null,
          screenshotDataUrl: sd
            ? `present — ${sd.slice(0, 30)}… (${Math.round(sd.length * 0.75 / 1024)} KB)`
            : 'MISSING',
        };
      }
    } catch (e) {
      results.step2_report = { error: e.message };
    }
  } else {
    results.step2_report = 'skipped — no reportId param';
  }

  // ── 3. Microlink JSON API ────────────────────────────────────────────────────
  const testUrl = 'https://example.com';
  try {
    const mlRes = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(testUrl)}&screenshot=true`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (mlRes.ok) {
      const mlData = await mlRes.json();
      results.step3_microlink = {
        httpStatus: mlRes.status,
        apiStatus: mlData?.status,
        screenshotUrl: mlData?.data?.screenshot?.url ? 'present' : 'missing',
      };
    } else {
      const body = await mlRes.text().catch(() => '');
      results.step3_microlink = { httpStatus: mlRes.status, body: body.slice(0, 200) };
    }
  } catch (e) {
    results.step3_microlink = { error: e.message };
  }

  // ── 4. Claude vision API — minimal 1×1 JPEG ──────────────────────────────────
  // A tiny hardcoded JPEG so this test never needs Microlink or PSI.
  const minimalJpeg =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB' +
    'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAAR' +
    'CAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAA' +
    'AAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAA' +
    'AAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

  if (!apiKey) {
    results.step4_claudeVision = { skipped: 'no API key' };
  } else {
    try {
      const start = Date.now();
      const vRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 20,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: minimalJpeg } },
              { type: 'text', text: 'What color is this tiny image? One word.' },
            ],
          }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      const elapsed = Date.now() - start;
      if (vRes.ok) {
        const vData = await vRes.json();
        results.step4_claudeVision = {
          ok: true,
          httpStatus: vRes.status,
          elapsedMs: elapsed,
          response: vData.content?.[0]?.text || '(empty)',
        };
      } else {
        const body = await vRes.text().catch(() => '');
        results.step4_claudeVision = {
          ok: false,
          httpStatus: vRes.status,
          elapsedMs: elapsed,
          error: body.slice(0, 400),
        };
      }
    } catch (e) {
      results.step4_claudeVision = { error: e.message };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
