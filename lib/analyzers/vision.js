// Vision analysis — screenshot → Claude vision → annotated UX callouts
// Returns { annotations: [...] } or null on failure

export async function runVisionAnalysis({ url }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    // 1. Get screenshot URL from Microlink JSON API
    const mlRes = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!mlRes.ok) return null;

    const mlData = await mlRes.json();
    const screenshotUrl = mlData?.data?.screenshot?.url;
    if (!screenshotUrl) return null;

    // 2. Send screenshot to Claude vision for UX annotation
    const prompt = `You are a senior UX designer reviewing a website screenshot. Analyze the visible page and return a JSON object with UX issues annotated with positions.

Return ONLY valid JSON in this exact shape:
{
  "annotations": [
    {
      "x": 0.25,
      "y": 0.12,
      "label": "Short label (4-6 words)",
      "severity": "critical" | "warning" | "good",
      "detail": "1-2 sentences explaining the issue and the specific fix.",
      "area": "Navigation" | "Above the fold" | "Calls to action" | "Visual hierarchy" | "Content clarity" | "Mobile usability" | "Forms & inputs" | "Social proof"
    }
  ]
}

Rules:
- x and y are percentages (0.0 to 1.0) from top-left of the screenshot
- Identify 4-6 specific UX issues or notable elements visible in this screenshot
- x/y should point to the SPECIFIC element you're annotating (e.g. a button, a heading, a form field)
- Mix severities — not everything is critical
- Be specific: name actual elements you can see, not generic advice
- Only annotate things VISIBLE in this screenshot

Return ONLY the JSON. No explanation, no markdown.`;

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
            {
              type: 'image',
              source: { type: 'url', url: screenshotUrl },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!visionRes.ok) {
      const err = await visionRes.text().catch(() => '');
      console.error(`[Vision] API error ${visionRes.status}: ${err.slice(0, 200)}`);
      return null;
    }

    const visionData = await visionRes.json();
    const raw  = visionData.content?.[0]?.text?.trim() || '';
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.annotations)) return null;

    // Clamp coordinates to valid range and limit to 6 annotations
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

    return {
      screenshotUrl,
      annotations,
    };
  } catch (e) {
    console.error('[Vision]', e.message);
    return null;
  }
}
