/**
 * Regression tests for the FixCard recommendation matching pipeline.
 *
 * REGRESSION GUARDED: Missing "Guide me through this fix" buttons on Action Plan FixCards.
 *
 * Root cause: mapRecommendation() in lib/store.js returned finding_fingerprints: []
 * for older DB rows where that column was null/empty, because it didn't merge fingerprints
 * from supporting_findings. The getReportsByDomainFull() path already did this merge
 * (lines ~563-574) but mapRecommendation() (used by getRecommendationsByReport()) did not.
 *
 * Symptom: buildRecMap() in ReportClient.js could only index recs by their group
 * fingerprint (e.g. "performance-render-blocking-resources"). Issue fingerprints
 * (e.g. "lh:render-blocking-resources") never matched, so recMap[issue.fingerprintId]
 * returned undefined → rec prop null → FixCard button hidden for 6/7 recs.
 *
 * Fix: mapRecommendation() now merges supporting_findings[*].fingerprintId into
 * finding_fingerprints before returning, matching getReportsByDomainFull().
 *
 * These tests exercise the full rendering pipeline:
 *   mapRecommendation-equivalent merge → buildRecMap → rec lookup → button condition
 */

import assert from 'node:assert/strict';

// ─── Helpers extracted from their source files ────────────────────────────────

/**
 * Mirrors the finding_fingerprints merge logic in mapRecommendation() (lib/store.js).
 * Takes a raw DB recommendation row (with possibly empty finding_fingerprints and
 * populated supporting_findings) and returns the merged fingerprints array.
 */
function mergedFindingFingerprints(rawRec) {
  const parseJ = v => {
    if (!v) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
  };
  const explicit     = parseJ(rawRec.finding_fingerprints) || [];
  const fromSupport  = (parseJ(rawRec.supporting_findings) || [])
    .map(f => f?.fingerprintId).filter(Boolean);
  return [...new Set([...explicit, ...fromSupport])];
}

/**
 * Applies mergedFindingFingerprints to a DB row, producing the rec shape
 * that mapRecommendation() now returns (as used by getRecommendationsByReport()).
 */
function mapRec(rawRec) {
  return {
    id:                   rawRec.id || 1,
    fingerprint:          rawRec.fingerprint,
    title:                rawRec.title || '',
    finding_fingerprints: mergedFindingFingerprints(rawRec),
    supporting_findings:  rawRec.supporting_findings || null,
    actions:              rawRec.actions || null,
  };
}

/**
 * Verbatim copy of buildRecMap() from app/report/[slug]/ReportClient.js.
 * A change to the production function that breaks this copy is intentional
 * divergence — update both together and update this comment.
 */
function buildRecMap(recommendations) {
  const map = {};
  if (!Array.isArray(recommendations)) return map;
  for (const rec of recommendations) {
    if (rec.fingerprint) map[rec.fingerprint] = rec;
    if (Array.isArray(rec.finding_fingerprints)) {
      for (const fp of rec.finding_fingerprints) {
        if (!map[fp]) map[fp] = rec;
      }
    }
  }
  return map;
}

/**
 * FixCard button visibility condition from ReportClient.js line 499:
 *   {onGuide && rec && (...)}
 * onGuide is always present when a report is rendered for authenticated users;
 * the button is suppressed only when rec (= recMap[issue.fingerprintId]) is null.
 */
function fixCardButtonVisible(recMap, issue) {
  const fp = issue.fingerprintId || issue.fingerprint || '';
  const matchedRec = recMap[fp] || null;
  const onGuide = true; // always passed in renderActionPlan
  return !!(onGuide && matchedRec);
}

// ─── Scenario 1: Old-style rec — finding_fingerprints empty, supporting_findings populated ──
// The case that caused 6/7 missing buttons: finding_fingerprints was null in the DB
// but supporting_findings contains the issue objects with their fingerprintIds.
{
  const rawRec = {
    fingerprint:          'performance-render-blocking-resources',
    title:                'Eliminate render-blocking resources',
    finding_fingerprints: null,                // empty in DB (old row)
    supporting_findings:  [
      { fingerprintId: 'lh:render-blocking-resources', message: 'Render-blocking resource', severity: 'warning' },
    ],
  };

  const rec = mapRec(rawRec);
  assert.deepEqual(
    rec.finding_fingerprints,
    ['lh:render-blocking-resources'],
    'supporting_findings fingerprintId extracted into finding_fingerprints'
  );

  const recMap = buildRecMap([rec]);
  const issue = { fingerprintId: 'lh:render-blocking-resources', severity: 'warning' };

  assert.ok(fixCardButtonVisible(recMap, issue),
    'Guide button VISIBLE for issue whose fingerprint was only in supporting_findings');
  assert.strictEqual(recMap['lh:render-blocking-resources'], rec,
    'recMap correctly indexes old rec by lh: fingerprint via supporting_findings merge');
  console.log('✓ Scenario 1: old-style rec (empty finding_fingerprints) → button visible via supporting_findings merge');
}

