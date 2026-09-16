// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCockpitReviewState } from './useCockpitReviewState';

const reload = vi.fn();
let running = false;
vi.mock('./analystRunsStore', () => ({ useAnalystRunStatus: () => (running ? {} : null) }));
vi.mock('@web/lib/client', () => ({ client: { symbols: { journal: vi.fn() } } }));
vi.mock('@web/lib/apiHooks', () => ({ useQuery: () => ({ data: [], reload }) }));

afterEach(() => {
  cleanup();
  running = false;
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('refreshes journal results when analysis runs outside the Journal section', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(() => useCockpitReviewState('META.US'));
  expect(result.current.reviewSection).toBe('history');
  running = true;
  rerender();
  act(() => vi.advanceTimersByTime(5_000));
  expect(reload).toHaveBeenCalledTimes(1);
  running = false;
  rerender();
  expect(reload).toHaveBeenCalledTimes(2);
  act(() => vi.advanceTimersByTime(5_000));
  expect(reload).toHaveBeenCalledTimes(2);
});
