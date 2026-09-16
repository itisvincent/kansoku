// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { LocaleProvider } from '../../lib/i18n';
import type { RunningReassessStatus } from './analystRunsStore';
import { AnalysisTab, type AnalysisSection } from './AnalysisTab';

const { reassess } = vi.hoisted(() => ({ reassess: vi.fn() }));
let status: RunningReassessStatus | null = null;
vi.mock('@web/lib/client', () => ({ client: { symbols: { reassess } } }));
vi.mock('@web/lib/analytics', () => ({ trackFeatureUsed: () => {} }));
vi.mock('./analystRunsStore', () => ({
  useAnalystRunStatus: () => status,
  getAnalystRunStatus: () => status,
  getLatestAnalystRunEvent: () => null,
}));

function Harness() {
  const [section, setSection] = useState<AnalysisSection>('prediction');
  return (
    <LocaleProvider>
      <IntradayControlsProvider>
        <AnalysisTab
          sym="META.US"
          section={section}
          onSectionChange={setSection}
          unread={2}
          prediction={<div>Prediction result</div>}
          commentary={<div>Commentary feed</div>}
          review={<div>Review history</div>}
        />
      </IntradayControlsProvider>
    </LocaleProvider>
  );
}

beforeEach(() => {
  localStorage.setItem('kansoku.locale', 'en-US');
  localStorage.setItem('intraday-analysis-tfs', JSON.stringify(['h1', '4h', 'day']));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  status = null;
});

describe('combined analysis workspace', () => {
  it('renders the shared controls in Chinese when selected', () => {
    localStorage.setItem('kansoku.locale', 'zh-CN');
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: '分析内容' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '跑一次分析' })).toBeTruthy();
    expect(screen.getByText('分析周期：1 小时 · 4 小时 · 日线')).toBeTruthy();
  });

  it('shares one action, sends the displayed analysis periods, and preserves errors between sections', async () => {
    reassess.mockRejectedValue(new Error('Provider unavailable'));
    render(<Harness />);
    expect(screen.getByText('Analysis periods: 1 hour · 4 hours · Daily')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Commentary/ }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Commentary feed');
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Review history');
    expect(reassess).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Run analysis' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Run analysis' }));
    await waitFor(() => expect(screen.getByText('Provider unavailable')).toBeTruthy());
    expect(reassess).toHaveBeenCalledExactlyOnceWith({
      sym: 'META.US',
      timeframes: ['h1', '4h', 'day'],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Prediction' }));
    expect(screen.getByText('Provider unavailable')).toBeTruthy();
    expect(screen.getByRole('tabpanel').textContent).toBe('Prediction result');
  });

  it('keeps a pending request disabled while switching sections', async () => {
    let resolve!: (value: { started: boolean; reason: string }) => void;
    reassess.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Run analysis' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    const button = screen.getByRole('button', { name: 'Run analysis' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(reassess).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ started: false, reason: 'analyst layer disabled' }));
    expect(button.disabled).toBe(false);
  });

  it('shows active run progress in every section and supports keyboard navigation', () => {
    status = {
      running: true,
      origin: 'manual',
      phase: 'researching',
      activity: 'Reading selected periods',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    render(<Harness />);
    const prediction = screen.getByRole('tab', { name: 'Prediction' });
    prediction.focus();
    fireEvent.keyDown(prediction, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel').textContent).toBe('Commentary feed');
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tabpanel').textContent).toBe('Review history');
    expect(screen.getByText('Reading selected periods')).toBeTruthy();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect(reassess).not.toHaveBeenCalled();
  });
});
