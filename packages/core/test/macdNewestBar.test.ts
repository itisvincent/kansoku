import { describe, expect, it } from 'vitest';
import { classifyMacdStructure } from '../src/analysis/macdStructure.js';
import { buildCockpitPosition } from '../src/cockpit/position.js';

describe('MACD crosses on the newest bar', () => {
  it('marks a cross on the still-forming last bar as unconfirmed', () => {
    // The histogram turns positive only on the last bar: a golden cross there.
    const hist = [-3, -2, -1.5, -1, -0.5, 0.4];
    const dif = [1, 1, 1, 1, 1, 1];
    const times = hist.map((_, i) => 1_000 + i * 300);
    const cross = classifyMacdStructure(dif, hist, times).signals.find((s) => s.time === times[5]);
    expect(cross?.confirmed).toBe(false);
  });

  it('confirms the same cross once a newer bar exists', () => {
    const hist = [-3, -2, -1.5, -1, -0.5, 0.4, 0.8];
    const dif = [1, 1, 1, 1, 1, 1, 1];
    const times = hist.map((_, i) => 1_000 + i * 300);
    const cross = classifyMacdStructure(dif, hist, times).signals.find((s) => s.time === times[5]);
    expect(cross?.confirmed).toBe(true);
  });
});

describe('short positions', () => {
  it('reports a gain when the price falls below the short cost', () => {
    const position = buildCockpitPosition(
      [{ symbol: 'MU.US', quantity: '-10', cost_price: '100' } as never],
      'MU.US',
      90,
    );
    expect(position?.unrealized).toBe(100);
    expect(position?.unrealizedPct).toBeCloseTo(10);
  });
});
