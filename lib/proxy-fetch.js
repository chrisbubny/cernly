// proxyFetch — tries direct fetch first, falls back to BrightData on blocked responses
// Same pattern as InsightsDash, adapted for Cernly

const BRIGHTDATA_API = 'https://api.brightdata.com/request';
const ZONE = 'cernly'; // set your BrightData zone name here

export async function proxyFetch(url, options = {}) {
  const { timeout = 12000, ...fetchOptions } = options;

  // 1. Try direct fetch
  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Cernly/1.0; +https://cernly.ai)',
        ...fetchOptions.headers,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });

    // If we got content, return it
    if (res.ok || res.status === 304) return res;

    // Fall through to BrightData on block signals
    if ([403, 401, 429, 503, 407].includes(res.status)) {
      throw new Error(`Blocked: ${res.status}`);
    }

    return res;
  } catch (directErr) {
    // 2. Fall back to BrightData
    const apiKey = process.env.BRIGHTDATA_API_KEY;
    if (!apiKey) throw directErr;

    const bdRes = await fetch(BRIGHTDATA_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        zone: ZONE,
        url,
        format: 'raw',
      }),
      signal: AbortSignal.timeout(30000),
    });

    return bdRes;
  }
}

// For JS-heavy sites that need headless rendering
export async function proxyFetchRendered(url) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error('BrightData not configured');

  const res = await fetch(BRIGHTDATA_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      zone: ZONE,
      url,
      format: 'raw',
      render_js: true,
    }),
    signal: AbortSignal.timeout(45000),
  });

  return res;
}
