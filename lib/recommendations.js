// lib/recommendations.js
// Deterministic recommendation grouping + AI enrichment layer.
//
// Stage 1 — Evidence-Rich Recommendations
// Synthesizes related analyzer findings into human-readable, prioritized
// recommendations. Groups are defined statically so that the logic is
// transparent and testable. AI is responsible only for enriching the language;
// it is never given authority to invent measurements or determine groupings.
//
// Stage 1 changes:
//   - buildBaseRecommendations now stores full issue objects as
//     supporting_findings (message, description, displayValue, severity,
//     category, source, fingerprintId, fix) — not just IDs.
//   - enrichRecommendationsWithAI sends actual finding messages and
//     displayValues in the prompt, enabling evidence-grounded responses.
//   - Field responsibility cleanup:
//       what_we_found  — what Cernly detected (factual, from evidence; stored
//                        in the 'explanation' DB column for backward compat)
//       why_it_matters — real-world impact (no invented numbers)
//       actions[]      — ordered concrete steps
//       verification_approach — how to confirm the fix worked
//   - finding_fingerprints (IDs array) is still populated for backward compat.
//
// Run independently: no React, no Next.js deps.

// ---------------------------------------------------------------------------
// 1. RECOMMENDATION GROUPS
// Each group maps a stable ID (the recommendation's "fingerprint") to a set
// of finding fingerprints (from assignIssueFingerprintIds) that belong to it.
// A finding may belong to more than one group; duplicate presentation is
// handled in the calling layer.
// ---------------------------------------------------------------------------

