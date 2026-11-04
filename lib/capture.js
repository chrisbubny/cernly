// lib/capture.js — Desktop screenshot capture helpers
//
// Responsibilities:
//   1. validateCaptureUrl()     — SSRF-safe URL validation (IPv4, IPv6, encoded forms)
//   2. fetchMicrolinkScreenshot() — Fetch 1280px desktop screenshot via Microlink JSON API
//   3. validateScreenshotBuffer() — MIME, size, and sanity checks before upload

import { randomUUID } from 'crypto';
import dns from 'dns/promises';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Max screenshot size accepted from Microlink (10 MB)
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

// Min plausible screenshot size — anything smaller is likely an error page
const MIN_SCREENSHOT_BYTES = 1024;

// Accepted MIME types from Microlink
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Microlink request timeout (ms)
const MICROLINK_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// SSRF-safe URL validation
// ---------------------------------------------------------------------------

// Private IPv4 ranges as [start, end] in integer form
const PRIVATE_RANGES_V4 = [
  [0x00000000, 0x00ffffff],   // 0.0.0.0/8
  [0x0a000000, 0x0affffff],   // 10.0.0.0/8
  [0x64400000, 0x647fffff],   // 100.64.0.0/10 (carrier-grade NAT)
  [0x7f000000, 0x7fffffff],   // 127.0.0.0/8 (loopback)
  [0xa9fe0000, 0xa9feffff],   // 169.254.0.0/16 (link-local)
  [0xac100000, 0xac1fffff],   // 172.16.0.0/12
  [0xc0000000, 0xc00000ff],   // 192.0.0.0/24
  [0xc0000200, 0xc00002ff],   // 192.0.2.0/24 (TEST-NET-1)
  [0xc0a80000, 0xc0a8ffff],   // 192.168.0.0/16
  [0xc6120000, 0xc613ffff],   // 198.18.0.0/15 (benchmarking)
  [0xc6336400, 0xc63364ff],   // 198.51.100.0/24 (TEST-NET-2)
  [0xcb007100, 0xcb0071ff],   // 203.0.113.0/24 (TEST-NET-3)
  [0xe0000000, 0xffffffff],   // 224.0.0.0/4 (multicast) + 240.0.0.0/4 (reserved)
];

// Convert dotted-decimal IPv4 string to 32-bit integer
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return PRIVATE_RANGES_V4.some(([lo, hi]) => n >= lo && n <= hi);
}

// Private IPv6 prefixes to block
const BLOCKED_IPV6_PREFIXES = [
  '::1',          // loopback
  '::',           // unspecified
  'fc',           // fc00::/7 (unique local)
  'fd',           // fd00::/8 (unique local)
  'fe80',         // fe80::/10 (link-local)
  'ff',           // ff00::/8 (multicast)
  '::ffff:',      // IPv4-mapped IPv6 addresses — resolve as IPv4 so check those too
  '2001:db8',     // documentation range
  '100::',        // 100::/64 (discard)
];

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return BLOCKED_IPV6_PREFIXES.some(p => lower === p || lower.startsWith(p));
}

/**
 * Detect alternative decimal/octal/hex IPv4 representations that bypass naive checks.
 * e.g. http://2130706433/ == http://127.0.0.1/
 *      http://0177.0.0.1/ (octal)
 *      http://0x7f000001/ (hex)
 */
function parseAlternativeIPv4(hostname) {
  // Pure decimal (e.g. 2130706433)
  if (/^\d+$/.test(hostname)) {
    const n = parseInt(hostname, 10);
    if (!isNaN(n) && n >= 0 && n <= 0xffffffff) {
      const ip = [
        (n >>> 24) & 0xff,
        (n >>> 16) & 0xff,
        (n >>>  8) & 0xff,
        (n >>>  0) & 0xff,
      ].join('.');
      return ip;
    }
  }
  // Hex (e.g. 0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    const n = parseInt(hostname, 16);
    if (!isNaN(n) && n >= 0 && n <= 0xffffffff) {
      const ip = [
        (n >>> 24) & 0xff,
        (n >>> 16) & 0xff,
        (n >>>  8) & 0xff,
        (n >>>  0) & 0xff,
      ].join('.');
      return ip;
    }
  }
  // Octal-dotted (e.g. 0177.0.0.1) — mixed decimal and octal parts
  if (/^(0[0-7]+\.){1,3}[0-9]+$/.test(hostname) || /^([0-9]+\.){1,3}0[0-7]+$/.test(hostname)) {
    const parts = hostname.split('.');
    const nums = parts.map(p => /^0[0-7]+$/.test(p) ? parseInt(p, 8) : parseInt(p, 10));
    if (nums.length === 4 && nums.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
      return nums.join('.');
    }
  }
  return null;
}

/**
 * Validate a URL for SSRF safety.
 * - Protocol must be http or https
 * - Hostname must not resolve to a private/reserved IPv4 or IPv6 address
 * - Alternative IP representations (decimal, hex, octal) are decoded and checked
 * - Internal TLDs (.internal, .local, .localhost, .test, .example) are blocked
 * - Bare hostnames without a dot (except IPv6) are blocked
 *
 * @param {string} rawUrl
 * @returns {string} The normalized href if valid
 * @throws {Error} with a code string if invalid
 */
