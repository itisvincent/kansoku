// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AnalysisTab, resolveAnchorChoice, ANCHOR_CHOICE_KEY } from './AnalysisTab';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';

vi.mock('./analystRunsStore', () => ({
  useAnalystRunStatus: () => null,
  useAnalystRunLastEnded: () => null,
}));
vi.mock('./useAiUnreadBadge', () => ({
  useAiUnreadBadge: () => ({ unread: 0, latestAlert: null }),
}));
vi.mock('./useAnalystRun', () => ({
  useAnalystRun: () => ({
    hint: null,
    pending: false,
    running: false,
    status: null,
    start: vi.fn(),
  }),
}));

let lastAnchorTf: string | undefined;
vi.mock('./GenerateAnalysis', () => ({
  GenerateAnalysis: ({ anchorTf }: { anchorTf?: string }) => {
    lastAnchorTf = anchorTf;
    return <button type="button">Run analysis</button>;
  },
}));

function renderTab(anchorTf?: string) {
  return render(
    <IntradayControlsProvider>
      <AnalysisTab
        sym="MU.US"
        section="prediction"
        onSectionChange={() => {}}
        prediction={<div />}
        commentary={<div />}
        review={<div />}
        unread={0}
        anchorTf={anchorTf}
      />
    </IntradayControlsProvider>,
  );
}

describe('anchor picker', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('follows the viewed chart timeframe by default', () => {
    renderTab('4h');
    expect(lastAnchorTf).toBe('4h');
  });

  it('pins a timeframe when selected and persists the choice', () => {
    renderTab('4h');
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'h1' } });
    expect(lastAnchorTf).toBe('h1');
    expect(localStorage.getItem(ANCHOR_CHOICE_KEY)).toBe('h1');
  });
});

describe('resolveAnchorChoice', () => {
  it('auto follows the viewed tf, pinned overrides', () => {
    expect(resolveAnchorChoice('auto', '4h')).toBe('4h');
    expect(resolveAnchorChoice('auto', undefined)).toBeUndefined();
    expect(resolveAnchorChoice('h1', '4h')).toBe('h1');
  });
});