export const RECOMMENDATION_GROUPS = {
  'js-overhead': {
    fingerprint: 'js-overhead',
    title: 'Reduce JavaScript overhead',
    category: 'Performance',
    defaultPriority: 'high',
    findingPrefixes: [
      'lh:unused-javascript',
      'lh:total-blocking-time',
      'lh:mainthread-work-breakdown',
      'lh:bootup-time',
      'lh:render-blocking-resources',
      'lh:third-party-facades',
      'lh:no-document-write',
      'lh:uses-passive-event-listeners',
    ],
  },
  'image-optimization': {
    fingerprint: 'image-optimization',
    title: 'Optimize images',
    category: 'Performance',
    defaultPriority: 'high',
    findingPrefixes: [
      'lh:uses-optimized-images',
      'lh:uses-responsive-images',
      'lh:uses-webp-images',
      'lh:efficiently-encode-images',
      'lh:image-size-responsive',
      'lh:uses-lazy-loading',
      'lh:image-aspect-ratio',
    ],
  },
  'server-performance': {
    fingerprint: 'server-performance',
    title: 'Improve server speed and caching',
    category: 'Performance',
    defaultPriority: 'medium',
    findingPrefixes: [
      'lh:server-response-time',
      'lh:uses-long-cache-ttl',
      'lh:time-to-first-byte',
      'lh:redirects',
      'lh:uses-rel-preconnect',
      'lh:uses-rel-preload',
    ],
  },
  'resource-efficiency': {
    fingerprint: 'resource-efficiency',
    title: 'Reduce unnecessary resource downloads',
    category: 'Performance',
    defaultPriority: 'medium',
    findingPrefixes: [
      'lh:total-byte-weight',
      'lh:uses-text-compression',
      'lh:unused-css-rules',
      'lh:network-rtt',
      'lh:dom-size',
    ],
  },
  'layout-stability': {
    fingerprint: 'layout-stability',
    title: 'Fix layout instability',
    category: 'Performance',
    defaultPriority: 'medium',
    findingPrefixes: [
      'lh:cumulative-layout-shift',
      'lh:layout-shifts',
      'lh:non-composited-animations',
      'lh:unsized-images',
    ],
  },
  'seo-meta': {
    fingerprint: 'seo-meta',
    title: 'Fix missing or weak SEO metadata',
    category: 'SEO',
    defaultPriority: 'high',
    findingPrefixes: [
      'seo:title_missing',
      'seo:title_too_short',
      'seo:title_too_long',
      'seo:meta_desc_missing',
      'seo:meta_desc_too_short',
      'seo:meta_desc_too_long',
      'seo:h1_missing',
      'seo:h1_multiple',
    ],
  },
  'seo-signals': {
    fingerprint: 'seo-signals',
    title: 'Improve crawlability and search signals',
    category: 'SEO',
    defaultPriority: 'medium',
    findingPrefixes: [
      'seo:canonical_missing',
      'seo:robots_noindex',
      'seo:schema_missing',
      'seo:viewport_missing',
    ],
  },
  'social-sharing': {
    fingerprint: 'social-sharing',
    title: 'Add social sharing metadata',
    category: 'SEO',
    defaultPriority: 'low',
    findingPrefixes: [
      'seo:og_tags_incomplete',
    ],
  },
  'security-headers': {
    fingerprint: 'security-headers',
    title: 'Add missing security headers',
    category: 'Security',
    defaultPriority: 'medium',
    findingPrefixes: [
      'ssl:missing_header_content_security_policy',
      'ssl:missing_header_x_frame_options',
      'ssl:missing_header_strict_transport_security',
      'ssl:missing_header_x_content_type_options',
      'ssl:missing_header_referrer_policy',
      'ssl:missing_header_permissions_policy',
    ],
  },
  'https-enforcement': {
    fingerprint: 'https-enforcement',
    title: 'Enforce HTTPS and secure transport',
    category: 'Security',
    defaultPriority: 'critical',
    findingPrefixes: [
      'ssl:https_missing',
      'ssl:http_no_redirect',
    ],
  },
  'accessibility-barriers': {
    fingerprint: 'accessibility-barriers',
    title: 'Fix accessibility barriers',
    category: 'Accessibility',
    defaultPriority: 'high',
    findingPrefixes: [
      'a11y:images_missing_alt',
      'seo:images_missing_alt',
      'a11y:buttons_missing_label',
      'a11y:inputs_missing_labels',
      'a11y:html_lang_missing',
      'lh:image-alt',
      'lh:aria-',           // prefix match for all aria-* audits
      'lh:color-contrast',
      'lh:label',
      'lh:duplicate-id-aria',
      'lh:html-has-lang',
    ],
  },
  'navigation-a11y': {
    fingerprint: 'navigation-a11y',
    title: 'Improve navigation accessibility',
    category: 'Accessibility',
    defaultPriority: 'low',
    findingPrefixes: [
      'a11y:skip_nav_missing',
      'a11y:links_generic_text',
      'lh:link-text',
    ],
  },
};

// ---------------------------------------------------------------------------
// 2. GROUPING
// ---------------------------------------------------------------------------

/**
 * Given a list of issues (each with .fingerprintId), returns a map of
 * group fingerprint → [issue, ...] for all groups with at least one match.
 *
 * Matching is exact prefix: a finding with fingerprintId 'lh:aria-hidden-body'
 * matches the prefix 'lh:aria-' in accessibility-barriers.
 */
export function groupIssues(issues) {
  const grouped = {}; // fingerprint → Set of issues

  for (const issue of issues) {
    // Use the canonical (unsuffixed) fingerprint for group matching so that
    // lh:render-blocking-resources:2 still matches 'lh:render-blocking-resources'
    // in a group's findingPrefixes.  fingerprintId is preserved on the issue object
    // for display and dedup; canonicalFingerprintId is the stable audit identity.
    const fid = issue.canonicalFingerprintId || issue.fingerprintId || '';
    for (const [groupKey, group] of Object.entries(RECOMMENDATION_GROUPS)) {
      const matched = group.findingPrefixes.some(prefix =>
        prefix.endsWith('-')          // prefix match (e.g. 'lh:aria-')
          ? fid.startsWith(prefix)
          : fid === prefix            // exact match
      );
      if (matched) {
        if (!grouped[groupKey]) grouped[groupKey] = [];
        grouped[groupKey].push(issue);
      }
    }
  }

  return grouped;
}