export function validateCaptureUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('invalid_url'); }

  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('disallowed_protocol');

  // Strip port for hostname checks; URL.hostname already strips brackets from IPv6
  const host = parsed.hostname.toLowerCase();

  // Block localhost aliases
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    throw new Error('private_host');
  }

  // Check for alternative IPv4 representations (decimal, hex, octal)
  const altIp = parseAlternativeIPv4(host);
  if (altIp) {
    if (isPrivateIPv4(altIp)) throw new Error('private_ip');
  }

  // Check standard dotted-decimal IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error('private_ip');
    // Public IPv4 is allowed
    return parsed.href;
  }

  // Check IPv6 (URL.hostname strips brackets)
  // IPv6 literal in a URL: [2001:db8::1] → hostname is 2001:db8::1
  if (host.includes(':')) {
    if (isPrivateIPv6(host)) throw new Error('private_ipv6');
    // IPv4-mapped IPv6 (::ffff:192.168.1.1) — extract and check the v4 part
    const v4mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mapped && isPrivateIPv4(v4mapped[1])) throw new Error('private_ip');
    return parsed.href;
  }

  // Block internal TLDs and bare hostnames
  const internalTlds = ['.internal', '.local', '.localhost', '.test', '.example', '.invalid', '.lan'];
  if (internalTlds.some(t => host.endsWith(t))) throw new Error('internal_host');
  if (!host.includes('.')) throw new Error('internal_host');

  return parsed.href;
}

/**
 * Validate a URL and also do a DNS pre-check to catch hostnames that resolve
 * to private IPs (e.g. a public hostname pointing at 10.x.x.x).
 * DNS check is best-effort — failure doesn't block; it logs and proceeds.
 *
 * @param {string} rawUrl
 * @returns {Promise<string>} The normalized href if valid
 */
export async function validateCaptureUrlWithDns(rawUrl) {
  const href = validateCaptureUrl(rawUrl); // throws on obvious violations

  // DNS pre-check for hostname targets (not IP literals)
  const host = new URL(href).hostname.toLowerCase();
  if (!/[\d:.]/.test(host) || host.includes('.')) {
    try {
      const addrs = await dns.resolve(host);
      for (const addr of addrs) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(addr) && isPrivateIPv4(addr)) {
          throw new Error('private_ip_resolved');
        }
        if (addr.includes(':') && isPrivateIPv6(addr)) {
          throw new Error('private_ipv6_resolved');
        }
      }
    } catch (e) {
      if (e.message.includes('private_ip') || e.message.includes('private_ipv6')) throw e;
      // DNS resolution failure (NXDOMAIN, timeout, etc.) — log and proceed; Microlink
      // will fail on its own if the host doesn't exist
      console.warn(`[capture] DNS pre-check failed for ${host}: ${e.message} — proceeding`);
    }
  }

  return href;
}

// ---------------------------------------------------------------------------
// Microlink screenshot fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a 1280px wide desktop screenshot via the Microlink JSON API.
 * Downloads the image bytes; does NOT return a CDN URL (which is not durable).
 *
 * @param {string} url - Validated site URL
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 * @throws {Error} on API failure, download failure, or timeout
 */
export async function fetchMicrolinkScreenshot(url) {
  const mlParams = new URLSearchParams({
    url,
    'screenshot': 'true',
    'viewport.width':  '1280',
    'viewport.height': '5000',
    'force': 'true',
  });
  const microlinkUrl = `https://api.microlink.io/?${mlParams}`;

  console.log(`[capture] requesting Microlink desktop screenshot for ${url}`);
  const mlRes = await fetch(microlinkUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cernly/1.0)' },
    signal: AbortSignal.timeout(MICROLINK_TIMEOUT_MS),
  });

  if (!mlRes.ok) {
    throw new Error(`Microlink API error: ${mlRes.status}`);
  }

  let mlData;
  try { mlData = await mlRes.json(); } catch (e) {
    throw new Error(`Microlink JSON parse failed: ${e.message}`);
  }

  const screenshotUrl = mlData?.data?.screenshot?.url;
  if (!screenshotUrl) {
    throw new Error(`Microlink returned no screenshot URL (status: ${mlData?.status})`);
  }

  console.log(`[capture] downloading screenshot from Microlink CDN`);
  const imgRes = await fetch(screenshotUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cernly/1.0)' },
    signal: AbortSignal.timeout(30_000),
    redirect: 'follow',
  });

  if (!imgRes.ok) throw new Error(`Screenshot download failed: ${imgRes.status}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const rawContentType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();

  return { buffer, contentType: rawContentType };
}

// ---------------------------------------------------------------------------
// Buffer validation
// ---------------------------------------------------------------------------

/**
 * Validate a screenshot buffer before uploading to Spaces.
 *
 * @param {Buffer} buffer
 * @param {string} contentType - Content-Type from download response
 * @returns {{ buffer: Buffer, contentType: string }} - Validated and normalized values
 * @throws {Error} with a code string on validation failure
 */
export function validateScreenshotBuffer(buffer, contentType) {
  if (buffer.byteLength < MIN_SCREENSHOT_BYTES) {
    throw new Error(`image_too_small: ${buffer.byteLength} bytes`);
  }
  if (buffer.byteLength > MAX_SCREENSHOT_BYTES) {
    throw new Error(`image_too_large: ${buffer.byteLength} bytes`);
  }

  const normalizedMime = contentType.toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
    throw new Error(`invalid_mime_type: ${normalizedMime}`);
  }

  return { buffer, contentType: normalizedMime };
}

/**
 * Generate a unique Spaces object key for a report's desktop screenshot.
 *
 * @param {number} reportId - Integer PK
 * @param {string} [ext='jpg']
 * @returns {string}
 */
export function screenshotKey(reportId, ext = 'jpg') {
  const uid = randomUUID().replace(/-/g, '').slice(0, 12);
  return `screenshots/${reportId}-${uid}.${ext}`;
}