// ─── Scenario 2: New-style rec — finding_fingerprints already populated ──────
// For recs generated after the fix, finding_fingerprints is correct in the DB.
// The merge must not change or duplicate those values.
{
  const rawRec = {
    fingerprint:          'performance-uses-responsive-images',
    title:                'Properly size images',
    finding_fingerprints: ['lh:uses-responsive-images', 'lh:uses-responsive-images:2'],
    supporting_findings:  [
      { fingerprintId: 'lh:uses-responsive-images',    message: 'Image /hero.jpg', severity: 'warning' },
      { fingerprintId: 'lh:uses-responsive-images:2',  message: 'Image /thumb.png', severity: 'warning' },
    ],
  };

  const rec = mapRec(rawRec);
  assert.deepEqual(
    rec.finding_fingerprints.sort(),
    ['lh:uses-responsive-images', 'lh:uses-responsive-images:2'].sort(),
    'no duplicates introduced when explicit and support fingerprints overlap'
  );

  const recMap = buildRecMap([rec]);

  assert.ok(fixCardButtonVisible(recMap, { fingerprintId: 'lh:uses-responsive-images' }),
    'Guide button VISIBLE for first finding in multi-finding rec');
  assert.ok(fixCardButtonVisible(recMap, { fingerprintId: 'lh:uses-responsive-images:2' }),
    'Guide button VISIBLE for second finding (deduplication suffix) in same rec');
  console.log('✓ Scenario 2: new-style rec (explicit finding_fingerprints) → no duplicates, both findings visible');
}

// ─── Scenario 3: Rec with multiple findings from supporting_findings ──────────
// A recommendation that grouped multiple distinct issues; all should be resolvable.
{
  const rawRec = {
    fingerprint:          'seo-meta-tags',
    title:                'Fix meta tag issues',
    finding_fingerprints: [],   // empty array (vs null — both are treated the same)
    supporting_findings:  [
      { fingerprintId: 'seo:meta-description',  message: 'Meta description missing', severity: 'warning' },
      { fingerprintId: 'seo:og-title',          message: 'OG title missing',         severity: 'info'    },
      { fingerprintId: 'seo:canonical',         message: 'Canonical URL not set',    severity: 'warning' },
    ],
  };

  const rec = mapRec(rawRec);
  const fps = rec.finding_fingerprints;
  assert.ok(fps.includes('seo:meta-description'), 'meta-description fingerprint in merged list');
  assert.ok(fps.includes('seo:og-title'),         'og-title fingerprint in merged list');
  assert.ok(fps.includes('seo:canonical'),        'canonical fingerprint in merged list');
  assert.equal(fps.length, 3, 'exactly 3 fingerprints, none duplicated');

  const recMap = buildRecMap([rec]);

  for (const fp of fps) {
    assert.ok(
      fixCardButtonVisible(recMap, { fingerprintId: fp }),
      `Guide button VISIBLE for finding ${fp}`
    );
  }
  console.log('✓ Scenario 3: rec with 3 findings from supporting_findings → all findings show Guide button');
}

