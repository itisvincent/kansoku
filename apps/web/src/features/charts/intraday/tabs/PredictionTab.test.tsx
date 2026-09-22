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

describe('PredictionTab Darren EPS × PE section', () => {
  it('renders the eps_pe_plan scenario cards below the range plan', () => {
    const built = {
      kind: 'intraday',
      sidebar: {
        last: 300,
        prediction: {
          direction: 'neutral',
          eps_pe_plan: {
            anchor_year: 'FY2028',
            scenarios: [
              { kind: 'bear', eps: 13, pe: 14, target: 182, peg: 0.5 },
              { kind: 'base', eps: 15, pe: 20, target: 300, peg: 0.7 },
              { kind: 'bull', eps: 17, pe: 26, target: 442, peg: 0.9 },
            ],
            blended_target: 306,
            wall_street_target: 298,
            black_swan: { eps: 13, pe: 12, target: 156, triggers: 'capex cut' },
            digestion: [{ years: 2, eps: 23, pe: 13 }],
            bands: [{ label: 'Add', price: 185, note: 'gates pass' }],
            sources: ['Seeking Alpha consensus'],
          },
        },
        entryPlan: null,
        technicals: {},
        context: null,
      },
      timeframes: {},
    } as unknown as IntradayBuilt;

    renderTab(<PredictionTab built={built} activeTf="4h" />);

    expect(screen.getByText('EPS × PE 情景（Darren） · FY2028')).toBeTruthy();
    expect(screen.getByText('乐观')).toBeTruthy();
    expect(screen.getByText('悲观')).toBeTruthy();
    expect(screen.getByText('加权目标价')).toBeTruthy();
    expect(screen.getByText(/论点破坏（黑天鹅）/)).toBeTruthy();
    expect(screen.getByText('价格区间')).toBeTruthy();
  });
});
