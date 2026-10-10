import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usMarketOpen } from './release.mjs';

test('the US regular session counts as open, in New York time', () => {
  // 2026-10-09 is a Friday; New York is UTC-4 in October.
  assert.equal(usMarketOpen(new Date('2026-10-09T13:29:00Z')), false);
  assert.equal(usMarketOpen(new Date('2026-10-09T13:30:00Z')), true);
  assert.equal(usMarketOpen(new Date('2026-10-09T19:59:00Z')), true);
  assert.equal(usMarketOpen(new Date('2026-10-09T20:00:00Z')), false);
  // Taiwan morning, before anyone is trading.
  assert.equal(usMarketOpen(new Date('2026-10-12T00:30:00Z')), false);
});

test('weekends are closed', () => {
  assert.equal(usMarketOpen(new Date('2026-10-10T15:00:00Z')), false);
  assert.equal(usMarketOpen(new Date('2026-10-11T15:00:00Z')), false);
});
