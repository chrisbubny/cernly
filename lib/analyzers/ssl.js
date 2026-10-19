// SSL & Security headers analyzer
export async function runSslCheck(url) {
  const issues = [];
  const checks = {};

  try {
    const parsed = new URL(url);

    // 1. Check HTTPS
    checks.isHttps = parsed.protocol === 'https:';
    if (!checks.isHttps) {
      issues.push({ area: 'Security', message: 'Site does not use HTTPS', severity: 'critical', source: 'ssl', checkId: 'https_missing',
        description: 'This site is served over HTTP, which means all data between the browser and server is transmitted in plain text. Passwords, form submissions, and personal data are visible to anyone on the same network.',
        fix: 'Install an SSL/TLS certificate and configure your server to serve all content over HTTPS. Free certificates are available from Let\'s Encrypt. After enabling HTTPS, redirect all HTTP traffic to HTTPS.' });
      return { score: 20, issues, checks, ssl: { valid: false } };
    }

    // 2. Fetch headers
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!res) {
      issues.push({ area: 'Security', message: 'Could not reach site to check headers', severity: 'info', source: 'ssl', checkId: 'headers_unreachable' });
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
        description: 'HSTS forces browsers to only communicate with your site over HTTPS, preventing man-in-the-middle attacks where an attacker downgrades the connection to HTTP.',
        fix: 'Add this header to your server: Strict-Transport-Security: max-age=31536000; includeSubDomains. In Apache, add it to your .htaccess or VirtualHost config. In Nginx, add it inside your server block.',
      },
      {
        key: 'content-security-policy',
        name: 'Content Security Policy (CSP)',
        severity: 'warning',
        points: 12,
        description: 'A Content Security Policy header tells browsers which sources of scripts, styles, and media are trusted. It prevents cross-site scripting (XSS) attacks by blocking unauthorized content injection.',
        fix: 'Add a Content-Security-Policy header. Start with a permissive policy like: Content-Security-Policy: default-src \'self\'; then tighten it by listing only the domains your site loads content from.',
      },
      {
        key: 'x-frame-options',
        name: 'X-Frame-Options',
        severity: 'warning',
        points: 8,
        description: 'This header prevents your site from being embedded in an <iframe> on other domains, protecting against clickjacking attacks where a hidden iframe tricks users into clicking malicious elements.',
        fix: 'Add the header: X-Frame-Options: SAMEORIGIN (or DENY if the page should never be framed). Modern alternative: include frame-ancestors in your Content-Security-Policy header.',
      },
      {
        key: 'x-content-type-options',
        name: 'X-Content-Type-Options',
        severity: 'info',
        points: 5,
        description: 'This header prevents browsers from MIME-sniffing — guessing the content type of a response. Without it, browsers may execute malicious files that are served with an incorrect content type.',
        fix: 'Add the header: X-Content-Type-Options: nosniff to all responses. This is a single, universal value — no configuration required.',
      },
      {
        key: 'referrer-policy',
        name: 'Referrer-Policy',
        severity: 'info',
        points: 4,
        description: 'The Referrer-Policy header controls how much referrer information is included when navigating away from your site. Without it, full URLs (including query strings with sensitive data) may be sent to third parties.',
        fix: 'Add the header: Referrer-Policy: strict-origin-when-cross-origin. This sends the full URL for same-origin requests but only the origin for cross-origin requests.',
      },
      {
        key: 'permissions-policy',
        name: 'Permissions-Policy',
        severity: 'info',
        points: 3,
        description: 'The Permissions-Policy header lets you control which browser features (camera, microphone, geolocation, etc.) can be used by your page and any embedded iframes.',
        fix: 'Add a Permissions-Policy header listing only the features your site needs, e.g.: Permissions-Policy: camera=(), microphone=(), geolocation=(self). Empty parentheses disable the feature entirely.',
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
          checkId: `missing_header_${hdr.key.replace(/-/g, '_')}`,
          description: hdr.description,
          fix: hdr.fix,
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
        issues.push({ area: 'Security', message: 'HTTP does not redirect to HTTPS', severity: 'warning', source: 'ssl', checkId: 'http_no_redirect',
          description: 'Visiting the HTTP version of your site does not automatically redirect users to the secure HTTPS version. Users who type your URL without "https://" may be served an insecure version of your site.',
          fix: 'Configure a 301 permanent redirect from HTTP to HTTPS. In Apache, add "RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]" to your .htaccess. In Nginx, add a server block for port 80 that redirects to https.' });
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
