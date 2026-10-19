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

  // ── 4. Claude vision API — valid 1×1 white PNG ───────────────────────────────
  // Standard valid 1×1 white PNG base64 (well-known test image).
  const validPng1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

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
          model: 'claude-sonnet-5-5',
          max_tokens: 20,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: validPng1x1 } },
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

  // ── 5. End-to-end: Microlink download → Claude vision ────────────────────────
  // Downloads the actual screenshot we confirmed in step 3 and sends it to Claude.
  if (!apiKey) {
    results.step5_e2e = { skipped: 'no API key' };
  } else {
    try {
      // Re-fetch the Microlink screenshot URL for testUrl — use fullPage=true
      const mlParams5 = new URLSearchParams({
        url: testUrl,
        'screenshot.fullPage': 'true',
        'viewport.width':  '1280',
        'viewport.height': '900',
        'force': 'true',
      });
      const mlRes2 = await fetch(
        `https://api.microlink.io/?${mlParams5}`,
        { signal: AbortSignal.timeout(20000) }
      );
      const mlData2 = mlRes2.ok ? await mlRes2.json() : null;
      const shotUrl = mlData2?.data?.screenshot?.url;
      const shotH   = mlData2?.data?.screenshot?.height;

      if (!shotUrl) {
        results.step5_e2e = { skipped: 'no screenshot URL from Microlink' };
      } else {
        // Download the screenshot
        const imgRes = await fetch(shotUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cernly/1.0)' },
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        });
        const contentType = imgRes.headers.get('content-type') || '';
        const mediaType   = contentType.split(';')[0].trim() || 'image/jpeg';

        if (!imgRes.ok) {
          results.step5_e2e = { downloadFailed: imgRes.status };
        } else {
          const buf    = await imgRes.arrayBuffer();
          const b64    = Buffer.from(buf).toString('base64');
          const kb     = Math.round(buf.byteLength / 1024);

          results.step5_e2e = {
            downloadOk: true,
            mediaType,
            sizeKb: kb,
            b64Length: b64.length,
            b64Sample: b64.slice(0, 40) + '…',
            screenshotHeight: shotH ?? 'unknown',
          };

          // Send to Claude
          const start2 = Date.now();
          const vRes2  = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-5-5',
              max_tokens: 20,
              messages: [{
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
                  { type: 'text', text: 'What color is the background of this screenshot? One word.' },
                ],
              }],
            }),
            signal: AbortSignal.timeout(30000),
          });
          const elapsed2 = Date.now() - start2;
          if (vRes2.ok) {
            const vData2 = await vRes2.json();
            results.step5_e2e.claudeOk      = true;
            results.step5_e2e.claudeElapsedMs = elapsed2;
            results.step5_e2e.claudeResponse  = vData2.content?.[0]?.text || '(empty)';
          } else {
            const errBody = await vRes2.text().catch(() => '');
            results.step5_e2e.claudeOk    = false;
            results.step5_e2e.claudeStatus = vRes2.status;
            results.step5_e2e.claudeError  = errBody.slice(0, 400);
          }
        }
      }
    } catch (e) {
      results.step5_e2e = { error: e.message };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
