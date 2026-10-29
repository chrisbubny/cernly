/**
 * lib/static-guidance.js
 *
 * Evidence-driven static guidance for every recommendation group × persona.
 *
 * This is the RELIABLE layer. It never depends on an external AI call.
 * AI personalization (lib/guidance.js) layers on top when it succeeds.
 *
 * Design rules:
 * - Steps are grounded in measured evidence where available; {{key}} tokens
 *   are substituted at render time from rec.evidence.
 * - No invented site-specific values. When evidence is unavailable, guidance
 *   describes what to investigate rather than what to change.
 * - Each persona ('owner', 'cms-admin', 'developer') receives different framing.
 *   cms-admin steps are absent when the task is purely hosting/server-level;
 *   the renderer falls back to step.owner in that case.
 * - Every group returns the same plan shape as AI-generated guidance so the
 *   renderer is persona/source-agnostic.
 */

// ─── Evidence substitution ────────────────────────────────────────────────────

function sub(template, evidence = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = evidence[key];
    if (val == null) return `[not measured in this scan]`;
    return String(val);
  });
}

function ms(val)  { return val != null ? `${val} ms`  : '[not measured]'; }
function kib(val) { return val != null ? `${val} KiB` : '[not measured]'; }

// ─── Plan builder ─────────────────────────────────────────────────────────────

/**
 * Build a static plan object matching the AI-generated plan schema.
 * steps[].id is omitted — caller assigns stable IDs.
 * Each step may optionally define a 'cms-admin' path; when absent the renderer
 * falls back to step.owner.
 */
