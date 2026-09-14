import type { MessageKey } from '@web/lib/i18n';
import { useCallback, useEffect, useState } from 'react';
import type { FeatureKey } from '@kansoku/pro-api/features';
import { theme } from '@web/lib/theme';

export type IndicatorToggleKey =
  | 'crosses'
  | 'divergence'
  | 'macdBeichi'
  | 'pattern123'
  | 'sb'
  | 'candle'
  | 'ai'
  | 'levels'
  | 'fvg'
  | 'ema'
  | 'vwap'
  | 'boll'
  | 'macd'
  | 'rsi'
  | 'daylevel'
  | 'optwall'
  | 'chanFenxing'
  | 'chanBi'
  | 'chanXianduan'
  | 'chanZhongshu'
  | 'chanBuySell1'
  | 'chanBuySell2'
  | 'chanBuySell3';

const BASE_TOGGLE_ORDER: IndicatorToggleKey[] = [
  'ema',
  'vwap',
  'boll',
  'macd',
  'rsi',
  'levels',
  'daylevel',
  'fvg',
  'pattern123',
  'sb',
  'optwall',
  'crosses',
  'divergence',
  'macdBeichi',
  'candle',
  'ai',
];

export const CHAN_STRUCTURE_TOGGLE_KEYS: IndicatorToggleKey[] = [
  'chanFenxing',
  'chanBi',
  'chanXianduan',
  'chanZhongshu',
];

export const CHAN_BUYSELL_TOGGLE_KEYS: IndicatorToggleKey[] = [
  'chanBuySell1',
  'chanBuySell2',
  'chanBuySell3',
];

const INDICATOR_TOGGLE_ORDER: IndicatorToggleKey[] = [
  ...BASE_TOGGLE_ORDER,
  ...CHAN_STRUCTURE_TOGGLE_KEYS,
  ...CHAN_BUYSELL_TOGGLE_KEYS,
];

export const INDICATOR_TOGGLE_LABELS: Record<IndicatorToggleKey, MessageKey> = {
  crosses: 'indicatorCross',
  divergence: 'indicatorDivergence',
  macdBeichi: 'indicatorMacdDivergence',
  pattern123: 'indicator123',
  sb: 'indicatorSb',
  candle: 'indicatorCandle',
  ai: 'indicatorAi',
  levels: 'indicatorLevels',
  fvg: 'indicatorFvg',
  ema: 'indicatorEma',
  vwap: 'indicatorVwap',
  boll: 'indicatorBoll',
  macd: 'indicatorMacd',
  rsi: 'indicatorRsi',
  daylevel: 'indicatorDay',
  optwall: 'indicatorOptions',
  chanFenxing: 'indicatorFractal',
  chanBi: 'indicatorStroke',
  chanXianduan: 'indicatorSegment',
  chanZhongshu: 'indicatorCenter',
  chanBuySell1: 'indicatorType1',
  chanBuySell2: 'indicatorType2',
  chanBuySell3: 'indicatorType3',
};

export const INDICATOR_TOGGLE_COLORS: Record<IndicatorToggleKey, string> = {
  ema: theme.accent,
  vwap: theme.up,
  boll: '#38bdf8',
  macd: theme.accent,
  rsi: '#a78bfa',
  levels: theme.textSecondary,
  daylevel: theme.textPrimary,
  fvg: theme.up,
  pattern123: theme.accent,
  sb: theme.accent,
  optwall: theme.down,
  crosses: theme.up,
  divergence: theme.down,
  macdBeichi: theme.textSecondary,
  candle: theme.accent,
  ai: theme.accent,
  chanFenxing: theme.accent,
  chanBi: theme.accent,
  chanXianduan: theme.accent,
  chanZhongshu: '#808080',
  chanBuySell1: theme.up,
  chanBuySell2: theme.up,
  chanBuySell3: theme.up,
};

export const INDICATOR_TOGGLE_KEYS = INDICATOR_TOGGLE_ORDER;

export const INDICATOR_FEATURE_GATES: Partial<Record<IndicatorToggleKey, FeatureKey>> = {
  divergence: 'auto-patterns',
  macdBeichi: 'auto-patterns',
  pattern123: 'auto-patterns',
  sb: 'auto-patterns',
  candle: 'auto-patterns',
  optwall: 'options-walls',
};

export type MarkerRange = 'recent' | 'all';

export interface IndicatorPreset {
  key: string;
  label: MessageKey;
  on: IndicatorToggleKey[];
}

export const INDICATOR_PRESETS: IndicatorPreset[] = [
  { key: 'lean', label: 'indicatorLean', on: ['ema', 'vwap', 'macd', 'levels', 'daylevel'] },
  {
    key: 'std',
    label: 'indicatorStandard',
    on: ['ema', 'vwap', 'macd', 'levels', 'daylevel', 'sb'],
  },
  { key: 'all', label: 'layerAll', on: [...BASE_TOGGLE_ORDER] },
];

export const INDICATOR_STORAGE_KEY = 'intraday-indicators';

const DEFAULT_ON = new Set<IndicatorToggleKey>(['ema', 'vwap', 'macd', 'levels', 'daylevel', 'sb']);

function defaultToggles(): Record<IndicatorToggleKey, boolean> {
  return Object.fromEntries(INDICATOR_TOGGLE_KEYS.map((k) => [k, DEFAULT_ON.has(k)])) as Record<
    IndicatorToggleKey,
    boolean
  >;
}

function loadStored(storageKey: string): {
  toggles: Record<IndicatorToggleKey, boolean>;
  markerRange: MarkerRange;
} {
  const toggles = defaultToggles();
  let markerRange: MarkerRange = 'recent';
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { toggles, markerRange };
    const stored = JSON.parse(raw) as Partial<Record<string, unknown>>;
    for (const key of INDICATOR_TOGGLE_KEYS) {
      if (typeof stored[key] === 'boolean') toggles[key] = stored[key] as boolean;
    }
    if (stored.markerRange === 'all') markerRange = 'all';
  } catch {
    return { toggles, markerRange };
  }
  return { toggles, markerRange };
}

export function useIndicatorToggles(storageKey: string = INDICATOR_STORAGE_KEY) {
  const [{ toggles, markerRange }, setState] = useState(() => loadStored(storageKey));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ ...toggles, markerRange }));
  }, [storageKey, toggles, markerRange]);

  const set = useCallback((key: IndicatorToggleKey, value: boolean) => {
    setState((prev) =>
      prev.toggles[key] === value ? prev : { ...prev, toggles: { ...prev.toggles, [key]: value } },
    );
  }, []);

  const applyPreset = useCallback((on: IndicatorToggleKey[]) => {
    const wanted = new Set(on);
    setState((prev) => ({
      ...prev,
      toggles: Object.fromEntries(
        INDICATOR_TOGGLE_KEYS.map((k) => [
          k,
          BASE_TOGGLE_ORDER.includes(k) ? wanted.has(k) : prev.toggles[k],
        ]),
      ) as Record<IndicatorToggleKey, boolean>,
    }));
  }, []);

  const setMarkerRange = useCallback((markerRange: MarkerRange) => {
    setState((prev) => (prev.markerRange === markerRange ? prev : { ...prev, markerRange }));
  }, []);

  return { toggles, set, applyPreset, markerRange, setMarkerRange };
}