// ---------------------------------------------------------------------------
// 3. PRIORITY SCORING
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT = { critical: 10, warning: 4, info: 1 };
const PRIORITY_THRESHOLDS = [
  { min: 10, label: 'critical' },
  { min: 6,  label: 'high' },
  { min: 3,  label: 'medium' },
  { min: 0,  label: 'low' },
];

/**
 * Compute a recommendation's priority from its matched findings.
 * Transparent: based on severity weights + finding count.
 * Never lower than the group's defaultPriority for critical groups.
 */
export function calcPriority(groupKey, matchedIssues) {
  const group = RECOMMENDATION_GROUPS[groupKey];
  if (!group) return 'low';

  // Score = sum of severity weights
  const score = matchedIssues.reduce((acc, i) => acc + (SEVERITY_WEIGHT[i.severity] || 0), 0);

  const computed = PRIORITY_THRESHOLDS.find(t => score >= t.min)?.label || 'low';

  // Never downgrade below the group's stated default
  const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical'];
  const defaultIdx  = PRIORITY_ORDER.indexOf(group.defaultPriority);
  const computedIdx = PRIORITY_ORDER.indexOf(computed);
  return PRIORITY_ORDER[Math.max(defaultIdx, computedIdx)];
}

// ---------------------------------------------------------------------------
// 4. EVIDENCE EXTRACTION
// ---------------------------------------------------------------------------

/**
 * Pull measured evidence values from analyzer result objects to support a
 * given recommendation group. Only attaches values that were actually
 * measured — never invents or estimates.
 */
function extractEvidence(groupKey, { lhData, seoData, sslData, a11yData }) {
  const ev = {};

  if (groupKey === 'js-overhead' || groupKey === 'server-performance' ||
      groupKey === 'layout-stability' || groupKey === 'resource-efficiency') {
    if (lhData?.metrics) {
      const m = lhData.metrics;
      if (m.lcp)  ev.lcp  = m.lcp;
      if (m.tbt)  ev.tbt  = m.tbt;
      if (m.cls)  ev.cls  = m.cls;
      if (m.fcp)  ev.fcp  = m.fcp;
      if (m.ttfb) ev.ttfb = m.ttfb;
      if (m.si)   ev.si   = m.si;
    }
  }

  if (groupKey === 'seo-meta' || groupKey === 'seo-signals') {
    if (seoData?.checks) {
      const c = seoData.checks;
      if (c.title     != null) ev.titleLength  = c.title.length;
      if (c.metaDesc  != null) ev.descLength   = c.metaDesc.length;
      if (c.h1Count   != null) ev.h1Count      = c.h1Count;
      if (c.canonical != null) ev.hasCanonical = !!c.canonical;
      if (c.schemas   != null) ev.schemaCount  = c.schemas.length;
      if (c.viewport  != null) ev.hasViewport  = c.viewport;
    }
  }

  if (groupKey === 'security-headers' || groupKey === 'https-enforcement') {
    if (sslData?.checks) {
      const c = sslData.checks;
      if (c.isHttps != null) ev.isHttps = c.isHttps;
      if (c.strict_transport_security != null) ev.hasHsts = c.strict_transport_security;
      if (c.content_security_policy   != null) ev.hasCsp  = c.content_security_policy;
      if (c.x_frame_options           != null) ev.hasXfo  = c.x_frame_options;
      if (c.httpRedirects             != null) ev.httpRedirects = c.httpRedirects;
    }
  }

  if (groupKey === 'accessibility-barriers' || groupKey === 'navigation-a11y') {
    if (a11yData?.checks) {
      const c = a11yData.checks;
      if (c.imgsNoAlt   != null) ev.imgsNoAlt   = c.imgsNoAlt;
      if (c.emptyButtons!= null) ev.emptyButtons = c.emptyButtons;
      if (c.genericLinks!= null) ev.genericLinks = c.genericLinks;
      if (c.hasLang     != null) ev.hasLang     = c.hasLang;
      if (c.hasSkipNav  != null) ev.hasSkipNav  = c.hasSkipNav;
    }
  }

  return Object.keys(ev).length ? ev : null;
}

