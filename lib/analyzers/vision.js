// Vision analysis — screenshot → Claude vision → annotated UX callouts
// Returns { screenshotUrl, annotations: [...] } or null on failure
//
// Primary path: uses the PSI/Lighthouse screenshot already captured during the
// Lighthouse run (stored in lhData.screenshotDataUrl). This avoids any server-side
// call to Microlink, which is rate-limited from Digital Ocean's datacenter IPs.
//
// Fallback path: if no pre-supplied screenshot, falls back to Microlink JSON API
// → screenshot download → base64 encode. This handles re-scans of old reports
// that were saved before the screenshotDataUrl field was added to lhData.

export async function runVisionAnalysis({ url, imageBase64: suppliedBase64, imageMediaType: suppliedMediaType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('[Vision] No ANTHROPIC_API_KEY'); return null; }

  let imageBase64    = suppliedBase64    || null;
  let imageMediaType = suppliedMediaType || null;
  let screenshotUrl  = null;

  try {
    if (imageBase64 && imageMediaType) {
      // ── Primary path: PSI screenshot supplied by caller ──────────────────────
      const kb = Math.round(imageBase64.length * 0.75 / 1024);
      console.log(`[Vision] Using supplied ${imageMediaType} screenshot (${kb} KB) — skipping Microlink`);
      // Use the data URL as the display URL so the overlay shows the same image
      // Claude analysed (PSI mobile screenshot, ~412 px wide).
      screenshotUrl = `data:${imageMediaType};base64,${imageBase64}`;

    } else {
      // ── Fallback path: fetch screenshot from Microlink ────────────────────────
      const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true`;
      console.log(`[Vision] No PSI screenshot — falling back to Microlink for ${url}`);

      const mlRes = await fetch(microlinkUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cernly/1.0)' },
        signal: AbortSignal.timeout(25000),
      });

      if (mlRes.ok) {
        try {
          const mlData = await mlRes.json();
          screenshotUrl = mlData?.data?.screenshot?.url || null;
          console.log(`[Vision] Microlink status: ${mlData?.status}, screenshot URL: ${screenshotUrl ? 'found' : 'not found'}`);
        } catch (e) {
          console.error('[Vision] Microlink JSON parse failed:', e.message);
        }
      } else {
        console.error(`[Vision] Microlink API returned ${mlRes.status}`);
      }

      // Fallback embed URL if JSON API didn't give us a direct URL
      if (!screenshotUrl) {
        screenshotUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`;
        console.log('[Vision] Using Microlink embed URL as fallback');
      }

      // Download and base64-encode the screenshot
      console.log(`[Vision] Downloading screenshot from: ${screenshotUrl.slice(0, 80)}...`);
      try {
        const imgRes = await fetch(screenshotUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cernly/1.0)' },
          signal: AbortSignal.timeout(30000),
          redirect: 'follow',
        });
        if (!imgRes.ok) throw new Error(`Screenshot download failed: ${imgRes.status}`);
        const imgBuffer = await imgRes.arrayBuffer();
        imageBase64    = Buffer.from(imgBuffer).toString('base64');
        imageMediaType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        console.log(`[Vision] Screenshot downloaded — ${imgBuffer.byteLength} bytes, type: ${imageMediaType}`);
      } catch (e) {
        console.error('[Vision] Screenshot download failed:', e.message);
        return null;
      }
    }

    // ── Send to Claude vision ─────────────────────────────────────────────────
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

    console.log(`[Vision] Sending base64 screenshot to Claude (${imageMediaType})...`);

    const visionRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMediaType,
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(45000),
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
