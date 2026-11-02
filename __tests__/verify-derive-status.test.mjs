// Import the real helpers used by the verify route; never reproduce their logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveVerifiedStatus, extractFindingOutcomes } from '../lib/verification.js';

for (const [bucket, expected] of Object.entries({ likely_resolved: 'likely_resolved',
  still_open: 'still_detected', partially_resolved: 'partially_resolved', unable_to_verify: 'unable_to_verify' })) {
  test(`maps a known recommendation from ${bucket}`, () => {
    const c = { isComparable: true, recommendations: { [bucket]: [{ rec: { fingerprint: 'images' } }] } };
    assert.equal(deriveVerifiedStatus('images', c), expected);
  });
}
test('unknown recommendation cannot resolve just because comparison is full', () => {
  assert.equal(deriveVerifiedStatus('missing', { isComparable: true, comparabilityLevel: 'full', recommendations: {} }), 'unable_to_verify');
});
test('canonical finding target returns only its own evidence', () => {
  const c = { isComparable: true, findings: { still_detected: [
    { fingerprintId: 'lh:image-alt' }, { fingerprintId: 'seo:title_missing' },
  ] } };
  assert.equal(deriveVerifiedStatus('lh:image-alt:2', c), 'still_detected');
  assert.deepEqual(extractFindingOutcomes('lh:image-alt:2', c).map(f => f.fingerprintId), ['lh:image-alt']);
});