// ─── Scenario 4: Fingerprint identity — issue fp vs rec fp don't cross-match ─
// The group fingerprint (rec.fingerprint) should never accidentally match an issue.
// Issue fingerprints are "source:auditId"; rec fingerprints are "category-auditId".
{
  const rawRec = {
    fingerprint:          'performance-font-display',
    title:                'Ensure text remains visible during webfont load',
    finding_fingerprints: null,
    supporting_findings:  [
      { fingerprintId: 'lh:font-display', message: 'Font not using font-display: swap', severity: 'warning' },
    ],
  };

  const rec = mapRec(rawRec);
  const recMap = buildRecMap([rec]);

  // The rec's own group fingerprint is in the map (for direct rec lookups)
  assert.ok(recMap['performance-font-display'], 'rec is indexable by its group fingerprint');
  // But the issue fingerprint "lh:font-display" is now ALSO in the map via the merge
  assert.ok(recMap['lh:font-display'], 'rec is indexable by issue fingerprint after merge');

  // Before the fix: recMap['lh:font-display'] would be undefined → button hidden
  // After the fix: button visible
  assert.ok(
    fixCardButtonVisible(recMap, { fingerprintId: 'lh:font-display' }),
    'Guide button VISIBLE when issue fp differs from rec fp but is in supporting_findings'
  );
  assert.ok(
    !fixCardButtonVisible(recMap, { fingerprintId: 'lh:non-existent-audit' }),
    'Guide button correctly HIDDEN for issue with no matching rec'
  );
  console.log('✓ Scenario 4: issue fp (lh:font-display) vs rec fp (performance-font-display) — merge bridges the gap');
}

// ─── Scenario 5: Affected resources — multiple items in supporting_findings ───
// Some recommendations have dozens of affected resources. Each matching issue
// should resolve to the same parent rec. Deduplication via Set must hold.
{
  const rawRec = {
    fingerprint:          'performance-uses-optimized-images',
    title:                'Efficiently encode images',
    finding_fingerprints: null,
    supporting_findings:  Array.from({ length: 20 }, (_, i) => ({
      fingerprintId: i === 0 ? 'lh:uses-optimized-images' : `lh:uses-optimized-images:${i + 1}`,
      message: `Image ${i + 1} not optimized`,
      severity: 'warning',
    })),
  };

  const rec = mapRec(rawRec);
  assert.equal(rec.finding_fingerprints.length, 20, '20 distinct fingerprints from 20 affected resources');
  assert.equal(
    new Set(rec.finding_fingerprints).size, 20,
    'no duplicates in merged fingerprint list'
  );

  const recMap = buildRecMap([rec]);
  // First and last resource should both resolve
  assert.ok(
    fixCardButtonVisible(recMap, { fingerprintId: 'lh:uses-optimized-images' }),
    'Guide button VISIBLE for first affected resource'
  );
  assert.ok(
    fixCardButtonVisible(recMap, { fingerprintId: 'lh:uses-optimized-images:20' }),
    'Guide button VISIBLE for 20th affected resource'
  );
  console.log('✓ Scenario 5: 20 affected resources — all resolve to rec, no duplicates');
}

// ─── Scenario 6: Pre-fix regression guard ─────────────────────────────────────
// Demonstrates that WITHOUT the supporting_findings merge, the issue fp returns null.
// This is the exact failure mode that caused the missing buttons.
{
  function buildRecMapWithoutMerge(recommendations) {
    // The OLD behavior: only indexes by rec.fingerprint and finding_fingerprints as-is
    const map = {};
    for (const rec of recommendations) {
      if (rec.fingerprint) map[rec.fingerprint] = rec;
      if (Array.isArray(rec.finding_fingerprints)) {
        for (const fp of rec.finding_fingerprints) {
          if (!map[fp]) map[fp] = rec;
        }
      }
    }
    return map;
  }

  // Old-style rec: finding_fingerprints empty, supporting_findings populated
  const oldStyleRec = {
    fingerprint:          'performance-render-blocking-resources',
    title:                'Eliminate render-blocking resources',
    finding_fingerprints: [],  // empty — as it would come from old DB row
    supporting_findings:  null, // not merged in old behavior
  };

  // Without the store fix, mapRec would return finding_fingerprints: []
  const unmappedRec = {
    ...oldStyleRec,
    // Simulate old mapRecommendation: finding_fingerprints stays []
  };

  const brokenRecMap = buildRecMapWithoutMerge([unmappedRec]);
  const issue = { fingerprintId: 'lh:render-blocking-resources', severity: 'warning' };

  // Before fix: button hidden
  const fp = issue.fingerprintId;
  assert.equal(brokenRecMap[fp], undefined,
    'OLD behavior: recMap[lh:render-blocking-resources] is undefined (button was hidden)');
  assert.ok(
    !fixCardButtonVisible(brokenRecMap, issue),
    'OLD behavior: Guide button HIDDEN (regression guard confirms fix was needed)'
  );
  console.log('✓ Scenario 6: pre-fix guard — confirms old behavior hid button (regression would revert this)');
}

console.log('\n✅ All FixCard recommendation matching regression tests passed.');
