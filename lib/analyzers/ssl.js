// SSL & Security headers analyzer
export async function runSslCheck(url) {
  const issues = [];
  const checks = {};

  try {
    const parsed = new URL(url);

    // 1. Check HTTPS
    checks.isHttps = parsed.protocol === 'https:';
    if (!checks.isHttps) {
      issues.push({ area: 'Security', message: 'Site does not use HTTPS', severity: 'critical', source: 'ssl' });
      return { score: 20, issues, checks, ssl: { valid: false } };
    }

    // 2. Fetch headers
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!res) {
      issues.push({ area: 'Security', message: 'Could not reach site to check headers', severity: 'info', source: 'ssl' });
      return { score: 50, issues, checks, ssl: { valid: true } };
    }

    const headers = Object.fromEntries(res.headers.entries());
    checks.headers = headers;
    checks.statusCode = res.status;

    // 3. Security headers audit
    const hdrChecks = [
      {
        key: 'strict-transport-security',
        name: 'HSTS (Strict-Transport-Security)',
        severity: 'warning',
        points: 10,
      },
      {
        key: 'content-security-policy',
        name: 'Content Security Policy (CSP)',
        severity: 'warning',
        points: 12,
      },
      {
        key: 'x-frame-options',
        name: 'X-Frame-Options',
        severity: 'warning',
        points: 8,
      },
      {
        key: 'x-content-type-options',
        name: 'X-Content-Type-Options',
        severity: 'info',
        points: 5,
      },
      {
        key: 'referrer-policy',
        name: 'Referrer-Policy',
        severity: 'info',
        points: 4,
      },
      {
        key: 'permissions-policy',
        name: 'Permissions-Policy',
        severity: 'info',
        points: 3,
      },
    ];

    let deductions = 0;
    for (const hdr of hdrChecks) {
      const present = !!headers[hdr.key];
      checks[hdr.key.replace(/-/g, '_')] = present;
      if (!present) {
        issues.push({
          area: 'Security',
          message: `Missing ${hdr.name} header`,
          severity: hdr.severity,
          source: 'ssl',
        });
        deductions += hdr.points;
      }
    }

    // 4. Check for mixed content signals in html
    // (would need full HTML fetch — skip for HEAD)

    // 5. Check redirect from HTTP
    try {
      const httpUrl = url.replace(/^https:/, 'http:');
      const httpRes = await fetch(httpUrl, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
      checks.httpRedirects = httpRes.status >= 300 && httpRes.status < 400;
      if (!checks.httpRedirects) {
        issues.push({ area: 'Security', message: 'HTTP does not redirect to HTTPS', severity: 'warning', source: 'ssl' });
        deductions += 8;
      }
    } catch {}

    const score = Math.max(0, 100 - deductions);
    return { score, issues, checks, ssl: { valid: true } };

  } catch (err) {
    console.error('[SSL]', err.message);
    return { score: null, issues: [], checks: {} };
  }
}
