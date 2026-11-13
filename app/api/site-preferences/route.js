import { auth } from '@clerk/nextjs/server';
import { getSitePreference, setSitePreference } from '@/lib/store';
import { KNOWN_PLATFORMS } from '@/lib/platform';

// ---------------------------------------------------------------------------
// Domain validation helpers
// ---------------------------------------------------------------------------

/** Strip port number, lowercase, and trim whitespace. */
function normalizeDomain(raw) {
  return (raw || '').trim().toLowerCase().split(':')[0];
}

/**
 * Returns true for syntactically valid hostnames (RFC 1123 / common practice):
 * - 1–253 chars total
 * - Labels separated by dots; each label 1–63 chars
 * - Labels start and end with a letter or digit; may contain hyphens
 * - No consecutive dots or leading/trailing dots
 */
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function isValidDomain(domain) {
  return typeof domain === 'string' && domain.length >= 1 && domain.length <= 253 && DOMAIN_RE.test(domain);
}

// ---------------------------------------------------------------------------
// GET /api/site-preferences?domain=example.com
// Returns the authenticated user's platform override for a domain, or null.
// ---------------------------------------------------------------------------
export async function GET(request) {
  const { userId } = auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const domain = normalizeDomain(searchParams.get('domain') || '');
  if (!domain) return Response.json({ error: 'domain parameter required' }, { status: 400 });
  if (!isValidDomain(domain)) return Response.json({ error: 'Invalid domain format' }, { status: 400 });

  const pref = await getSitePreference(userId, domain);
  return Response.json({ preference: pref });
}

// ---------------------------------------------------------------------------
// POST /api/site-preferences
// Body: { domain: string, platformName: string, platformCategory: string }
// Upserts the platform override for the authenticated user + domain.
// ---------------------------------------------------------------------------
export async function POST(request) {
  const { userId } = auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const domain = normalizeDomain(body.domain || '');
  const platformName = (body.platformName || '').trim();
  const platformCategory = (body.platformCategory || 'unknown').trim();

  if (!domain) return Response.json({ error: 'domain is required' }, { status: 400 });
  if (!isValidDomain(domain)) return Response.json({ error: 'Invalid domain format' }, { status: 400 });
  if (!platformName) return Response.json({ error: 'platformName is required' }, { status: 400 });

  // Validate platform name against known list (allow 'Other')
  const known = KNOWN_PLATFORMS.find(p => p.name === platformName);
  if (!known) {
    return Response.json({ error: `Unknown platform '${platformName}'. Valid values: ${KNOWN_PLATFORMS.map(p => p.name).join(', ')}` }, { status: 400 });
  }

  try {
    await setSitePreference(userId, domain, platformName, known.category || platformCategory);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[site-preferences] setSitePreference error:', err.message);
    return Response.json({ error: 'Failed to save preference' }, { status: 500 });
  }
}
