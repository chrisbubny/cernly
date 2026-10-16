// Vision analysis — screenshot → Claude vision → annotated UX callouts
// Returns { screenshotUrl, annotations: [...] } or null on failure

export async function runVisionAnalysis({ url }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('[Vision] No ANTHROPIC_API_KEY'); return null; }

  try {
    // 1. Fetch screenshot image bytes directly via Microlink embed URL.
    //    This is the same URL used in the <img> tag so we know it works.
    //    Microlink serves a cached/live JPEG — no JSON parsing needed.
    const screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`;

    console.log(`[Vision] Fetching screenshot for ${url}`);
    const imgRes = await fetch(screenshotUrl, { signal: AbortSignal.timeout(25000) });
    if (!imgRes.ok) {
      console.error(`[Vision] Microlink embed returned ${imgRes.status} for ${url}`);
      return null;
    }

    const contentType = (imgRes.headers.get('content-type') || '').toLowerCase();
    // Microlink might redirect to a JSON error or return HTML on failure
    if (!contentType.startsWith('image/')) {
      const body = await imgRes.text().catch(() => '');
      console.error(`[Vision] Microlink returned non-image content-type: ${contentType} — body: ${body.slice(0, 200)}`);
      return null;
    }

    const imgBuffer = await imgRes.arrayBuffer();
    if (imgBuffer.byteLength < 1000) {
      console.error(`[Vision] Screenshot too small (${imgBuffer.byteLength} bytes) — likely an error image`);
      return null;
    }

    const base64    = Buffer.from(imgBuffer).toString('base64');
    const mediaType = contentType.split(';')[0].trim() || 'image/jpeg';
    console.log(`[Vision] Screenshot fetched — ${Math.round(imgBuffer.byteLength / 1024)} KB, type=${mediaType}`);

    // 2. Send to Claude vision for UX annotation
    const prompt = `You are a senior UX designer reviewing a website screenshot. Identify 4-6 specific UX issues or notable elements visible in this screenshot and return their positions.

Return ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "annotations": [
    {
      "x": 0.25,
      "y": 0.12,
      "label": "Short label (4-6 words)",
      "severity": "critical",
      "detail": "1-2 sentences: what the problem is and the specific fix.",
      "area": "Navigation"
    }
  ]
}

Rules:
- x/y are 0.0–1.0 from the top-left of the screenshot, pointing to the SPECIFIC element
- severity must be one of: "critical" | "warning" | "good"
- area must be one of: "Navigation" | "Above the fold" | "Calls to action" | "Visual hierarchy" | "Content clarity" | "Mobile usability" | "Forms & inputs" | "Social proof"
- Mix severities — not everything is critical
- Name actual elements you can see (e.g. "the Contact button", "the hero heading"), not generic advice
- Only annotate elements VISIBLE in this screenshot`;

    const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (!visionRes.ok) {
      const err = await visionRes.text().catch(() => '');
      console.error(`[Vision] Claude API ${visionRes.status}: ${err.slice(0, 300)}`);
      return null;
    }

    const visionData = await visionRes.json();
    const raw  = visionData.content?.[0]?.text?.trim() || '';
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[Vision] JSON parse failed. Raw output:', raw.slice(0, 400));
      return null;
    }

    if (!Array.isArray(parsed?.annotations)) {
      console.error('[Vision] No annotations array in response:', JSON.stringify(parsed).slice(0, 200));
      return null;
    }

    const annotations = parsed.annotations
      .slice(0, 6)
      .map(a => ({
        x:        Math.min(Math.max(Number(a.x) || 0, 0.02), 0.96),
        y:        Math.min(Math.max(Number(a.y) || 0, 0.02), 0.96),
        label:    String(a.label || '').slice(0, 60),
        severity: ['critical', 'warning', 'good'].includes(a.severity) ? a.severity : 'warning',
        detail:   String(a.detail || '').slice(0, 300),
        area:     String(a.area || '').slice(0, 40),
      }));

    console.log(`[Vision] OK — ${annotations.length} annotations for ${url}`);
    return { screenshotUrl, annotations };

  } catch (e) {
    console.error('[Vision] Uncaught error:', e.message);
    return null;
  }
}
