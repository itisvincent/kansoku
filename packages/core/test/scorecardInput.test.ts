import { describe, expect, it } from 'vitest';
import { overviewService } from '../src/overview/overview.service.js';

describe('overview.scorecard input', () => {
  it.each(['abc', '-5', '0', '0.5', '1e9'])('rejects days=%s with a 400 instead of loading all history', async (days) => {
    const err = await overviewService
      .scorecard({ days: days as unknown as number })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400 });
  });
});
