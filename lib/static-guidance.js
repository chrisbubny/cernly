/**
 * lib/static-guidance.js
 *
 * Evidence-driven static guidance for every recommendation group × persona.
 *
 * This is the RELIABLE layer. It never depends on an external AI call.
 * AI personalization (lib/guidance.js) layers on top when it succeeds.
 *
 * Design rules:
 * - Steps are grounded in measured evidence where available; variables like
 *   {{lcp}}, {{totalJsKib}} are substituted at render time from rec.evidence.
 * - No invented site-specific values. When evidence is unavailable, guidance
 *   describes what to investigate rather than what to change.
 * - Each persona receives a different framing of the same underlying task.
 * - Every group returns the same plan shape as AI-generated guidance so the
 *   renderer is persona/source-agnostic.
 */

// ─── Evidence substitution ────────────────────────────────────────────────────

/**
 * Substitute {{key}} tokens in a string with evidence values.
 * Falls back gracefully when a value is absent.
 */
function sub(template, evidence = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = evidence[key];
    if (val == null) return `[not measured in this scan]`;
    return String(val);
  });
}

function ms(val) { return val != null ? `${val} ms` : '[not measured]'; }
function kib(val) { return val != null ? `${val} KiB` : '[not measured]'; }

// ─── Plan builder ─────────────────────────────────────────────────────────────

/**
 * Build a static plan object matching the AI-generated plan schema.
 * steps[].id is omitted — caller assigns stable IDs.
 */
function plan(evidenceSummaryFn, steps) {
  return (rec) => ({
    evidenceSummary: evidenceSummaryFn(rec.evidence || {}),
    steps: steps.map(s => ({
      title: s.title,
      owner: {
        action:     sub(s.owner.action,     rec.evidence),
        delegation: sub(s.owner.delegation, rec.evidence),
        why:        sub(s.owner.why,        rec.evidence),
      },
      developer: {
        action:  sub(s.developer.action,  rec.evidence),
        tooling: sub(s.developer.tooling, rec.evidence),
        notes:   sub(s.developer.notes,   rec.evidence),
      },
    })),
  });
}

// ─── Static guidance per group key ───────────────────────────────────────────

