// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeframeSettingsMenu } from './TimeframeSettingsMenu';
import { IntradayControlsProvider } from './controlsContext';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function rowCheckbox(label: string): HTMLElement {
  const row = screen.getByText(label).closest('.tf-settings-row') as HTMLElement;
  return row.querySelector('[role="checkbox"]') as HTMLElement;
}

function open() {
  render(
    <IntradayControlsProvider>
      <TimeframeSettingsMenu />
    </IntradayControlsProvider>,
  );
  fireEvent.click(screen.getByLabelText('周期设置'));
}

describe('TimeframeSettingsMenu', () => {
  it('adds a view period and writes it to storage', () => {
    open();

    fireEvent.click(rowCheckbox('30 分钟'));

    expect(JSON.parse(localStorage.getItem('intraday-timeframes')!)).toEqual([
      'm5',
      'm15',
      '30m',
      'h1',
      '4h',
    ]);
  });

  it('hides a timeframe when its box is unticked, analysis ones included', () => {
    open();

    fireEvent.click(rowCheckbox('5 分钟'));

    expect(JSON.parse(localStorage.getItem('intraday-timeframes')!)).not.toContain('m5');
  });
});
