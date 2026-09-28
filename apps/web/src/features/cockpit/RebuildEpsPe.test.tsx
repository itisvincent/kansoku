// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translate } from '@web/lib/i18n';
import { ANCHOR_CHOICE_KEY } from './AnalysisTab';
import { RebuildEpsPe } from './RebuildEpsPe';

const startWithOptions = vi.fn();
let lastAnchorTf: string | undefined;
let running = false;

vi.mock('./useAnalystRun', () => ({
  useAnalystRun: (_sym: string, _enabled: boolean, anchorTf?: string) => {
    lastAnchorTf = anchorTf;
    return { hint: null, pending: false, running, status: null, start: vi.fn(), startWithOptions };
  },
}));
vi.mock('./analystRunsStore', () => ({
  useAnalystRunStatus: () => null,
  useAnalystRunLastEnded: () => null,
}));

const t = (key: Parameters<typeof translate>[1]) => translate('zh-CN', key);

describe('RebuildEpsPe', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    running = false;
  });

  it('asks for confirmation before starting a rebuild run', () => {
    render(<RebuildEpsPe sym="MU.US" viewedTf="4h" />);
    fireEvent.click(screen.getByRole('button', { name: t('chartEpsPeRebuild') }));
    expect(startWithOptions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: t('chartEpsPeRebuildConfirm') }));
    expect(startWithOptions).toHaveBeenCalledWith({ rebuildEpsPe: true });
  });

  it('cancel returns to the idle button without running', () => {
    render(<RebuildEpsPe sym="MU.US" viewedTf="4h" />);
    fireEvent.click(screen.getByRole('button', { name: t('chartEpsPeRebuild') }));
    fireEvent.click(screen.getByRole('button', { name: t('chartEpsPeRebuildCancel') }));
    expect(startWithOptions).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t('chartEpsPeRebuild') })).toBeTruthy();
  });

  it('uses the same anchor choice as the Run analysis picker', () => {
    render(<RebuildEpsPe sym="MU.US" viewedTf="4h" />);
    expect(lastAnchorTf).toBe('4h');
    cleanup();
    localStorage.setItem(ANCHOR_CHOICE_KEY, 'day');
    render(<RebuildEpsPe sym="MU.US" viewedTf="4h" />);
    expect(lastAnchorTf).toBe('day');
  });

  it('is disabled while an analysis is already running', () => {
    running = true;
    render(<RebuildEpsPe sym="MU.US" viewedTf="4h" />);
    const button = screen.getByRole('button', { name: t('cockpitAiRunning') }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