// ---------------------------------------------------------------------------
// 5. BASE RECOMMENDATION BUILDER
// ---------------------------------------------------------------------------

/**
 * Builds un-enriched recommendation objects from grouped issues.
 *
 * Stage 1: stores full issue objects as supporting_findings so that the AI
 * enrichment layer can reference actual messages, descriptions, and measured
 * displayValues rather than just fingerprint IDs.
 *
 * finding_fingerprints (ID array) is kept alongside for backward compat.
 */
export function buildBaseRecommendations(issues, { lhData, seoData, sslData, a11yData } = {}) {
  const grouped = groupIssues(issues);
  const recommendations = [];

  // Track which canonical fingerprints are covered by a group rec so we don't
  // also emit a finding rec for those issues.
  const coveredCanonicalIds = new Set();

  for (const [groupKey, matchedIssues] of Object.entries(grouped)) {
    const group = RECOMMENDATION_GROUPS[groupKey];
    const priority = calcPriority(groupKey, matchedIssues);

    const evidence = extractEvidence(groupKey, { lhData, seoData, sslData, a11yData });

    // Stage 1: full issue objects as supporting evidence.
    // Include only the fields that are meaningful for display and AI context;
    // omit large nested objects (auditDetails, items) that bloat the prompt.
    const supportingFindings = matchedIssues.map(i => ({
      fingerprintId:          i.fingerprintId          || null,
      canonicalFingerprintId: i.canonicalFingerprintId || i.fingerprintId || null,
      message:                i.message                || null,
      description:            i.description            || null,
      displayValue:           i.displayValue           || null,
      severity:               i.severity               || null,
      category:               i.area || i.category     || null,
      source:                 i.source                 || null,
      fix:                    i.fix                    || null,
      items:                  i.items                  || null,  // specific affected resources from Lighthouse
    }));

    // Record canonical IDs so finding recs are not emitted for these issues.
    for (const i of matchedIssues) {
      coveredCanonicalIds.add(i.canonicalFingerprintId || i.fingerprintId);
    }

    // ID-only array uses canonical fingerprints so the rec's identity is stable
    // across rescans (not affected by ordinal suffixes).
    const findingFingerprints = matchedIssues
      .map(i => i.canonicalFingerprintId || i.fingerprintId)
      .filter(Boolean);
    // Deduplicate: multiple entries sharing a canonical ID (e.g. lh:render-blocking-resources:2
    // and lh:render-blocking-resources) should appear only once in the fingerprint array.
    const uniqueFindingFingerprints = [...new Set(findingFingerprints)];

    // Build base actions from the issue fixes (deduped by fix text prefix)
    const seenFixes = new Set();
    const baseActions = matchedIssues
      .filter(i => i.fix)
      .filter(i => {
        const key = (i.fix || '').slice(0, 60);
        if (seenFixes.has(key)) return false;
        seenFixes.add(key);
        return true;
      })
      .slice(0, 3)
      .map(i => ({
        title: `Fix: ${i.message.slice(0, 60)}`,
        detail: i.fix,
        impact: i.severity === 'critical' ? 'high' : i.severity === 'warning' ? 'medium' : 'low',
        effort: null, // AI enrichment fills this
      }));

    recommendations.push({
      rec_type:            'group',
      fingerprint:         group.fingerprint,
      group_key:           groupKey,
      title:               group.title,
      // what_we_found is populated by AI enrichment; stored in the 'explanation'
      // DB column. The base value here is used only if enrichment fails.
      what_we_found:       null,
      why_it_matters:      null,       // filled by AI enrichment
      category:            group.category,
      priority,
      supporting_findings: supportingFindings,
      finding_fingerprints: uniqueFindingFingerprints,
      evidence,
      actions:             baseActions.length ? baseActions : null,
      effort:              null,               // filled by AI enrichment
      confidence:          matchedIssues.some(i => i.severity === 'critical') ? 'high'
                         : matchedIssues.length >= 2 ? 'medium'
                         : 'low',
      verification_approach: null, // filled by AI enrichment
      aiEnriched: false,
    });
  }

  // ── Finding-level recs for unmatched actionable issues ─────────────────────
  // Any critical or warning issue not covered by a group rec gets its own
  // remediation record.  Its fingerprint is the canonical audit ID (stable
  // across rescans).  Multiple entries sharing a canonical ID (ordinal suffix
  // duplicates) are intentionally collapsed into a single rec whose
  // supporting_findings includes all entries — they share one remediation path
  // because they represent the same audit type.  Guidance is generated on-demand
  // (not during scan enrichment) to avoid unnecessary AI calls.
  const unmatchedByCanonical = new Map(); // canonicalId → [issue, ...]
  for (const issue of issues) {
    const severity = issue.severity;
    if (severity !== 'critical' && severity !== 'warning') continue;
    const cid = issue.canonicalFingerprintId || issue.fingerprintId;
    if (!cid || coveredCanonicalIds.has(cid)) continue;
    if (!unmatchedByCanonical.has(cid)) unmatchedByCanonical.set(cid, []);
    unmatchedByCanonical.get(cid).push(issue);
  }

  for (const [canonicalId, entries] of unmatchedByCanonical.entries()) {
    // Use the first entry as the representative issue for title/description;
    // all entries are preserved in supporting_findings for evidence.
    const primary = entries[0];
    const highestSeverity = entries.some(i => i.severity === 'critical') ? 'critical' : 'warning';
    const priority = highestSeverity === 'critical' ? 'high' : 'medium';

    const supportingFindings = entries.map(i => ({
      fingerprintId:          i.fingerprintId          || null,
      canonicalFingerprintId: i.canonicalFingerprintId || i.fingerprintId || null,
      message:                i.message                || null,
      description:            i.description            || null,
      displayValue:           i.displayValue           || null,
      severity:               i.severity               || null,
      category:               i.area || i.category     || null,
      source:                 i.source                 || null,
      fix:                    i.fix                    || null,
      items:                  i.items                  || null,
    }));

    // Build base actions from issue.fix fields (real Lighthouse guidance strings)
    const seenFixes = new Set();
    const baseActions = entries
      .filter(i => i.fix)
      .filter(i => {
        const key = (i.fix || '').slice(0, 60);
        if (seenFixes.has(key)) return false;
        seenFixes.add(key);
        return true;
      })
      .slice(0, 3)
      .map(i => ({
        title: `Fix: ${(i.message || '').slice(0, 60)}`,
        detail: i.fix,
        impact: i.severity === 'critical' ? 'high' : 'medium',
        effort: null,
      }));

    recommendations.push({
      rec_type:             'finding',
      fingerprint:          canonicalId,  // stable canonical audit ID
      group_key:            null,         // no group; guidance via AI or static template keyed by canonicalId
      title:                primary.message || canonicalId,
      what_we_found:        primary.displayValue || primary.description || null,
      why_it_matters:       null,         // generated on-demand by guide-plan
      category:             primary.area || primary.category || 'Performance',
      priority,
      supporting_findings:  supportingFindings,
      finding_fingerprints: [canonicalId], // single canonical ID — all entries share this audit
      evidence:             entries.some(i => i.items?.length) ? { items: entries.flatMap(i => i.items || []) } : null,
      actions:              baseActions.length ? baseActions : null,
      effort:               null,
      confidence:           'medium',
      verification_approach: null,
      aiEnriched:           false,
    });
  }

  // Sort: critical → high → medium → low; then by finding count descending
  const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => {
    const pd = (ORDER[a.priority] ?? 3) - (ORDER[b.priority] ?? 3);
    if (pd !== 0) return pd;
    return b.finding_fingerprints.length - a.finding_fingerprints.length;
  });

  return recommendations;
}

