// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { IntradayControlsProvider } from '../controlsContext';
import { PredictionTab } from './PredictionTab';

function renderTab(ui: ReactNode) {
  return render(<IntradayControlsProvider>{ui}</IntradayControlsProvider>);
}

afterEach(() => {
  cleanup();
});

const nullPredictionBuilt = {
  kind: 'intraday',
  sidebar: {
    prediction: null,
    entryPlan: null,
    technicals: {},
    context: null,
  },
  timeframes: {},
} as unknown as IntradayBuilt;

describe('PredictionTab null-prediction branch', () => {
  it('renders emptyCta below the preview-mode verdict when prediction is null', () => {
    renderTab(
      <PredictionTab
        built={nullPredictionBuilt}
        activeTf="m5"
        emptyCta={<div data-testid="empty-cta">生成分析</div>}
      />,
    );

    expect(screen.getByText('👀 预览模式')).toBeTruthy();
    expect(screen.getByTestId('empty-cta')).toBeTruthy();
  });

  it('renders nothing extra when emptyCta is not passed', () => {
    renderTab(<PredictionTab built={nullPredictionBuilt} activeTf="m5" />);

    expect(screen.getByText('👀 预览模式')).toBeTruthy();
    expect(screen.queryByTestId('empty-cta')).toBeNull();
  });
});