function plan(evidenceSummaryFn, steps) {
  return (rec) => ({
    evidenceSummary: evidenceSummaryFn(rec.evidence || {}),
    steps: steps.map(s => {
      const step = {
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
      };
      if (s['cms-admin']) {
        step['cms-admin'] = {
          action:     sub(s['cms-admin'].action,     rec.evidence),
          delegation: sub(s['cms-admin'].delegation, rec.evidence),
          why:        sub(s['cms-admin'].why,        rec.evidence),
        };
      }
      return step;
    }),
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
        'cms-admin': {
          action: 'Open your CMS admin and review installed plugins and third-party integrations. Each plugin or script embed (analytics, live chat, social widgets) may contribute to JavaScript overhead. Deactivate any you are not actively using.',
          delegation: 'Review your plugin list and note any that add site-wide scripts. Ask your developer which contribute to blocking JavaScript.',
          why: 'Unused plugins and integrations are common sources of JavaScript overhead. Removing them reduces the problem at the source.',
        },
        developer: {
          action: 'Run Lighthouse (chrome://inspect or PageSpeed Insights) and open the Coverage panel in Chrome DevTools (Ctrl+Shift+P → Show Coverage) to identify unused JavaScript.',
          tooling: 'Chrome DevTools → Coverage tab; Lighthouse audit; webpack-bundle-analyzer if applicable.',
          notes: `TBT: ${ms('{{tbt}}')} — scripts contributing to this are listed in Lighthouse's "Avoid long main-thread tasks" and "Reduce JavaScript execution time" audits.`,
        },
      },
      {
        title: 'Defer or async non-critical scripts',
        owner: {
          action: 'Ask your developer to add `defer` or `async` to non-critical `<script>` tags, especially for analytics, chat widgets, and social buttons.',
          delegation: 'Request that any script not needed for the initial page display be loaded asynchronously.',
          why: 'Scripts loaded synchronously block the browser from rendering the page until they finish downloading and executing.',
        },
        'cms-admin': {
          action: 'Check your performance optimization plugin (if installed) for options to defer or delay JavaScript loading. Look for settings labeled "Defer JavaScript", "Delay JS execution", or "Load scripts asynchronously".',
          delegation: 'In your CMS performance plugin settings, enable any options for deferring non-critical scripts. If your CMS has no such plugin, ask your developer.',
          why: 'Scripts that load synchronously delay the page from appearing. Deferring them lets the visible content load first.',
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
        'cms-admin': {
          action: 'In your CMS admin, go to your plugins or extensions list. Deactivate and delete any plugins that are no longer actively used — every active plugin may load scripts on every page. Check for analytics snippets, social media embeds, or marketing tools that are no longer in use.',
          delegation: 'Review your installed plugins with your team. If a plugin was added for a temporary campaign or a feature you no longer use, remove it.',
          why: 'Every active plugin can add JavaScript to your pages. Removing unused ones is the safest and most direct way to reduce JavaScript overhead.',
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
        'cms-admin': {
          action: 'After deactivating plugins or enabling performance settings, run a speed test at pagespeed.web.dev and compare the Total Blocking Time score to your previous result.',
          delegation: 'Share the updated PageSpeed Insights report with your developer or team to confirm the change made a measurable difference.',
          why: 'Without measuring, it is easy to make changes that feel like improvements but do not affect the actual score.',
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
        'cms-admin': {
          action: 'Check if your CMS has an image optimization plugin installed. These plugins often convert images to WebP automatically when you upload them, or can process your existing media library in bulk. Look for settings labeled "WebP conversion" or "automatic image optimization" in your installed plugins.',
          delegation: 'If no image optimization plugin is installed, ask your developer or hosting provider whether the server can serve WebP images automatically, or recommend an appropriate plugin.',
          why: 'WebP images are typically 25–35% smaller than JPEG at the same quality. An optimization plugin handles the conversion without requiring you to manually process each image.',
        },
        developer: {
          action: 'Convert images to WebP/AVIF. For the LCP image, prioritize highest-quality conversion. Use <picture> with srcset for browser compatibility.',
          tooling: 'Squoosh CLI: `npx squoosh-cli --webp auto input.jpg`; cwebp; ImageMagick; Sharp (Node.js).',
          notes: 'Use <picture> element with WebP source and JPEG fallback. Or configure your CDN/server to serve WebP automatically based on Accept header.',
        },
      },
      {
        title: 'Resize images to display dimensions',
        owner: {
          action: 'When uploading images, make sure they are no larger than the size they will display on screen. Ask your developer what maximum pixel dimensions each image slot requires.',
          delegation: 'Ask your developer to audit which images are being served much larger than their display size.',
          why: 'Serving a 2000px image in a 400px slot wastes bandwidth — the browser downloads far more data than necessary.',
        },
        'cms-admin': {
          action: 'Check your CMS media settings to confirm that image size limits are configured correctly. Most CMSs generate multiple image sizes automatically — verify that the sizes set match your theme or layout requirements. When uploading new images, size them close to the largest they will be displayed before uploading.',
          delegation: 'Review your media settings with your developer or theme documentation to confirm the generated image sizes match your page layouts.',
          why: 'Uploading oversized images causes the browser to download far more data than the page needs to display them.',
        },
        developer: {
          action: 'Audit with Lighthouse "Properly size images" audit. Generate responsive image variants for key breakpoints and use srcset with sizes attribute.',
          tooling: 'Lighthouse; responsive-images-generator npm package; your image processing pipeline (Sharp, ImageMagick, CDN transforms).',
          notes: 'Check images with a viewport width between 320px and 1440px. Hero and LCP images benefit most from srcset.',
        },
      },
      {
        title: 'Add lazy loading to below-fold images',
        owner: {
          action: 'Ask your developer to add lazy loading to images that are not visible when the page first loads. This is a small code change with measurable impact.',
          delegation: 'Request that `loading="lazy"` be added to all images below the fold.',
          why: 'Images that are not visible on initial load do not need to download immediately. Lazy loading defers them until the user scrolls.',
        },
        'cms-admin': {
          action: 'Check your CMS or page builder settings for a lazy loading option — many modern CMSs and page builders enable this by default or offer it as a toggle. Look in image settings, performance settings, or your optimization plugin. If available, enable it globally.',
          delegation: 'If lazy loading is not available as a setting, ask your developer to add it to the theme templates.',
          why: 'Images below the fold do not need to load immediately. Lazy loading defers them until the user scrolls, reducing initial page weight.',
        },
        developer: {
          action: 'Add `loading="lazy"` to all `<img>` tags below the fold. Do NOT add it to the LCP image or any images visible in the initial viewport.',
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
          delegation: 'Ask: "Our Time to First Byte is {{ttfb}}. Is this a server, CDN, or application-level issue?"',
          why: 'A slow server delays everything else on the page — every subsequent resource starts downloading later than it should.',
        },
        developer: {
          action: 'Use server logs and APM tooling to identify where time is being spent: DNS lookup, TLS handshake, waiting (TTFB), or content transfer.',
          tooling: 'Chrome DevTools → Network → Timing tab on the document request; curl -o /dev/null -s -w "%{time_starttransfer}" https://yoursite.com',
          notes: `TTFB target: < 600 ms (Lighthouse "good"). Current: {{ttfb}} ms.`,
        },
      },
      {
        title: 'Enable and configure caching',
        owner: {
          action: 'Ask your hosting provider or developer to enable page caching if it is not already active. Many hosting plans include this as a setting.',
          delegation: 'Ask: "Is full-page caching enabled? Are static assets served with long cache TTLs?"',
          why: 'Caching serves previously generated pages instantly, bypassing database queries and server processing.',
        },
        'cms-admin': {
          action: 'Check if your CMS has a caching plugin installed and active. Most CMSs have dedicated caching plugins that can dramatically improve server response time. Look in your plugin settings for "Clear Cache" or "Cache Settings". If no caching plugin is active, ask your developer or hosting provider about enabling one appropriate for your setup.',
          delegation: 'If a caching plugin is installed, verify it is active and its cache is not empty. Check with your hosting provider whether they offer server-level caching as part of your plan.',
          why: 'Caching stores pre-built pages so the server does not need to rebuild them for every visitor, directly reducing Time to First Byte.',
        },
        developer: {
          action: 'Confirm cache-control headers on both HTML documents and static assets. Enable server-side page caching.',
          tooling: 'curl -I https://yoursite.com — check Cache-Control, Expires, ETag, Age headers.',
          notes: 'Static assets (CSS, JS, images with hashed filenames) can safely use max-age=31536000. HTML should use short or no-store depending on personalization.',
        },
      },
      {
        title: 'Add a CDN for static assets',
        owner: {
          action: 'Ask your developer or hosting provider whether your site uses a Content Delivery Network (CDN). If not, ask about enabling one — many hosting plans include this.',
          delegation: 'Ask: "Are our static files served from a CDN close to our visitors?"',
          why: 'A CDN serves files from servers geographically close to each visitor, reducing network latency.',
        },
        'cms-admin': {
          action: 'Contact your hosting provider and ask whether CDN delivery is included with your plan or available as an upgrade. Some CMS-specific hosts enable CDN automatically; others offer it as a setting in their dashboard. Check your hosting control panel for a CDN option.',
          delegation: 'Ask your hosting provider: "Is a CDN included with my plan, and how do I enable it for my site?"',
          why: 'A CDN serves your pages and files from a location close to each visitor, cutting the network time for every resource on the page.',
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
          action: 'Ask your hosting provider or developer to enable Gzip or Brotli compression for text files. This is usually a one-line server configuration.',
          delegation: 'Ask: "Is Brotli or Gzip compression enabled for text content on our server?"',
          why: 'Text compression reduces transferred file sizes by 60–80%, with no change required to source files.',
        },
        'cms-admin': {
          action: 'Text compression is controlled at the server level, not through a CMS. Contact your hosting provider and ask whether Brotli or Gzip compression is enabled. Most managed hosting providers enable this by default — if yours does not, it is a single-item support request.',
          delegation: 'Ask your hosting provider: "Is text compression (Gzip or Brotli) enabled for our site? If not, can you enable it?"',
          why: 'Text compression reduces the amount of data the browser must download, with no visible change to the page and typically no changes to your content or CMS.',
        },
        developer: {
          action: 'Verify text compression is active. Nginx: `gzip on; gzip_types text/html text/css application/javascript`. Apache: enable mod_deflate. For Brotli: enable mod_brotli.',
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
        'cms-admin': {
          action: 'Check your performance or optimization plugin for options to minify or remove unused CSS. Some optimization plugins offer "critical CSS" generation or unused CSS removal. Also check whether you have inactive themes or unused page builder styles loading on every page.',
          delegation: 'Ask your developer whether your theme or installed plugins load large CSS files that are not used on every page, and how much of it could be removed or deferred.',
          why: 'CSS frameworks and theme stylesheets often include rules for features not used on every page. Removing or deferring these reduces the data the browser must process before rendering.',
        },
        developer: {
          action: 'Use Chrome DevTools Coverage panel to identify unused CSS percentage. Remove unused utility classes or configure your CSS framework to only ship used styles.',
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
        'cms-admin': {
          action: 'Run a speed test at pagespeed.web.dev or webpagetest.org for your page. Review the results for large resources. Common CMS contributors to page weight include high-resolution images, multiple page builder scripts, and embedded fonts. Address what you can directly: remove unused plugins, replace large images with optimized versions, and disable any unused page builder components.',
          delegation: 'Share the speed test results with your developer and ask them to identify which resources are contributing the most weight.',
          why: 'Pages that download more data take longer to load, especially for mobile visitors or those on slower connections.',
        },
        developer: {
          action: 'Open Chrome DevTools → Network, reload the page, and sort by size. Identify resources over 100 KiB. Evaluate each: can it be compressed, deferred, or replaced with a lighter alternative?',
          tooling: 'Chrome DevTools → Network; WebPageTest waterfall; Lighthouse → "Avoid enormous network payloads".',
          notes: 'Lighthouse flags total page weight > 1,600 KiB. Fonts, third-party scripts, and uncompressed images are common heavy resources.',
        },
      },
    ]
  ),

  // ── Finding-specific plans for resource-efficiency sub-findings ────────────
  // When the user opens GuidedFix from 'Reduce unused CSS', they should see
  // CSS-focused guidance — not text compression. These entries are tried first
  // when focusFingerprintId matches, before the group-level 'resource-efficiency' plan.

  'lh:unused-css-rules': plan(
    e => e.unusedCssKib != null
      ? `The page loads ${kib(e.unusedCssKib)} of CSS that is not applied to any visible element. Removing or deferring unused CSS reduces download size and speeds up rendering.`
      : 'The page loads CSS that is not applied to any element, wasting bandwidth and slowing rendering.',
    [
      {
        title: 'Identify which stylesheets carry unused CSS',
        owner: {
          action: 'Ask your developer to identify which CSS files on the page contain rules that are never applied. CSS frameworks and page builder themes are the most common sources.',
          delegation: 'Ask: "Which stylesheets loaded on this page have the most unused rules, and what is the easiest way to reduce them?"',
          why: 'Knowing the source of unused CSS (framework, plugin, theme) determines the fastest fix — it may be as simple as disabling an unused stylesheet.',
        },
        'cms-admin': {
          action: 'Check whether your theme or page builder has an option to load styles only on pages that need them. Also check for inactive or unused themes — some CMSs load styles from inactive themes on every page. Disable any stylesheet or plugin you are not actively using.',
          delegation: 'Ask your developer: "Which CSS files loaded on our pages contain the most unused rules? Can we disable them, swap to a lighter theme, or configure our framework to only ship what is used?"',
          why: 'Themes and plugins often include CSS for features you are not using. Disabling unused plugins or switching to a leaner theme can eliminate large amounts of unused CSS with no code changes.',
        },
        developer: {
          action: 'Open Chrome DevTools → Coverage (Ctrl+Shift+P → Show Coverage → reload). Sort stylesheets by unused bytes. Target any file with > 20% unused rules. Configure your CSS framework (Tailwind JIT, PurgeCSS, or equivalent) to only ship selectors present in your templates.',
          tooling: 'Chrome DevTools → Coverage; PurgeCSS; UnCSS; Tailwind JIT purge config; Lighthouse → "Reduce unused CSS" audit.',
          notes: `Lighthouse flagged unused CSS rules. Common sources: Bootstrap/Tailwind without purging, WooCommerce shop styles on non-shop pages, page builder CSS loaded globally.`,
        },
      },
      {
        title: 'Remove or defer the unused CSS',
        owner: {
          action: 'Once your developer has identified the source, ask them to remove or defer the unused styles. For large frameworks, "tree-shaking" removes unused classes at build time.',
          delegation: 'Ask: "Can we configure the build process to strip CSS classes that are not used in our templates, or conditionally load stylesheets only on the pages that need them?"',
          why: 'Removing unused CSS means the browser downloads and parses less code on every page load — directly improving performance scores.',
        },
        'cms-admin': {
          action: 'If your optimization plugin supports it, enable unused CSS removal or "critical CSS" generation. WP Rocket, LiteSpeed Cache, and similar tools include this feature. Test the page after enabling it to confirm nothing broke visually.',
          delegation: 'Ask your developer to verify the visual result after removing unused CSS, as aggressive removal can sometimes strip needed styles.',
          why: 'Automated CSS optimization can remove a significant portion of unused rules without manual editing, particularly for WordPress or similar CMS sites.',
        },
        developer: {
          action: 'For utility-first frameworks: ensure JIT/purge is configured to scan all template files. For custom CSS: audit manually or with UnCSS. For third-party libraries: load them only on pages that use them (conditional enqueue in WordPress, dynamic import in JS).',
          tooling: 'PurgeCSS CLI; Tailwind CSS `content` config; WordPress `wp_enqueue_style` with conditional checks.',
          notes: 'After removing unused CSS, re-run the Lighthouse audit to confirm the saving. A >20% reduction in CSS size is common for sites using a CSS framework without purging.',
        },
      },
    ]
  ),

  'lh:uses-text-compression': plan(
    e => `The server is not compressing text assets (HTML, CSS, JavaScript) before sending them. Enabling Gzip or Brotli compression typically reduces transferred file sizes by 60–80%.`,
    [
      {
        title: 'Confirm compression is missing',
        owner: {
          action: 'Ask your developer or hosting provider whether Brotli or Gzip compression is enabled for your site. This is a server setting, not a content change.',
          delegation: 'Ask: "Is text compression (Gzip or Brotli) currently enabled on our server? If not, is it something you can enable in your hosting control panel?"',
          why: 'Text compression is one of the highest-impact, lowest-effort server optimizations. Most hosting providers can enable it in minutes.',
        },
        'cms-admin': {
          action: 'Text compression is controlled at the server level, not through your CMS. Contact your hosting provider and ask whether Brotli or Gzip compression is enabled. For managed WordPress hosts, this is usually on by default — confirm with their support if unsure.',
          delegation: 'Contact your host and ask: "Is Brotli or Gzip compression enabled for text content on our server? If not, can you enable it?"',
          why: 'Compression reduces the data the browser must download, directly speeding up the page without any changes to your content or CMS settings.',
        },
        developer: {
          action: 'Verify with: `curl -H "Accept-Encoding: br,gzip" -I https://yoursite.com | grep -i content-encoding`. No `content-encoding` header means compression is off.',
          tooling: 'curl; Chrome DevTools → Network → response headers → content-encoding; WebPageTest.',
          notes: 'Nginx: `gzip on; gzip_types text/html text/css application/javascript;`. Apache: enable mod_deflate. Brotli: mod_brotli. CDN (Cloudflare, Fastly): toggle in dashboard.',
        },
      },
      {
        title: 'Enable compression on the server',
        owner: {
          action: 'Ask your hosting provider or developer to enable compression. For most managed hosts, this is a single support ticket or control panel toggle.',
          delegation: 'Share this finding and ask: "Can you enable Brotli compression for text files? If that is not available, Gzip is the standard fallback."',
          why: 'Compression can be enabled without changing any site content. It is one of the quickest wins available for server-side performance.',
        },
        'cms-admin': {
          action: 'Some optimization plugins (W3 Total Cache, WP Super Cache, LiteSpeed Cache) include compression settings. Check your plugin\'s server settings panel. Otherwise, contact your host — most enable this on request or by default.',
          delegation: 'Ask your developer to verify compression is enabled after any changes and share the result from the compression test.',
          why: 'A properly configured server will compress text assets automatically on every request, with no ongoing content maintenance required.',
        },
        developer: {
          action: 'Enable at the server level (see tooling). After enabling, run `curl -H "Accept-Encoding: br,gzip" -I https://yoursite.com | grep -i content-encoding` to confirm the header is present. Re-run Lighthouse to verify the finding is resolved.',
          tooling: 'Nginx `gzip` module; Apache mod_deflate; mod_brotli; Cloudflare, Fastly, or AWS CloudFront compression settings.',
          notes: 'Brotli delivers ~15% better compression than Gzip and is supported by all modern browsers. On a CDN, enable compression in the CDN dashboard rather than the origin server.',
        },
      },
    ]
  ),

  'lh:total-byte-weight': plan(
    e => e.totalByteWeightKib != null
      ? `The page downloads ${kib(e.totalByteWeightKib)} of data. Lighthouse flags pages over 1,600 KiB. Reducing total page weight speeds up load on all connections, especially mobile.`
      : 'The page downloads more data than necessary, slowing load on all connections.',
    [
      {
        title: 'Identify the largest resources',
        owner: {
          action: 'Ask your developer to run a page weight audit and share the five largest files being downloaded. Knowing the biggest contributors tells you where to focus first.',
          delegation: 'Ask: "What are the five largest resources loaded on this page, and which ones can be made smaller?"',
          why: 'A small number of large resources usually accounts for most of the page weight. Fixing those has the largest impact.',
        },
        'cms-admin': {
          action: 'Run a speed test at pagespeed.web.dev for your page and review the resource list. Large images, video embeds, and multiple plugin scripts are common contributors in CMS environments.',
          delegation: 'Share the speed test with your developer and ask which resources are over 100 KiB and which can be reduced.',
          why: 'Seeing the actual resource list helps prioritize: compressing images is typically the quickest win, followed by removing unused plugins.',
        },
        developer: {
          action: 'Open Chrome DevTools → Network, reload, and sort by size. Note every resource over 100 KiB. Categorize by type: images (compress/resize), fonts (subset, swap), scripts (defer/remove), CSS (purge unused).',
          tooling: 'Chrome DevTools → Network; WebPageTest waterfall; Lighthouse "Avoid enormous network payloads" audit.',
          notes: `Total page weight: ${kib('{{totalByteWeightKib}')}. Lighthouse threshold: 1,600 KiB. Focus on resources that can be reduced without a rebuild (images, compression) before tackling scripts.`,
        },
      },
      {
        title: 'Reduce the heaviest assets',
        owner: {
          action: 'Ask your developer to compress or replace the largest resources. Images are usually the fastest win — they can often be compressed by 50% or more with no visible quality difference.',
          delegation: 'Ask: "Can we compress the largest images and defer or remove any scripts or stylesheets that are not critical for the page to display?"',
          why: 'Reducing total page weight shortens download time on every visit, improving performance for all users regardless of device or connection.',
        },
        'cms-admin': {
          action: 'If you manage images through your CMS, check whether an image optimization plugin is active (Imagify, ShortPixel, Smush, etc.). Also review whether any plugins or widgets added since the last audit are adding large scripts or stylesheets you are not using.',
          delegation: 'Ask your developer to confirm images are being optimized on upload and to identify any scripts added by plugins that are loading on every page unnecessarily.',
          why: 'Optimizing images at upload time and loading plugin scripts conditionally prevents page weight from growing with each new piece of content.',
        },
        developer: {
          action: 'Images: use sharp or Squoosh to compress; serve modern formats (WebP/AVIF). Scripts: defer non-critical, remove unused, split bundles. Fonts: subset to used characters, use `font-display: swap`. CSS: purge unused rules.',
          tooling: 'sharp; Squoosh; Google Fonts subsetting; webpack Bundle Analyzer; PurgeCSS; Lighthouse "Avoid enormous network payloads".',
          notes: 'After changes, re-run the Network audit and compare total transfer size. Target under 1,600 KiB; under 500 KiB is excellent for most pages.',
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
        'cms-admin': {
          action: 'Open the page in Chrome and watch it load. Note anything that moves after the initial content appears — images jumping into place, banners appearing, text blocks shifting. Also note whether the shift happens on every load or only sometimes. Share your observations with your developer.',
          delegation: 'Describe which elements move and when to your developer. The more specific you can be ("the hero image pushes the text down when it loads"), the faster they can diagnose the cause.',
          why: 'Layout shifts caused by different elements require different fixes. Identifying the shifting element saves diagnosis time.',
        },
        developer: {
          action: 'Open Chrome DevTools → Performance → record page load. Expand the "Experience" lane to see layout shifts. Click each shift to see what caused it.',
          tooling: 'Chrome DevTools Performance panel; Lighthouse CLS audit; web-vitals library for field data.',
          notes: `CLS score: {{cls}}. Target < 0.1 (good), < 0.25 (needs improvement).`,
        },
      },
      {
        title: 'Add size attributes to images and embeds',
        owner: {
          action: 'Ask your developer to add explicit width and height to all images, video thumbnails, and embedded content so the browser knows how much space to reserve before they load.',
          delegation: 'Ask: "Do all our images have explicit width and height attributes in the HTML?"',
          why: 'Without explicit dimensions, the browser cannot reserve space for images before they load, causing content to shift when the image arrives.',
        },
        'cms-admin': {
          action: 'When inserting or editing images in your CMS, check that the width and height fields are populated. Most CMS editors show these fields when you select an image. Also check your page builder — many builders have image dimension settings that should be filled in rather than left as "auto".',
          delegation: 'Ask your developer whether your CMS theme or page builder automatically outputs width and height attributes on images, and whether this needs to be enabled.',
          why: 'When a browser does not know the image dimensions in advance, it cannot reserve the right amount of space, causing the page to jump when the image loads.',
        },
        developer: {
          action: 'Add width and height attributes to all <img>, <video>, and <iframe> elements. For responsive images, also set aspect-ratio in CSS matching the intrinsic ratio.',
          tooling: 'Lighthouse "Image elements do not have explicit width and height" audit lists violations.',
          notes: 'For responsive images: set width/height matching intrinsic ratio, then `img { height: auto; }` in CSS. The browser uses the ratio to reserve space.',
        },
      },
      {
        title: 'Reserve space for late-loading content',
        owner: {
          action: 'If ads, cookie banners, or other injected content are causing the page to jump, ask your developer to reserve the correct amount of space for them before they appear.',
          delegation: 'Ask: "Can we add a placeholder with fixed dimensions for ads and banners so the page does not shift when they load?"',
          why: 'Content injected after load (ads, embeds, lazy components) pushes other content down, creating a jarring experience.',
        },
        'cms-admin': {
          action: 'If your site has a cookie banner or consent popup, check its settings for an option to reserve page space before it appears. Also check whether any widget areas, ad zones, or embedded content load after the rest of the page — these are common sources of layout shifts. Notify your developer about specific injected elements causing shifts.',
          delegation: 'Ask your developer to pre-size the containers for any dynamic content (cookie banners, ad slots, newsletter signup bars) so the page does not shift when they load.',
          why: 'Cookie consent banners and ads are especially common causes of layout shift. Giving them a pre-reserved slot prevents them from pushing content when they appear.',
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
          action: 'The page title is {{titleLength}} characters. Target 50–60 characters. It should clearly describe the page\'s content and include your primary keyword near the front.',
          delegation: 'Provide the desired page title to your developer or CMS editor for implementation.',
          why: 'The title tag appears in search results as the clickable headline. A clear, correctly-sized title improves both ranking and click-through rate.',
        },
        'cms-admin': {
          action: 'Edit the page in your CMS. If you have an SEO plugin installed, use its "SEO title" field (not the page title shown on the page itself — SEO plugins often separate these). Set a title of 50–60 characters that clearly describes the page and includes your main keyword. The SEO plugin should show you a character count.',
          delegation: 'If you are unsure which field controls the search result title, ask your developer to point you to the right field in your SEO plugin settings.',
          why: 'The SEO title (separate from the on-page heading) is what appears as the clickable headline in search results. Getting it right directly affects click-through rate.',
        },
        developer: {
          action: 'Update the <title> element to 50–60 characters. Place the primary keyword first. Use a unique title for every page.',
          tooling: 'Search for `<title>` in your template. Check for dynamic title generation in your CMS or framework.',
          notes: `Current title length: {{titleLength}} characters. Google typically truncates titles above ~60 characters.`,
        },
      },
      {
        title: 'Add a meta description',
        owner: {
          action: '{{descLength}} characters in current meta description. Write a 120–160 character summary of the page that explains what it offers and includes your target keyword.',
          delegation: 'Provide the desired meta description text to your developer or CMS editor.',
          why: 'Meta descriptions appear in search results and strongly influence whether someone clicks through.',
        },
        'cms-admin': {
          action: 'Edit the page in your CMS and find the meta description field — this is typically in your SEO plugin\'s section on the edit page, labeled "Meta description" or "SEO description". Write 120–160 characters summarizing the page. The SEO plugin should show a character counter and a preview of how it will appear in search results.',
          delegation: 'If you cannot find the meta description field, ask your developer to show you where it is in your SEO plugin. Most modern SEO plugins make this very accessible.',
          why: 'The meta description is the text that appears under the title in search results. A well-written one improves click-through rate even when it does not directly affect ranking.',
        },
        developer: {
          action: 'Add or update <meta name="description" content="..."> in the <head>. Target 120–160 characters. Make it unique per page.',
          tooling: 'Template search for `meta name="description"`; CMS SEO fields if available.',
          notes: `Current description length: {{descLength}} characters.`,
        },
      },
      {
        title: 'Add or fix the H1 tag',
        owner: {
          action: '{{h1Count}} H1 headings found. There should be exactly one. The H1 should be the page\'s primary heading and match the topic of the page.',
          delegation: 'Ask your developer or CMS editor to ensure exactly one H1 heading appears on this page.',
          why: 'The H1 tells search engines what the page is primarily about. Missing or multiple H1s weaken the page\'s topical clarity.',
        },
        'cms-admin': {
          action: 'In your CMS page editor, check the heading level of the main page heading. In most CMSs, the page or post title automatically becomes the H1. If you have added additional headings inside the content, ensure none of them are set to H1 — use H2 or H3 instead. Your page builder or content editor typically shows the heading level when you select a heading block.',
          delegation: 'If you are unsure how to check heading levels in your editor, ask your developer to review the page\'s heading structure.',
          why: 'Having exactly one H1 that matches the page topic helps search engines understand what the page is about. Multiple H1s or a missing H1 weakens this signal.',
        },
        developer: {
          action: '{{h1Count}} H1 tags found. Add a <h1> if missing, or reduce to a single <h1> demoting extras to <h2>. Align H1 text with the page topic and title tag.',
          tooling: 'Search page source for <h1; Chrome DevTools → Inspect heading hierarchy.',
          notes: `H1 count: {{h1Count}}. One per page is the standard.`,
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
          action: 'Ask your developer to add a canonical tag to this page. It tells search engines which URL is the "official" version to index.',
          delegation: 'Ask: "Does every page have a self-referencing canonical tag in the head?"',
          why: 'Without a canonical tag, search engines may split ranking signals across duplicate or near-duplicate URLs.',
        },
        'cms-admin': {
          action: 'Most SEO plugins add canonical tags automatically. Open your SEO plugin settings and confirm canonical URL generation is enabled — look for a "canonical URL" or "self-referencing canonical" option in the plugin\'s global settings. On individual pages, you can usually override or confirm the canonical URL in the SEO plugin\'s per-page panel.',
          delegation: 'Ask your developer to confirm whether your SEO plugin is outputting canonical tags correctly, or to check if any plugin or setting might be suppressing them.',
          why: 'Canonical tags tell search engines which URL to index when the same page can be accessed at multiple addresses. Most SEO plugins handle this automatically when correctly configured.',
        },
        developer: {
          action: 'Add <link rel="canonical" href="https://yourdomain.com/this-page-url/"> to the <head>. Use the exact, preferred URL including/excluding trailing slash consistently.',
          tooling: 'Search template for `rel="canonical"`. Check CMS SEO settings.',
          notes: 'Self-referencing canonicals are best practice even when there is no duplicate content risk. Ensure https and www/non-www is consistent.',
        },
      },
      {
        title: 'Add structured data markup',
        owner: {
          action: 'Ask your developer to add structured data (Schema.org markup) to key pages. At minimum: Organization on the homepage, Article on blog posts, Product on product pages.',
          delegation: 'Ask: "Which structured data types are most valuable for our site type, and can we implement them?"',
          why: 'Structured data enables rich results in search (star ratings, FAQ dropdowns, breadcrumbs) which increase click-through rates.',
        },
        'cms-admin': {
          action: 'Check whether your SEO plugin includes structured data or schema markup settings. Many SEO plugins have a dedicated section for enabling and configuring schema types (Article, Organization, LocalBusiness, etc.) without requiring any code. Look in your plugin settings for "Schema", "Structured Data", or "JSON-LD" options.',
          delegation: 'If your SEO plugin does not include structured data, ask your developer to recommend either a plugin upgrade or a structured data plugin compatible with your setup.',
          why: 'Structured data helps search engines display richer results — star ratings, FAQ answers, event details — which can significantly improve click-through rate.',
        },
        developer: {
          action: 'Implement JSON-LD structured data in the <head> or inline. Use Schema.org vocabulary. Validate with Google\'s Rich Results Test.',
          tooling: 'schema.org; Google Rich Results Test (search.google.com/test/rich-results); JSON-LD format recommended.',
          notes: 'Start with the highest-impact type for your content category. JSON-LD is preferred over Microdata.',
        },
      },
      {
        title: 'Fix image alt attributes',
        owner: {
          action: '{{imgsNoAlt}} images are missing alt text. For each image, write a brief description of what it shows. Purely decorative images can have alt="" (empty).',
          delegation: 'Ask your developer to audit all images on this page and add descriptive alt text.',
          why: 'Alt text helps search engines understand image content and is required for screen reader users.',
        },
        'cms-admin': {
          action: 'In your CMS media library, find images used on this page and check whether they have an "Alt Text" field filled in. Edit any that are missing alt text. When inserting images in the future, always fill in the alt text field before inserting. Most CMSs make this field visible and accessible in the image insert dialog.',
          delegation: 'Use your media library to identify images without alt text. Fill in descriptions for meaningful images. Ask your developer to check whether your theme or page builder passes the alt text through to the rendered HTML.',
          why: 'Alt text improves accessibility for screen reader users and helps search engines understand what images show, contributing to image search and overall content relevance.',
        },
        developer: {
          action: 'Find all <img> tags without alt attributes and add appropriate text. Purely decorative images should use alt="".',
          tooling: 'Grep for `<img` without `alt=`. Chrome DevTools → Elements search for img:not([alt]).',
          notes: `Images without alt: {{imgsNoAlt}}. Good alt text is descriptive and specific.`,
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
        'cms-admin': {
          action: 'Open your SEO plugin settings and look for a "Social" or "Open Graph" section. Enable Open Graph support and set a default social sharing image (minimum 1200×630 pixels). Most SEO plugins allow you to override the social title, description, and image on a per-page basis in the page editor.',
          delegation: 'Ask your developer to confirm which SEO plugin is handling social tags and where the social sharing settings are located.',
          why: 'Open Graph tags control how your links appear when shared on Facebook, LinkedIn, Slack, and other platforms. Setting a compelling title, description, and image makes shared links much more clickable.',
        },
        developer: {
          action: 'Add to the <head>: <meta property="og:title">, <meta property="og:description">, <meta property="og:image"> (min 1200×630px), <meta property="og:url">, <meta property="og:type">.',
          tooling: 'Facebook Sharing Debugger (developers.facebook.com/tools/debug); LinkedIn Post Inspector.',
          notes: 'The og:image should be at least 1200×630 pixels. Avoid images that are mostly text.',
        },
      },
      {
        title: 'Add Twitter Card tags',
        owner: {
          action: 'Ask your developer to add Twitter Card meta tags alongside the Open Graph tags.',
          delegation: 'Ask: "Do we have Twitter Card tags configured to control how our links display on X/Twitter?"',
          why: 'Twitter Card tags control the preview shown when links are shared on X/Twitter.',
        },
        'cms-admin': {
          action: 'In your SEO plugin, look for a Twitter or X section within the Social settings. Enable Twitter Card support and set the card type to "Summary with Large Image" for visual posts. You can usually upload a default Twitter image or rely on the Open Graph image. Check per-page social settings in your page editor to customize for important pages.',
          delegation: 'If your SEO plugin does not have Twitter Card settings, or if you are unsure whether they are enabled, ask your developer to check.',
          why: 'Twitter Card settings control how your links appear on X/Twitter. Without them, links may show only a plain URL with no preview image.',
        },
        developer: {
          action: 'Add: <meta name="twitter:card" content="summary_large_image">, <meta name="twitter:title">, <meta name="twitter:description">, <meta name="twitter:image">.',
          tooling: 'Twitter Card Validator (cards-dev.twitter.com/validator).',
          notes: 'summary_large_image is the most visually prominent card type. twitter:* tags fall back to og:* if absent.',
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
          action: 'Ask your hosting provider or developer to add the HSTS header. This tells browsers to always use HTTPS when connecting to your site.',
          delegation: 'Ask: "Can you add the Strict-Transport-Security header with max-age=31536000 to all HTTPS responses?"',
          why: 'Without HSTS, a user could be redirected from HTTP to HTTPS in a way that is vulnerable to interception.',
        },
        'cms-admin': {
          action: 'HSTS (Strict-Transport-Security) is a server-level header and cannot be set by a CMS plugin — it must be configured by your hosting provider. Contact your hosting provider\'s support team and ask them to add this header. You can forward this report to them as context. Some hosting control panels also include a "Security Headers" section where you can add it yourself.',
          delegation: 'Contact your hosting provider: "Our security scan shows the Strict-Transport-Security header is missing. Can you add it with max-age=31536000?" or share this report directly with them.',
          why: 'HSTS prevents browsers from ever loading your site over an insecure HTTP connection, even if a user types http:// manually.',
        },
        developer: {
          action: 'Add the Strict-Transport-Security response header to all HTTPS responses. Nginx: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`. Apache: equivalent Header directive.',
          tooling: 'curl -I https://yoursite.com | grep -i strict; securityheaders.com',
          notes: 'Start with max-age=86400 (1 day) to test, then increase to 31536000 (1 year). Only add includeSubDomains if ALL subdomains are on HTTPS.',
        },
      },
      {
        title: 'Add X-Frame-Options',
        owner: {
          action: 'Ask your developer or hosting provider to add the X-Frame-Options header. This prevents other websites from embedding your pages in iframes.',
          delegation: 'Ask: "Can you add X-Frame-Options: SAMEORIGIN to our server responses?"',
          why: 'Clickjacking attacks overlay invisible iframes on legitimate sites to trick users into performing unintended actions.',
        },
        'cms-admin': {
          action: 'For X-Frame-Options and similar headers (X-Content-Type-Options, Referrer-Policy, Permissions-Policy): if your site runs on WordPress, a security plugin can add these headers without requiring hosting or code access — look for "All In One Security", "Really Simple Security", or your caching plugin\'s security settings. If you are not on WordPress or prefer not to use a plugin, check whether your hosting control panel has a "Security Headers" section. As a last resort, contact your hosting provider\'s support team.',
          delegation: 'If on WordPress: check your existing security or caching plugin for a "Security Headers" setting. Otherwise, contact your hosting provider: "Can you add the X-Frame-Options: SAMEORIGIN header to our site responses?"',
          why: 'This header prevents other sites from embedding your pages in invisible frames, a technique used in clickjacking attacks.',
        },
        developer: {
          action: 'Add X-Frame-Options: SAMEORIGIN header to all responses. Nginx: `add_header X-Frame-Options "SAMEORIGIN" always;`.',
          tooling: 'curl -I https://yoursite.com | grep -i frame; securityheaders.com',
          notes: 'Use SAMEORIGIN (allows framing by same site) or DENY (no framing at all). DENY is more secure.',
        },
      },
      {
        title: 'Add Content-Security-Policy',
        owner: {
          action: 'Ask your developer to add a Content Security Policy header. This is more complex than other headers — it requires testing to avoid breaking site functionality.',
          delegation: 'Ask: "Can you implement a Content-Security-Policy starting with report-only mode so we can see what would be blocked before enforcing it?"',
          why: 'CSP restricts which scripts, styles, and resources the browser is allowed to load, reducing the risk of XSS attacks.',
        },
        'cms-admin': {
          action: 'Content Security Policy is a complex server-level configuration that requires careful testing — an incorrect CSP can break your site\'s functionality. This task should be handled by your developer or hosting provider. Forward this report and note that the scan identified a missing CSP header.',
          delegation: 'Share this report with your developer and ask: "Can you implement a Content-Security-Policy in report-only mode first so we can see what it would block?" This is a developer task, not a CMS setting.',
          why: 'CSP is one of the most powerful browser security features, but it requires expertise to implement without breaking your site. It is worth addressing but should not be rushed.',
        },
        developer: {
          action: 'Start in report-only mode: add Content-Security-Policy-Report-Only header with a restrictive policy and report-uri. Analyze reports, then switch to enforcement.',
          tooling: 'Report-URI.com (free tier); CSP Evaluator (csp-evaluator.withgoogle.com); Chrome DevTools Console for violations.',
          notes: 'A minimal starting policy: `default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:;`.',
        },
      },
      {
        title: 'Verify headers are live',
        owner: {
          action: 'After your developer makes changes, visit securityheaders.com, enter your site URL, and check that the report shows a grade improvement.',
          delegation: 'Ask your developer to share the updated securityheaders.com report after implementing changes.',
          why: 'Confirming headers are actually being sent ensures the configuration was applied correctly.',
        },
        'cms-admin': {
          action: 'Once your hosting provider or developer has made the changes, visit securityheaders.com and enter your site\'s URL. The report will show which headers are present and assign a grade. Compare this to the findings in this scan report.',
          delegation: 'Ask your hosting provider or developer to run securityheaders.com after making changes and share the report with you.',
          why: 'Verifying the headers are live confirms the hosting changes were applied correctly and shows whether the security grade improved.',
        },
        developer: {
          action: 'Run `curl -I https://yoursite.com` and verify all three headers are present. Also check securityheaders.com for a full analysis.',
          tooling: 'curl -I https://yoursite.com | grep -iE "strict|frame|content-security"; securityheaders.com',
          notes: 'Check both www and non-www versions. Headers must be sent on every response, not just the homepage.',
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
          why: 'HTTPS encrypts the connection between visitors and your site. Modern browsers mark HTTP sites as "Not Secure".',
        },
        'cms-admin': {
          action: 'SSL certificates are installed through your hosting provider, not through your CMS. Log in to your hosting control panel and look for an SSL or HTTPS section — most managed hosting providers offer a one-click SSL activation. If you cannot find it, contact your hosting provider\'s support.',
          delegation: 'Contact your hosting provider: "How do I enable HTTPS / install an SSL certificate for my domain?" Most support teams can walk you through this in minutes.',
          why: 'HTTPS is a basic requirement for modern websites. Browsers show a "Not Secure" warning for HTTP sites, which damages visitor trust.',
        },
        developer: {
          action: 'Install an SSL certificate. Let\'s Encrypt is free via Certbot. Configure the web server to redirect all HTTP traffic to HTTPS.',
          tooling: 'Certbot (certbot.eff.org); your hosting panel\'s SSL section; Let\'s Encrypt.',
          notes: 'For most shared hosting, the control panel includes SSL setup. For VPS: `sudo certbot --nginx` or `sudo certbot --apache`.',
        },
      },
      {
        title: 'Redirect all HTTP to HTTPS',
        owner: {
          action: 'Ask your developer or hosting provider to set up a permanent redirect so any visitor who accesses http:// is immediately sent to the secure https:// version.',
          delegation: 'Ask: "Is there a 301 redirect from HTTP to HTTPS configured for all pages?"',
          why: 'Without a redirect, visitors who access the HTTP version remain on an unencrypted connection.',
        },
        'cms-admin': {
          action: 'Check your hosting control panel for an option to force HTTPS or enable an HTTP-to-HTTPS redirect — many hosts provide a toggle for this in their SSL settings. Some CMSs also have a "Force HTTPS" setting in their security or general settings. If neither is available, contact your hosting provider.',
          delegation: 'Ask your hosting provider: "Can you confirm that all HTTP traffic is being permanently redirected to HTTPS?" or check the SSL section of your hosting control panel for a "Force SSL" option.',
          why: 'Even with HTTPS available, visitors who type http:// or follow old links will be on an insecure connection unless a redirect is in place.',
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
          action: '{{imgsNoAlt}} images are missing alt text. For each image, write a brief description of what it shows. Purely decorative images can have alt="" (empty).',
          delegation: 'Ask your developer to find and fix all images missing alt attributes. Provide descriptions for meaningful images.',
          why: 'Screen reader users rely on alt text to understand images. Without it, the image is either skipped or read as its filename.',
        },
        'cms-admin': {
          action: 'In your CMS media library, search for images used on this page. Edit each one and check whether the "Alt Text" field is filled in. Add descriptive alt text to every meaningful image ("Two doctors reviewing a patient chart", not "doctors" or "stock-photo-1234.jpg"). Leave the alt field empty (not blank — the field itself should exist but be empty) for purely decorative images.',
          delegation: 'Work through your media library and add alt text to images that are missing it. If your CMS does not provide a media library alt text field, ask your developer how alt text is managed for images on this site.',
          why: 'Alt text is how screen readers convey image content to users who cannot see them. It is also an accessibility compliance requirement in many jurisdictions.',
        },
        developer: {
          action: 'Find all <img> without alt. Add descriptive alt text to meaningful images; add alt="" to decorative ones.',
          tooling: 'axe DevTools browser extension; Chrome Lighthouse → Accessibility audit; grep for `<img` without `alt`.',
          notes: `Images missing alt: {{imgsNoAlt}}. Good alt: "Product photo of blue denim jacket, front view". Bad alt: "image1.jpg" or "photo".`,
        },
      },
      {
        title: 'Label all interactive controls',
        owner: {
          action: '{{emptyButtons}} buttons are missing an accessible name. Ask your developer to add visible or hidden labels to all buttons, links, and form inputs.',
          delegation: 'Ask: "Do all buttons and interactive elements have text or aria-label attributes that describe their action?"',
          why: 'Screen reader users navigate pages by interacting with controls. An unlabeled button gives no indication of its purpose.',
        },
        'cms-admin': {
          action: 'This fix typically requires template or code changes and should be handled by your developer. However, you can help by identifying unlabeled controls: use your keyboard (Tab key) to navigate the page and note any buttons or links where it is unclear what they do. Report these to your developer with the page and location.',
          delegation: 'Share this report with your developer and ask them to identify and add accessible labels to all buttons and interactive elements that are missing them. Provide the page URL and any controls you noticed.',
          why: 'Unlabeled buttons and links are inaccessible to screen reader users and may also be a legal compliance issue.',
        },
        developer: {
          action: 'For buttons with only icon content: add aria-label="Close dialog" or visually-hidden text. For all <input> elements: ensure a visible <label> is associated via for/id.',
          tooling: 'axe DevTools; keyboard navigation test (Tab key only); screen reader test (NVDA/VoiceOver).',
          notes: `Empty buttons: {{emptyButtons}}. Common patterns: icon buttons (search, close, hamburger menu), submit buttons with only images.`,
        },
      },
      {
        title: 'Set the HTML language attribute',
        owner: {
          action: 'Ask your developer to add a lang attribute to the <html> tag specifying the language of the page content (e.g., lang="en" for English).',
          delegation: 'Ask: "Does our HTML template include lang= on the <html> tag?"',
          why: 'The language attribute tells screen readers which language to use for pronunciation.',
        },
        'cms-admin': {
          action: 'Check your CMS settings for a language or locale option — many CMSs set the HTML lang attribute based on the site language configured in settings. Look in your CMS settings under "Language", "General", or "Site Identity". If the setting exists, make sure it is set correctly to your site\'s primary language. If you cannot find it, ask your developer.',
          delegation: 'Check your CMS language settings and confirm the site language is correctly set. Ask your developer whether your theme outputs the lang attribute on the <html> tag.',
          why: 'Screen readers use the language attribute to pronounce content correctly. It is a fundamental accessibility requirement.',
        },
        developer: {
          action: 'Set `<html lang="en">` (or appropriate BCP 47 language code) in the HTML template.',
          tooling: 'grep -i `<html` in your template; axe DevTools will flag this as a critical violation.',
          notes: `lang attribute present: {{hasLang}}. Use specific codes: "en", "en-US", "fr", "es".`,
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
          why: 'Keyboard users must Tab through every navigation item on every page unless a skip link lets them jump directly to main content.',
        },
        'cms-admin': {
          action: 'Check your theme settings for an accessibility section — some themes include a "Skip to content" link as a configurable option. If your theme does not offer this, it needs to be added to the theme template. This is a developer task; share this report and ask your developer to add a skip navigation link.',
          delegation: 'Share this report with your developer or theme developer and ask: "Can we add a \'Skip to main content\' accessibility link to the top of the page?" Many themes include this as a standard feature.',
          why: 'Without a skip navigation link, keyboard-only users must press Tab many times to navigate past repeated header and menu links on every page.',
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
          action: '{{genericLinks}} links use generic text like "click here" or "read more". Each link\'s text should describe where it goes or what it does.',
          delegation: 'Ask your developer or content editor to update generic link text to something descriptive.',
          why: 'Screen reader users often navigate by listing all links on a page. "Click here" in a list of links is meaningless without surrounding context.',
        },
        'cms-admin': {
          action: 'In your CMS page and post editor, search for links that read "click here", "read more", "learn more", or "here". Edit these links to use descriptive text instead — for example, "Download the 2024 annual report" instead of "Click here". For content managed through page builders, open each section and update the link button text.',
          delegation: 'Review content across your key pages for generic link phrases. Update them directly in your CMS editor where possible, and flag any that are in theme templates (navigation, footer, repeated components) for your developer to fix.',
          why: 'Link text should describe the destination without needing the surrounding sentence for context. This is essential for screen reader users who navigate pages by jumping between links.',
        },
        developer: {
          action: 'Search for links with text: "click here", "read more", "learn more", "here", "this". Rewrite to describe the destination. Use aria-label or visually-hidden span when the visual design requires short text.',
          tooling: 'axe DevTools; grep in template for `>click here<`, `>read more<`; screen reader navigation by links.',
          notes: `Generic links found: {{genericLinks}}. Pattern for short visual text with long accessible name: <a href="..." aria-label="Read the 2024 annual report">Read more</a>.`,
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
 * @param {string} persona  - 'owner' | 'cms-admin' | 'developer'
 * @returns {{ evidenceSummary, steps[], isStatic, planSource, persona } | null}
 */
/**
 * @param {object} rec
 * @param {string} persona
 * @param {string|null} focusFingerprintId - When provided, tries finding-specific plan
 *   (e.g. 'lh:unused-css-rules') before the group-level plan. This ensures guidance
 *   for "Reduce unused CSS" focuses on CSS, not text compression.
 */
export function getStaticGuidance(rec, persona, focusFingerprintId = null) {
  const groupKey = rec.group_key || rec.fingerprint;

  // Try finding-specific plan first (e.g. 'lh:unused-css-rules')
  // Fall back to group-level plan (e.g. 'resource-efficiency')
  const builder = (focusFingerprintId && STATIC_PLANS[focusFingerprintId])
    ? STATIC_PLANS[focusFingerprintId]
    : STATIC_PLANS[groupKey];

  if (!builder) return null;

  const rawPlan = builder(rec);

  return {
    ...rawPlan,
    isStatic:   true,
    planSource: 'static',
    persona,
  };
}

/**
 * Returns all supported group keys for testing / enumeration.
 */
export function getSupportedGroupKeys() {
  return Object.keys(STATIC_PLANS);
}