// ---------------------------------------------------------------------------
// 6. AI ENRICHMENT
// ---------------------------------------------------------------------------

/**
 * Enriches base recommendations with human-readable what_we_found,
 * why_it_matters, concrete actions, effort, and verification_approach.
 *
 * Stage 1: the AI now receives actual finding messages and displayValues,
 * not just fingerprint IDs. This enables evidence-grounded responses.
 *
 * If the API call fails, base recommendations are returned unchanged.
 */
import { estimateCost } from '@/lib/ai-cost';

export async function enrichRecommendationsWithAI(baseRecs, { url, scores, auditStatuses = {} }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !baseRecs.length) return baseRecs;

  // Finding-level recs are enriched on-demand when Guided Fix is opened, not at
  // scan time. Passing them to the AI summary would generate unused AI guidance
  // for every unmatched finding and inflate costs significantly.
  // Group recs retain full AI enrichment here; finding recs pass through unchanged.
  const groupRecs    = baseRecs.filter(r => (r.rec_type || 'group') === 'group');
  const findingRecs  = baseRecs.filter(r => r.rec_type === 'finding');

  if (!groupRecs.length) return baseRecs; // nothing to enrich

  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  // Build a rich summary of each recommendation for the prompt, using the full
  // issue objects from supporting_findings rather than just fingerprint IDs.
  // Only group recs are enriched here; finding recs are passed through as-is.
  const recSummaries = groupRecs.map((rec, idx) => {
    // Format each finding with its measured displayValue when available
    const findingLines = (rec.supporting_findings || []).slice(0, 6).map(f => {
      const sev   = f.severity ? `[${f.severity.toUpperCase()}]` : '';
      const dv    = f.displayValue ? ` — ${f.displayValue}` : '';
      const msg   = f.message || f.fingerprintId || 'unknown';
      return `    • ${sev} ${msg}${dv}`;
    }).join('\n');

    // Key-value evidence (measured metrics)
    const evidenceParts = rec.evidence
      ? Object.entries(rec.evidence).map(([k, v]) => `${k}=${v}`).join(', ')
      : '';

    return [
      `${idx}. [${rec.category}/${rec.priority}] ${rec.title}`,
      findingLines || '    (no individual findings)',
      evidenceParts ? `    Measured evidence: ${evidenceParts}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  const prompt = `You are analyzing a website audit for ${domain}. Based on the grouped findings below, enrich each recommendation with clear, grounded language.

For each recommendation (indexed 0–${groupRecs.length - 1}), return a JSON object with exactly these fields:
{
  "what_we_found": "1–2 sentences describing what Cernly specifically detected. Reference the actual findings and measured values listed. Be factual and concrete.",
  "why_it_matters": "1 sentence on the real-world effect on visitors or business goals. Do NOT invent load times, conversion rates, percentages, or dollar amounts — only reference measured values provided.",
  "effort": "low" | "medium" | "high",
  "verification_approach": "1 sentence describing how a developer confirms this is fixed.",
  "actions": [
    {
      "title": "imperative phrase, 4–7 words",
      "detail": "1 sentence of specific, actionable guidance",
      "impact": "high" | "medium" | "low",
      "effort": "low" | "medium" | "high"
    }
  ]
}

Return a JSON array with one object per recommendation, in the same order.

STRICT RULES:
- what_we_found must reference the specific findings listed — not generic advice.
- why_it_matters must not invent numbers, times, or rates not present in the evidence.
- Do not claim to know the site's tech stack or server configuration unless a finding states it.
- Keep language plain and accessible to non-technical business owners.
- actions: 2–3 items, concrete and ordered (most impactful first).

GROUPED RECOMMENDATIONS:
${recSummaries}

Return ONLY a valid JSON array. No markdown, no explanation.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.error('[recommendations] AI enrichment API error:', res.status);
      return baseRecs; // fallback: return all recs unenriched
    }

    const data = await res.json();
    const actualModel = data.model || null;
    if (!actualModel) console.warn('[Recommendations] data.model absent in response');
    const inTok  = data.usage?.input_tokens  ?? null;
    const outTok = data.usage?.output_tokens ?? null;
    const costInfo = estimateCost(actualModel, inTok, outTok);
    if (costInfo?.rateSource === 'unknown') {
      console.warn(`[Recommendations] unknown model in rate table: ${costInfo.model} — tokens logged, cost omitted`);
    }
    console.log(
      `[Recommendations] ai_success model=${actualModel ?? 'unknown'}` +
      ` input_tokens=${inTok ?? 'unknown'}` +
      ` output_tokens=${outTok ?? 'unknown'}` +
      (costInfo?.est_cost_usd_estimate != null ? ` est_cost_usd_estimate=${costInfo.est_cost_usd_estimate}` : '')
    );
    const raw  = data.content?.[0]?.text?.trim() || '';
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let enrichments;
    try {
      enrichments = JSON.parse(text);
    } catch {
      console.error('[recommendations] AI enrichment parse failed, using base:', raw.slice(0, 200));
      return baseRecs;
    }

    if (!Array.isArray(enrichments) || enrichments.length !== groupRecs.length) {
      console.error('[recommendations] AI enrichment length mismatch, using base');
      return baseRecs;
    }

    const enrichedGroupRecs = groupRecs.map((rec, idx) => {
      const e = enrichments[idx];
      if (!e || typeof e !== 'object') return rec;

      // Validate actions array
      const validActions = Array.isArray(e.actions)
        ? e.actions
            .filter(a => a && typeof a.title === 'string' && typeof a.detail === 'string')
            .map(a => ({
              title:  String(a.title).slice(0, 100),
              detail: String(a.detail),
              impact: ['high', 'medium', 'low'].includes(a.impact) ? a.impact : 'medium',
              effort: ['low', 'medium', 'high'].includes(a.effort) ? a.effort : null,
            }))
            .slice(0, 3)
        : rec.actions;

      return {
        ...rec,
        what_we_found:         typeof e.what_we_found     === 'string' ? e.what_we_found     : null,
        why_it_matters:        typeof e.why_it_matters     === 'string' ? e.why_it_matters     : rec.why_it_matters,
        effort:                ['low','medium','high'].includes(e.effort) ? e.effort            : rec.effort,
        verification_approach: typeof e.verification_approach === 'string' ? e.verification_approach : rec.verification_approach,
        actions:               validActions || rec.actions,
        aiEnriched:            true,
      };
    });

    // Merge enriched group recs + unenriched finding recs.
    // Finding recs stay at the end; group recs are already sorted by priority.
    return [...enrichedGroupRecs, ...findingRecs];

  } catch (err) {
    console.error('[recommendations] AI enrichment error:', err.message);
    return baseRecs;
  }
}

// ---------------------------------------------------------------------------
// 7. MAIN ENTRY POINT
// ---------------------------------------------------------------------------

/**
 * Full pipeline: group → prioritize → build → enrich.
 *
 * @param {object[]} issues  - Issues from assignIssueFingerprintIds
 * @param {object}   scores  - Normalized scores { performance, seo, ... }
 * @param {string}   url     - The scanned URL (for AI context)
 * @param {object}   analyzerData - { lhData, seoData, sslData, a11yData }
 * @param {object}   auditStatuses - From the analyze route
 * @returns {Promise<object[]>} Array of recommendation objects
 */
export async function generateRecommendations(issues, scores, url, analyzerData = {}, auditStatuses = {}) {
  if (!issues || issues.length === 0) return [];

  const base = buildBaseRecommendations(issues, analyzerData);
  if (!base.length) return [];

  // AI enrichment is best-effort — failures return base recommendations
  const enriched = await enrichRecommendationsWithAI(base, { url, scores, auditStatuses });
  return enriched;
}