const STATIC_PLANS = {

  // ── Performance ────────────────────────────────────────────────────────────

  'js-overhead': plan(
    e => `The page loads JavaScript that is blocking rendering or is largely unused. ${e.tbt != null ? `Total Blocking Time is ${ms(e.tbt)}, which delays interactivity.` : 'Total Blocking Time was not directly measured.'}`,
    [
      {
        title: 'Identify the largest scripts',
        owner: {
          action: 'Ask your developer to run a performance audit and share a list of the largest JavaScript files on the page, noting which ones are required and which may be removable.',
          delegation: 'Share this report and ask: "Which scripts on this page are blocking render, and which are unused?"',
          why: 'Knowing which scripts are the biggest contributors helps prioritize what to remove or defer.',
        },
        developer: {
          action: 'Run Lighthouse (chrome://inspect or PageSpeed Insights) and open the Coverage panel in Chrome DevTools (Ctrl+Shift+P → Show Coverage) to identify unused JavaScript.',
          tooling: 'Chrome DevTools → Coverage tab; Lighthouse audit; webpack-bundle-analyzer if applicable.',
          notes: `TBT: ${ms('{tbt}')} — scripts contributing to this are listed in Lighthouse's "Avoid long main-thread tasks" and "Reduce JavaScript execution time" audits.`.replace('{tbt}', '{tbt}'),
        },
      },
      {
        title: 'Defer or async non-critical scripts',
        owner: {
          action: 'Ask your developer to add `defer` or `async` to non-critical `<script>` tags, especially for analytics, chat widgets, and social buttons.',
          delegation: 'Request that any script not needed for the initial page display be loaded asynchronously.',
          why: 'Scripts loaded synchronously block the browser from rendering the page until they finish downloading and executing.',
        },
        developer: {
          action: 'Audit every `<script>` tag in the HTML. Add `defer` to scripts that do not need to run before the DOM is ready. Add `async` only to scripts with no dependencies on other scripts.',
          tooling: 'Chrome DevTools → Performance tab → Bottom-Up; grep for `<script src` in the rendered HTML.',
          notes: 'Render-blocking scripts will appear in Lighthouse under "Eliminate render-blocking resources." Third-party tags (analytics, ads, chat) are common offenders.',
        },
      },
      {
        title: 'Remove unused JavaScript',
        owner: {
          action: 'Review installed plugins, apps, or integrations with your developer. If a feature is no longer used, have the associated script removed entirely.',
          delegation: 'Ask your developer to identify and remove any JavaScript that is no longer serving an active purpose on the site.',
          why: 'Unused code still downloads and is parsed by the browser, consuming time and bandwidth without providing value.',
        },
        developer: {
          action: 'Use the Coverage panel and tree-shaking-capable bundler analysis (if applicable) to find modules with high unused percentages. Remove dead imports or replace heavyweight libraries with lighter alternatives.',
          tooling: 'Chrome DevTools → Coverage; Bundle Buddy; source-map-explorer; PurgeCSS (for CSS counterpart).',
          notes: 'Common candidates: polyfill libraries for browsers you no longer support, unused UI library components, abandoned A/B test scripts.',
        },
      },
      {
        title: 'Verify improvement',
        owner: {
          action: 'After changes, ask your developer to re-run PageSpeed Insights on the same page and compare the Total Blocking Time score.',
          delegation: 'Request before/after Lighthouse scores showing TBT reduction.',
          why: 'Measuring before and after confirms the change had the intended effect.',
        },
        developer: {
          action: 'Re-run Lighthouse and compare TBT and Time to Interactive. Target TBT < 200 ms for a "good" score.',
          tooling: 'Lighthouse CLI: `npx lighthouse https://yoursite.com --view`',
          notes: 'Run in an incognito window without extensions to get clean numbers.',
        },
      },
    ]
  ),

  'image-optimization': plan(
    e => {
      const parts = [];
      if (e.imageCount != null) parts.push(`${e.imageCount} image${e.imageCount !== 1 ? 's' : ''} with optimization potential`);
      if (e.totalSavingsKib != null) parts.push(`potential savings of ${kib(e.totalSavingsKib)}`);
      if (e.lcpImageUrl) parts.push(`the LCP image is the primary concern`);
      return parts.length > 0
        ? `The scan found ${parts.join(', ')}.`
        : 'Images on this page could be better optimized for size and format.';
    },
    [
      {
        title: 'Convert images to modern formats',
        owner: {
          action: 'Ask your developer to convert images to WebP or AVIF format. Alternatively, use a free tool at squoosh.app to convert and compress images yourself, then upload the new versions.',
          delegation: 'Ask: "Can we serve images in WebP or AVIF format, with JPEG/PNG fallbacks for older browsers?"',
          why: 'WebP images are typically 25–35% smaller than JPEG at the same visual quality, directly reducing load time.',
        },
        developer: {
          action: `Convert images to WebP/AVIF. For the LCP image${e => e.lcpImageUrl ? ` (${e.lcpImageUrl})` : ''}, prioritize highest-quality conversion. Use <picture> with srcset for browser compatibility.`,
          tooling: 'Squoosh CLI: `npx squoosh-cli --webp auto input.jpg`; cwebp; ImageMagick; Sharp (Node.js).',
          notes: 'Use <picture> element with WebP source and JPEG fallback. Or configure your CDN/server to serve WebP automatically based on Accept header.',
        },
      },
      {
        title: 'Resize images to display dimensions',
        owner: {
          action: 'When uploading images, make sure they are no larger than the size they will display on screen. Ask your developer what maximum pixel dimensions each image slot requires.',
          delegation: 'Ask your developer to audit which images are being served much larger than their display size.',
          why: 'Serving a 2000px image in a 400px slot wastes bandwidth — the browser downloads 5× more data than necessary.',
        },
        developer: {
          action: 'Audit with Lighthouse "Properly size images" audit. Generate responsive image variants for key breakpoints and use srcset with sizes attribute.',
          tooling: 'Lighthouse; responsive-images-generator npm package; your image processing pipeline (Sharp, ImageMagick, CDN transforms).',
          notes: `${e => e.lcpImageUrl ? `LCP image: ${e.lcpImageUrl}. ` : ''}Check images with a viewport width between 320px and 1440px. Hero and LCP images benefit most from srcset.`,
        },
      },
      {
        title: 'Add lazy loading to below-fold images',
        owner: {
          action: 'Ask your developer to add lazy loading to images that are not visible when the page first loads. This is a small code change with measurable impact.',
          delegation: 'Request that `loading="lazy"` be added to all images below the fold.',
          why: 'Images that are not visible on initial load do not need to download immediately. Lazy loading defers them until the user scrolls.',
        },
        developer: {
          action: 'Add `loading="lazy"` to all `<img>` tags below the fold. Do NOT add it to the LCP image or any images visible in the initial viewport — this would hurt LCP.',
          tooling: 'Search the template/component tree for <img tags without loading="lazy".',
          notes: 'Browser support is universal (95%+). Do not lazy-load hero or header images.',
        },
      },
    ]
  ),

  'server-performance': plan(
    e => {
      const parts = [];
      if (e.ttfb != null) parts.push(`Time to First Byte is ${ms(e.ttfb)}`);
      if (e.lcp  != null) parts.push(`LCP is ${ms(e.lcp)}`);
      return parts.length > 0
        ? `${parts.join('; ')}.`
        : 'The server or hosting configuration may be contributing to slow page load times.';
    },
    [
      {
        title: 'Measure and locate the bottleneck',
        owner: {
          action: 'Share this report with your hosting provider or developer and ask them to investigate why the server is slow to respond.',
          delegation: `Ask: "Our Time to First Byte is ${'{ttfb}'}. Is this a server, CDN, or application-level issue?"`,
          why: 'A slow server delays everything else on the page — every subsequent resource starts downloading later than it should.',
        },
        developer: {
          action: 'Use server logs and APM tooling to identify where time is being spent: DNS lookup, TLS handshake, waiting (TTFB), or content transfer.',
          tooling: 'Chrome DevTools → Network → Timing tab on the document request; curl -o /dev/null -s -w "%{time_starttransfer}" https://yoursite.com',
          notes: `TTFB target: < 600 ms (Lighthouse "good"). Current: ${ms('{ttfb}')}.`,
        },
      },
      {
        title: 'Enable and configure caching',
        owner: {
          action: 'Ask your hosting provider or developer to enable page caching if it is not already active. Many hosting plans include this as a setting.',
          delegation: 'Ask: "Is full-page caching enabled? Are static assets served with long cache TTLs?"',
          why: 'Caching serves previously generated pages instantly, bypassing database queries and server processing.',
        },
        developer: {
          action: 'Confirm cache-control headers on both HTML documents (short TTL) and static assets (long TTL: 1 year for versioned files). Enable server-side page caching (e.g. Nginx microcaching, object caching).',
          tooling: 'curl -I https://yoursite.com — check Cache-Control, Expires, ETag, Age headers.',
          notes: 'Static assets (CSS, JS, images with hashed filenames) can safely use max-age=31536000. HTML should use short or no-store depending on personalization requirements.',
        },
      },
      {
        title: 'Add a CDN for static assets',
        owner: {
          action: 'Ask your developer or hosting provider whether your site uses a Content Delivery Network (CDN). If not, ask about enabling one — many hosting plans include this.',
          delegation: 'Ask: "Are our static files served from a CDN close to our visitors?"',
          why: 'A CDN serves files from servers geographically close to each visitor, reducing network latency.',
        },
        developer: {
          action: 'Configure a CDN (Cloudflare, Fastly, CloudFront) for at minimum static asset delivery. Review origin pull settings and cache rules.',
          tooling: 'Cloudflare free tier; Fastly; CloudFront. Check headers: CF-Cache-Status, X-Cache.',
          notes: 'Even with a CDN, ensure origin response time is optimized — CDN misses still hit the origin.',
        },
      },
    ]
  ),

  'resource-efficiency': plan(
    e => {
      const parts = [];
      if (e.totalByteWeightKib != null) parts.push(`total page weight is ${kib(e.totalByteWeightKib)}`);
      if (e.unusedCssKib != null) parts.push(`${kib(e.unusedCssKib)} of unused CSS`);
      return parts.length > 0
        ? `${parts.join('; ')}.`
        : 'The page is downloading more data than necessary, slowing initial load time.';
    },
    [
      {
        title: 'Enable text compression',
        owner: {
          action: 'Ask your hosting provider or developer to enable Gzip or Brotli compression for text files (HTML, CSS, JavaScript). This is usually a one-line server configuration.',
          delegation: 'Ask: "Is Brotli or Gzip compression enabled for text content on our server?"',
          why: 'Text compression typically reduces transferred file sizes by 60–80%, with no change required to source files.',
        },
        developer: {
          action: 'Verify text compression is active. For Nginx: `gzip on; gzip_types text/html text/css application/javascript`. For Apache: enable mod_deflate. For Brotli: enable mod_brotli.',
          tooling: 'curl -H "Accept-Encoding: br,gzip" -I https://yoursite.com | grep content-encoding',
          notes: 'Brotli delivers ~15% better compression than Gzip. Both are widely supported. Most CDNs enable this automatically.',
        },
      },
      {
        title: 'Remove unused CSS',
        owner: {
          action: 'Ask your developer to identify and remove CSS that is loaded but not used on the page. This is especially common when using large CSS frameworks.',
          delegation: 'Ask: "How much CSS is loaded that is not applied to any element on this page?"',
          why: 'Loading large CSS files with unused rules wastes bandwidth and parsing time.',
        },
        developer: {
          action: 'Use Chrome DevTools Coverage panel to identify unused CSS percentage. Remove unused utility classes or configure your CSS framework (Tailwind, Bootstrap) to only ship used styles.',
          tooling: 'Chrome DevTools → Coverage; PurgeCSS; UnCSS; Tailwind JIT/purge configuration.',
          notes: 'Lighthouse "Reduce unused CSS" audit lists the largest offending stylesheets. Target < 20% unused CSS per file.',
        },
      },
      {
        title: 'Audit and reduce page weight',
        owner: {
          action: 'Ask your developer to review the total weight of the page and identify the largest resources that could be reduced, deferred, or removed.',
          delegation: 'Ask: "What are the five largest resources on this page, and which can be made smaller or removed?"',
          why: 'Heavy pages take longer to download, especially on mobile connections.',
        },
        developer: {
          action: 'Open Chrome DevTools → Network, reload the page, and sort by size. Identify resources over 100 KiB. Evaluate each: can it be compressed, deferred, or replaced with a lighter alternative?',
          tooling: 'Chrome DevTools → Network; WebPageTest waterfall; Lighthouse → "Avoid enormous network payloads".',
          notes: 'Lighthouse flags total page weight > 1,600 KiB. Fonts, third-party scripts, and uncompressed images are common heavy resources.',
        },
      },
    ]
  ),

  'layout-stability': plan(
    e => e.cls != null
      ? `The page has a Cumulative Layout Shift score of ${e.cls}, indicating visible content shifts unexpectedly after load. Scores above 0.1 are considered "needs improvement".`
      : 'The page has elements that shift position after the initial render, which disrupts reading and can cause unintended clicks.',
    [
      {
        title: 'Identify what is shifting',
        owner: {
          action: 'Open the page in Chrome on your phone or computer and watch carefully as it loads. Note which elements move — images, ads, cookie banners, or text blocks.',
          delegation: 'Share this report and ask your developer to use Chrome DevTools Layout Shift Regions to identify exactly what is moving.',
          why: 'Understanding which elements shift is the first step to fixing them — each type has a different solution.',
        },
        developer: {
          action: 'Open Chrome DevTools → Performance → record page load. Expand the "Experience" lane to see layout shifts. Click each shift to see what caused it.',
          tooling: 'Chrome DevTools Performance panel; Lighthouse CLS audit; web-vitals library for field data.',
          notes: `CLS score: ${e => e.cls != null ? e.cls : '[not directly measured]'}. Target < 0.1 (good), < 0.25 (needs improvement).`,
        },
      },
      {
        title: 'Add size attributes to images and embeds',
        owner: {
          action: 'Ask your developer to add explicit width and height to all images, video thumbnails, and embedded content so the browser knows how much space to reserve before they load.',
          delegation: 'Ask: "Do all our images have explicit width and height attributes in the HTML?"',
          why: 'Without explicit dimensions, the browser cannot reserve space for images before they load, causing content to shift when the image arrives.',
        },
        developer: {
          action: 'Add width and height attributes to all <img>, <video>, and <iframe> elements. For responsive images, also set aspect-ratio in CSS matching the intrinsic ratio.',
          tooling: 'Lighthouse "Image elements do not have explicit width and height" audit lists violations.',
          notes: 'For responsive images: set width/height matching intrinsic ratio, then `img { height: auto; }` in CSS. The browser uses the ratio to reserve space even before the image loads.',
        },
      },
      {
        title: 'Reserve space for late-loading content',
        owner: {
          action: 'If ads, cookie banners, or other injected content are causing the page to jump, ask your developer to reserve the correct amount of space for them before they appear.',
          delegation: 'Ask: "Can we add a placeholder with fixed dimensions for ads and banners so the page does not shift when they load?"',
          why: 'Content injected after load (ads, embeds, lazy components) pushes other content down, creating a jarring experience.',
        },
        developer: {
          action: 'For dynamically injected content: use min-height on containers, pre-size ad slots to known dimensions, and avoid inserting content above the fold after load.',
          tooling: 'CSS min-height on containers; content-visibility; IntersectionObserver for deferred content below fold.',
          notes: 'Cookie banners/consent overlays are common CLS culprits. Use `position: fixed` or a pre-reserved slot at the bottom of the viewport.',
        },
      },
    ]
  ),

  // ── SEO ────────────────────────────────────────────────────────────────────

  'seo-meta': plan(
    e => {
      const parts = [];
      if (e.titleLength != null) parts.push(`title tag is ${e.titleLength} characters`);
      if (e.descLength != null)  parts.push(e.descLength === 0 ? 'no meta description' : `meta description is ${e.descLength} characters`);
      if (e.h1Count   != null)   parts.push(e.h1Count === 0 ? 'no H1 tag' : e.h1Count > 1 ? `${e.h1Count} H1 tags (should be 1)` : '1 H1 tag (correct)');
      return parts.length > 0
        ? `SEO metadata issues found: ${parts.join('; ')}.`
        : 'This page is missing or has weak SEO metadata that affects search visibility.';
    },
    [
      {
        title: 'Write or fix the page title',
        owner: {
          action: `The page title${e => e.titleLength != null ? ` is currently ${e.titleLength} characters` : ''}. Target 50–60 characters. It should clearly describe the page's content and include your primary keyword near the front.`,
          delegation: 'Provide the desired page title to your developer or CMS editor for implementation.',
          why: 'The title tag appears in search results as the clickable headline. A clear, correctly-sized title improves both ranking and click-through rate.',
        },
        developer: {
          action: 'Update the <title> element to 50–60 characters. Place the primary keyword first. Use a unique title for every page — do not duplicate across pages.',
          tooling: 'Search for `<title>` in your template. Check for dynamic title generation in your CMS or framework.',
          notes: `Current title length: ${'{titleLength}'} characters. Google typically truncates titles above ~60 characters.`,
        },
      },
      {
        title: 'Add a meta description',
        owner: {
          action: `${e => e.descLength === 0 ? 'No meta description is set.' : `The current meta description is ${e.descLength} characters.`} Write a 120–160 character summary of the page that explains what it offers and includes your target keyword.`,
          delegation: 'Provide the desired meta description text to your developer or CMS editor.',
          why: 'While meta descriptions do not directly affect rankings, they appear in search results and strongly influence whether someone clicks through.',
        },
        developer: {
          action: 'Add or update <meta name="description" content="..."> in the <head>. Target 120–160 characters. Make it unique per page.',
          tooling: 'Template search for `meta name="description"`; CMS SEO fields if available.',
          notes: `Current description length: ${'{descLength}'} characters.`,
        },
      },
      {
        title: 'Add or fix the H1 tag',
        owner: {
          action: `${e => e.h1Count === 0 ? 'No H1 heading is present on this page.' : e.h1Count > 1 ? `${e.h1Count} H1 headings are present — there should be exactly one.` : 'The H1 is present.'} The H1 should be the page's primary heading and match the topic of the page.`,
          delegation: 'Ask your developer or CMS editor to ensure exactly one H1 heading appears on this page.',
          why: 'The H1 tells search engines what the page is primarily about. Missing or multiple H1s weaken the page\'s topical clarity.',
        },
        developer: {
          action: `${e => e.h1Count === 0 ? 'Add an <h1> element as the primary heading.' : e.h1Count > 1 ? 'Reduce to a single <h1>. Demote additional H1s to <h2> or lower.' : 'H1 present — no change needed.'} Ensure the H1 text matches the page topic and the title tag.`,
          tooling: 'Search page source for <h1; Chrome DevTools → Inspect heading hierarchy.',
          notes: `H1 count: ${'{h1Count}'}. One per page is the standard. The H1 need not exactly match the title tag but should be topically aligned.`,
        },
      },
    ]
  ),

  'seo-signals': plan(
    e => {
      const parts = [];
      if (e.hasCanonical === false) parts.push('no canonical tag');
      if (e.schemaCount  === 0)     parts.push('no structured data');
      if (e.imgsNoAlt    != null && e.imgsNoAlt > 0)  parts.push(`${e.imgsNoAlt} images missing alt text`);
      if (e.hasViewport  === false) parts.push('no viewport meta tag');
      return parts.length > 0
        ? `Search signal issues: ${parts.join('; ')}.`
        : 'This page is missing signals that help search engines understand and index it correctly.';
    },
    [
      {
        title: 'Add a canonical tag',
        owner: {
          action: 'Ask your developer to add a canonical tag to this page. It tells search engines which URL is the "official" version to index when the same content might be reachable at multiple URLs.',
          delegation: 'Ask: "Does every page have a self-referencing canonical tag in the head?"',
          why: 'Without a canonical tag, search engines may split ranking signals across duplicate or near-duplicate URLs.',
        },
        developer: {
          action: 'Add <link rel="canonical" href="https://yourdomain.com/this-page-url/"> to the <head>. Use the exact, preferred URL including/excluding trailing slash.',
          tooling: 'Search template for `rel="canonical"`. Check CMS SEO settings — most include this automatically.',
          notes: 'Self-referencing canonicals are best practice even when there is no duplicate content risk. Ensure https and www/non-www is consistent.',
        },
      },
      {
        title: 'Add structured data markup',
        owner: {
          action: 'Ask your developer to add structured data (Schema.org markup) to key pages. At minimum: Organization or LocalBusiness on the homepage, Article on blog posts, Product on product pages.',
          delegation: 'Ask: "Which structured data types are most valuable for our site type, and can we implement them?"',
          why: 'Structured data enables rich results in search (star ratings, FAQ dropdowns, breadcrumbs) which increase click-through rates.',
        },
        developer: {
          action: 'Implement JSON-LD structured data in the <head> or inline. Use Schema.org vocabulary. Validate with Google\'s Rich Results Test.',
          tooling: 'schema.org; Google Rich Results Test (search.google.com/test/rich-results); JSON-LD format recommended.',
          notes: 'Start with the highest-impact type for your content category. JSON-LD is preferred over Microdata — it can be placed in the head without affecting visible markup.',
        },
      },
      {
        title: 'Fix image alt attributes',
        owner: {
          action: `${e => e.imgsNoAlt != null && e.imgsNoAlt > 0 ? `${e.imgsNoAlt} image${e.imgsNoAlt > 1 ? 's are' : ' is'} missing alt text.` : 'Some images may be missing alt text.'} Each image should have a brief description of what it shows. Decorative images can have alt="" (empty).`,
          delegation: 'Ask your developer to audit all images on this page and add descriptive alt text.',
          why: 'Alt text helps search engines understand image content and is required for screen reader users.',
        },
        developer: {
          action: 'Find all <img> tags without alt attributes and add appropriate text. Purely decorative images should use alt="" to be ignored by screen readers.',
          tooling: 'Grep for `<img` without `alt=`. Chrome DevTools → Elements search for img:not([alt]).',
          notes: `Images without alt: ${'{imgsNoAlt}'}. Good alt text is descriptive and specific: "Red running shoes, side view" not "shoes" or "image1.jpg".`,
        },
      },
    ]
  ),

  'social-sharing': plan(
    () => 'Open Graph and social sharing tags are incomplete or missing, which means links to this site will not display rich previews on social platforms.',
    [
      {
        title: 'Add Open Graph meta tags',
        owner: {
          action: 'Ask your developer or CMS editor to add Open Graph tags to each page. At minimum: og:title, og:description, og:image, og:url.',
          delegation: 'Ask: "Do our pages have Open Graph tags set? Can we add them through the CMS?"',
          why: 'Without Open Graph tags, links shared on Facebook, LinkedIn, and messaging apps will not show a preview image or formatted title.',
        },
        developer: {
          action: 'Add to the <head>: <meta property="og:title">, <meta property="og:description">, <meta property="og:image"> (min 1200×630px), <meta property="og:url">, <meta property="og:type">.',
          tooling: 'Facebook Sharing Debugger (developers.facebook.com/tools/debug); LinkedIn Post Inspector.',
          notes: 'The og:image should be at least 1200×630 pixels. Avoid images that are mostly text — they perform poorly on social.',
        },
      },
      {
        title: 'Add Twitter Card tags',
        owner: {
          action: 'Ask your developer to add Twitter Card meta tags alongside the Open Graph tags.',
          delegation: 'Ask: "Do we have Twitter Card tags configured to control how our links display on X/Twitter?"',
          why: 'Twitter Card tags control the preview shown when links are shared on X/Twitter.',
        },
        developer: {
          action: 'Add: <meta name="twitter:card" content="summary_large_image">, <meta name="twitter:title">, <meta name="twitter:description">, <meta name="twitter:image">.',
          tooling: 'Twitter Card Validator (cards-dev.twitter.com/validator).',
          notes: 'summary_large_image is the most visually prominent card type. twitter:* tags fall back to og:* if Twitter tags are absent, but explicitly setting them is more reliable.',
        },
      },
    ]
  ),

  // ── Security ───────────────────────────────────────────────────────────────

  'security-headers': plan(
    e => {
      const missing = [
        e.hasHsts  === false && 'HSTS',
        e.hasCsp   === false && 'Content-Security-Policy',
        e.hasXfo   === false && 'X-Frame-Options',
      ].filter(Boolean);
      return missing.length > 0
        ? `Missing security headers: ${missing.join(', ')}.`
        : 'One or more HTTP security headers are missing or misconfigured.';
    },
    [
      {
        title: 'Add Strict-Transport-Security (HSTS)',
        owner: {
          action: 'Ask your hosting provider or developer to add the HSTS header. This tells browsers to always use HTTPS when connecting to your site, even if a user types http:// manually.',
          delegation: 'Ask: "Can you add the Strict-Transport-Security header with max-age=31536000 to all HTTPS responses?"',
          why: 'Without HSTS, a user could be redirected from HTTP to HTTPS in a way that is vulnerable to interception (SSL stripping).',
        },
        developer: {
          action: 'Add the Strict-Transport-Security response header to all HTTPS responses. Nginx: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`. Apache: equivalent Header directive.',
          tooling: 'curl -I https://yoursite.com | grep -i strict; securityheaders.com',
          notes: 'Start with max-age=86400 (1 day) to test, then increase to 31536000 (1 year) once confirmed working. Only add includeSubDomains if ALL subdomains are on HTTPS.',
        },
      },
      {
        title: 'Add X-Frame-Options',
        owner: {
          action: 'Ask your developer or hosting provider to add the X-Frame-Options header. This prevents other websites from embedding your pages in iframes, protecting against clickjacking attacks.',
          delegation: 'Ask: "Can you add X-Frame-Options: SAMEORIGIN to our server responses?"',
          why: 'Clickjacking attacks overlay invisible iframes on legitimate sites to trick users into performing unintended actions.',
        },
        developer: {
          action: 'Add X-Frame-Options: SAMEORIGIN header to all responses. Nginx: `add_header X-Frame-Options "SAMEORIGIN" always;`. This prevents the page from being framed by other origins.',
          tooling: 'curl -I https://yoursite.com | grep -i frame; securityheaders.com',
          notes: 'Use SAMEORIGIN (allows framing by same site) or DENY (no framing at all). DENY is more secure but may break legitimate use of iframes within your own domain.',
        },
      },
      {
        title: 'Add Content-Security-Policy',
        owner: {
          action: 'Ask your developer to add a Content Security Policy header. This is more complex than other security headers — it requires testing to avoid breaking site functionality.',
          delegation: 'Ask: "Can you implement a Content-Security-Policy starting with report-only mode so we can see what would be blocked before enforcing it?"',
          why: 'CSP restricts which scripts, styles, and resources the browser is allowed to load, dramatically reducing the risk of successful XSS attacks.',
        },
        developer: {
          action: 'Start in report-only mode: add Content-Security-Policy-Report-Only header with a restrictive policy and a report-uri. Analyze reports, then switch to enforcement with Content-Security-Policy.',
          tooling: 'Report-URI.com (free tier); CSP Evaluator (csp-evaluator.withgoogle.com); Chrome DevTools Console for violations.',
          notes: 'A minimal starting policy: `default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:;`. Inline styles/scripts will require \'unsafe-inline\' or nonces.',
        },
      },
      {
        title: 'Verify headers are live',
        owner: {
          action: 'After your developer makes changes, visit securityheaders.com, enter your site URL, and check that the report shows a grade improvement.',
          delegation: 'Ask your developer to share the updated securityheaders.com report after implementing changes.',
          why: 'Confirming headers are actually being sent ensures the configuration was applied correctly.',
        },
        developer: {
          action: 'Run `curl -I https://yoursite.com` and verify all three headers are present. Also check securityheaders.com for a full analysis.',
          tooling: 'curl -I https://yoursite.com | grep -iE "strict|frame|content-security"; securityheaders.com',
          notes: 'Check both www and non-www versions, and check on a page behind authentication if applicable. Headers must be sent on every response, not just the homepage.',
        },
      },
    ]
  ),

  'https-enforcement': plan(
    e => e.isHttps === false
      ? 'This site is not served over HTTPS. All connections are unencrypted, exposing visitors to interception and attack.'
      : 'HTTPS configuration issues were detected — HTTP may not correctly redirect to HTTPS.',
    [
      {
        title: 'Install and activate an SSL certificate',
        owner: {
          action: 'Contact your hosting provider and ask them to install a free SSL certificate (Let\'s Encrypt) and configure the site to use HTTPS. Most managed hosting providers do this in one click.',
          delegation: 'Ask your hosting provider: "Can you enable HTTPS for this domain? Do you support Let\'s Encrypt certificates?"',
          why: 'HTTPS encrypts the connection between visitors and your site, preventing eavesdropping and ensuring data integrity. Modern browsers mark HTTP sites as "Not Secure".',
        },
        developer: {
          action: 'Install an SSL certificate. Let\'s Encrypt is free via Certbot. Configure the web server to redirect all HTTP traffic to HTTPS.',
          tooling: 'Certbot (certbot.eff.org); your hosting panel\'s SSL section; Let\'s Encrypt.',
          notes: 'For most shared hosting, the control panel includes SSL setup. For VPS: `sudo certbot --nginx` or `sudo certbot --apache`. Automate renewal with a cron job.',
        },
      },
      {
        title: 'Redirect all HTTP to HTTPS',
        owner: {
          action: 'Ask your developer or hosting provider to set up a permanent redirect so any visitor who accesses http:// is immediately sent to the secure https:// version.',
          delegation: 'Ask: "Is there a 301 redirect from HTTP to HTTPS configured for all pages?"',
          why: 'Without a redirect, visitors who access the HTTP version remain on an unencrypted connection even if HTTPS is available.',
        },
        developer: {
          action: 'Configure a 301 permanent redirect. Nginx: `server { listen 80; return 301 https://$host$request_uri; }`. Apache: RewriteRule in .htaccess.',
          tooling: 'curl -I http://yoursite.com to verify 301 redirect is sent.',
          notes: 'Test that the redirect applies to all URLs, not just the homepage. Check www and non-www variants.',
        },
      },
    ]
  ),

  // ── Accessibility ──────────────────────────────────────────────────────────

  'accessibility-barriers': plan(
    e => {
      const parts = [];
      if (e.imgsNoAlt    != null && e.imgsNoAlt > 0)    parts.push(`${e.imgsNoAlt} image${e.imgsNoAlt > 1 ? 's' : ''} missing alt text`);
      if (e.emptyButtons != null && e.emptyButtons > 0)  parts.push(`${e.emptyButtons} button${e.emptyButtons > 1 ? 's' : ''} with no accessible label`);
      if (e.hasLang      === false)                       parts.push('language attribute missing from <html>');
      return parts.length > 0
        ? `Accessibility barriers found: ${parts.join('; ')}.`
        : 'This page has elements that are inaccessible to screen reader users.';
    },
    [
      {
        title: 'Add alt text to images',
        owner: {
          action: `${e => e.imgsNoAlt > 0 ? `${e.imgsNoAlt} image${e.imgsNoAlt > 1 ? 's are' : ' is'} missing alt text.` : 'Some images may be missing alt text.'} For each image, write a brief description of what it shows. Purely decorative images can have alt="" (empty).`,
          delegation: 'Ask your developer to find and fix all images missing alt attributes. Provide descriptions for any meaningful images.',
          why: 'Screen reader users rely on alt text to understand images. Without it, the image is either skipped or read as its filename.',
        },
        developer: {
          action: 'Find all <img> without alt. Add descriptive alt text to meaningful images; add alt="" to decorative ones. Also check CSS background images used for content (those require alternative text via another method).',
          tooling: 'axe DevTools browser extension; Chrome Lighthouse → Accessibility audit; grep for `<img` without `alt`.',
          notes: `Images missing alt: ${'{imgsNoAlt}'}. Good alt: "Product photo of blue denim jacket, front view". Bad alt: "image1.jpg" or "photo".`,
        },
      },
      {
        title: 'Label all interactive controls',
        owner: {
          action: `${e => e.emptyButtons > 0 ? `${e.emptyButtons} button${e.emptyButtons > 1 ? 's are' : ' is'} missing an accessible name.` : 'Some interactive controls may be missing accessible names.'} Ask your developer to add visible or hidden labels to all buttons, links, and form inputs.`,
          delegation: 'Ask: "Do all buttons and interactive elements have text or aria-label attributes that describe their action?"',
          why: 'Screen reader users navigate pages by interacting with controls. An unlabeled button or input gives no indication of its purpose.',
        },
        developer: {
          action: 'For buttons with only icon content: add aria-label="Close dialog" or include visually-hidden text. For all <input> elements: ensure a visible <label> is associated via for/id, or use aria-label.',
          tooling: 'axe DevTools; keyboard navigation test (Tab key only); screen reader test (NVDA/VoiceOver).',
          notes: `Empty buttons: ${'{emptyButtons}'}. Common patterns: icon buttons (search, close, hamburger menu), submit buttons with only images.`,
        },
      },
      {
        title: 'Set the HTML language attribute',
        owner: {
          action: 'Ask your developer to add a lang attribute to the <html> tag specifying the language of the page content (e.g., lang="en" for English).',
          delegation: 'Ask: "Does our HTML template include lang= on the <html> tag?"',
          why: 'The language attribute tells screen readers which language to use for pronunciation. Without it, a screen reader may pronounce English content with the wrong language rules.',
        },
        developer: {
          action: 'Set `<html lang="en">` (or appropriate BCP 47 language code) in the HTML template.',
          tooling: 'grep -i `<html` in your template; axe DevTools will flag this as a critical violation.',
          notes: `lang attribute present: ${'{hasLang}'}. Use specific codes: "en", "en-US", "fr", "es". If parts of the page are in a different language, use lang attribute on those elements too.`,
        },
      },
    ]
  ),

  'navigation-a11y': plan(
    e => {
      const parts = [];
      if (e.genericLinks != null && e.genericLinks > 0) parts.push(`${e.genericLinks} generic link${e.genericLinks > 1 ? 's' : ''} ("click here", "read more")`);
      if (e.hasSkipNav   === false)                      parts.push('no skip navigation link');
      return parts.length > 0
        ? `Navigation accessibility issues: ${parts.join('; ')}.`
        : 'Navigation elements on this page may be difficult to use with a keyboard or screen reader.';
    },
    [
      {
        title: 'Add a skip navigation link',
        owner: {
          action: 'Ask your developer to add a "Skip to main content" link as the very first focusable element on every page.',
          delegation: 'Ask: "Does the site have a skip navigation link that allows keyboard users to jump past the header?"',
          why: 'Keyboard and screen reader users must Tab through every navigation item on every page load unless a skip link lets them jump directly to the main content.',
        },
        developer: {
          action: 'Add `<a href="#main-content" class="skip-link">Skip to main content</a>` as the first element in <body>. Add `id="main-content"` to the <main> element. Style the link visually hidden by default, visible on :focus.',
          tooling: 'Tab to the top of the page — skip link should be the first focusable element.',
          notes: 'CSS pattern: `.skip-link { position: absolute; left: -9999px; } .skip-link:focus { left: 0; top: 0; }`. The link must actually work when activated.',
        },
      },
      {
        title: 'Replace generic link text',
        owner: {
          action: `${e => e.genericLinks > 0 ? `${e.genericLinks} link${e.genericLinks > 1 ? 's use' : ' uses'} generic text like "click here" or "read more".` : 'Some links use generic text.'} Each link's text should describe where it goes or what it does.`,
          delegation: 'Ask your developer or content editor to update generic link text to something descriptive.',
          why: 'Screen reader users often navigate by listing all links on a page. "Click here" in a list of links is meaningless without the surrounding sentence context.',
        },
        developer: {
          action: 'Search for links with text: "click here", "read more", "learn more", "here", "this". Rewrite to describe the destination: "Download the annual report" not "Click here". If the visual design requires short text, use aria-label or visually-hidden span for the full description.',
          tooling: 'axe DevTools; grep in template for `>click here<`, `>read more<`; screen reader navigation by links.',
          notes: `Generic links found: ${'{genericLinks}'}. Pattern for short visual text with long accessible name: <a href="..." aria-label="Read the 2024 annual report">Read more</a>.`,
        },
      },
    ]
  ),

};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the static guidance plan for a recommendation.
 *
 * @param {object} rec      - Recommendation object from the database (mapped)
 * @param {string} persona  - 'owner' | 'cms' | 'developer'
 * @returns {{ evidenceSummary, steps[] } | null}
 */
export function getStaticGuidance(rec, persona) {
  const groupKey = rec.group_key || rec.fingerprint;
  const builder  = STATIC_PLANS[groupKey];
  if (!builder) return null;

  // Build the plan using the rec's actual evidence
  const rawPlan = builder(rec);

  // Annotate that this is static guidance
  return {
    ...rawPlan,
    isStatic: true,
    persona,
  };
}

/**
 * Returns all supported group keys for testing / enumeration.
 */
export function getSupportedGroupKeys() {
  return Object.keys(STATIC_PLANS);
}
