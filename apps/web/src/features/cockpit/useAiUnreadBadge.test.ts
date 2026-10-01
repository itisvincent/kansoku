// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CockpitComment } from '@kansoku/shared/types';
import { useAiUnreadBadge } from './useAiUnreadBadge';

const alert = (ts: string): CockpitComment =>
  ({ ts, symbol: 'MU.US', level: 'warn', text: ts, source: 'commentator' }) as CockpitComment;

describe('useAiUnreadBadge', () => {
  it('does not count alerts from before the page loaded, even when they merge a render late', () => {
    const old = [alert('2026-01-01T14:00:00Z'), alert('2026-01-01T15:00:00Z')];
    const { result, rerender } = renderHook(
      ({ comments, loaded }) => useAiUnreadBadge('MU.US', comments, loaded, 'prediction'),
      { initialProps: { comments: [] as CockpitComment[], loaded: true } },
    );
    rerender({ comments: old, loaded: true });
    expect(result.current.unread).toBe(0);

    const fresh = alert(new Date(Date.now() + 60_000).toISOString());
    rerender({ comments: [...old, fresh], loaded: true });
    expect(result.current.unread).toBe(1);
    expect(result.current.latestAlert).toBe(fresh);
  });

  it('clears the count while the AI tab is open', () => {
    const fresh = alert(new Date(Date.now() + 60_000).toISOString());
    const { result, rerender } = renderHook(
      ({ tab }) => useAiUnreadBadge('MU.US', [fresh], true, tab),
      { initialProps: { tab: 'prediction' } },
    );
    expect(result.current.unread).toBe(1);
    rerender({ tab: 'ai' });
    rerender({ tab: 'prediction' });
    expect(result.current.unread).toBe(0);
  });
});
