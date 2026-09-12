import { useLocale, type Translator } from '@web/lib/i18n';
import { useMemo } from 'react';
import type { IntradayBuilt } from '@kansoku/shared/types';
import type { FeatureKey } from '@kansoku/pro-api/features';
import { useFeature } from '@web/features/edition/useFeature';
import { LayerPanel, type LayerGroup, type LayerItem, type LayerPreset } from '../LayerPanel';
import { useIntradayControls } from './controlsContext';
import { tfDataOf, type ChartTf } from './timeframes';
import {
  CHAN_BUYSELL_TOGGLE_KEYS,
  CHAN_STRUCTURE_TOGGLE_KEYS,
  INDICATOR_FEATURE_GATES,
  INDICATOR_PRESETS,
  INDICATOR_TOGGLE_COLORS,
  INDICATOR_TOGGLE_LABELS,
  type IndicatorToggleKey,
} from './useIndicatorToggles';

const toLayerItem = (
  key: IndicatorToggleKey,
  setToggle: (key: IndicatorToggleKey, value: boolean) => void,
  tr: Translator,
): LayerItem => ({
  key,
  label: tr(INDICATOR_TOGGLE_LABELS[key]),
  color: INDICATOR_TOGGLE_COLORS[key],
  toggle: (v: boolean) => setToggle(key, v),
});

interface ChartLayerMenuProps {
  built: IntradayBuilt;
  activeTf: ChartTf;
}

export function ChartLayerMenu({ built, activeTf }: ChartLayerMenuProps) {
  const { t: tr } = useLocale();
  const LAYER_GROUP_DEFS: { title: string; keys: IndicatorToggleKey[] }[] = [
    { title: tr('layerReference'), keys: ['ema', 'vwap', 'boll', 'levels', 'daylevel', 'optwall'] },
    { title: tr('layerStructure'), keys: ['fvg', 'pattern123', 'sb', 'candle'] },
    { title: tr('layerSignals'), keys: ['crosses', 'divergence', 'macdBeichi', 'ai'] },
  ];

  const {
    toggles,
    set: setToggle,
    applyPreset,
    markerRange,
    setMarkerRange,
  } = useIntradayControls();
  const autoPatternsFeature = useFeature('auto-patterns');
  const optionsWallsFeature = useFeature('options-walls');
  const gatedFeatures: Partial<Record<FeatureKey, typeof autoPatternsFeature>> = {
    'auto-patterns': autoPatternsFeature,
    'options-walls': optionsWallsFeature,
  };
  const activeTfData = tfDataOf(built, activeTf);
  const layerDataCounts: Partial<Record<IndicatorToggleKey, number>> = {
    fvg: activeTfData?.fvgZones?.length ?? 0,
    pattern123: activeTfData?.pattern123?.length ?? 0,
    sb: activeTfData?.secondBreakouts?.length ?? 0,
    divergence: activeTfData?.autoDivergence?.length ?? 0,
    macdBeichi: activeTfData?.autoBeichi?.length ?? 0,
    candle: activeTfData?.markers?.filter((marker) => marker.group === 'candle').length ?? 0,
  };

  const lockedToggleKeys = useMemo(() => {
    const keys = new Set<IndicatorToggleKey>();
    for (const [key, featureKey] of Object.entries(INDICATOR_FEATURE_GATES) as [
      IndicatorToggleKey,
      FeatureKey,
    ][]) {
      if (!gatedFeatures[featureKey]?.active) keys.add(key);
    }
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPatternsFeature.active, optionsWallsFeature.active]);

  const layerGroups: LayerGroup[] = useMemo(() => {
    const staticGroups = LAYER_GROUP_DEFS.map(({ title, keys }) => ({
      title,
      items: keys.map((key) => {
        const featureKey = INDICATOR_FEATURE_GATES[key];
        const locked = lockedToggleKeys.has(key);
        return {
          key,
          label:
            layerDataCounts[key] === undefined
              ? tr(INDICATOR_TOGGLE_LABELS[key])
              : `${tr(INDICATOR_TOGGLE_LABELS[key])} · ${layerDataCounts[key]}`,
          color: INDICATOR_TOGGLE_COLORS[key],
          toggle: (v: boolean) => setToggle(key, v),
          locked,
          onLockedClick: featureKey ? () => gatedFeatures[featureKey]?.guard(() => {}) : undefined,
        };
      }),
    }));
    const chanStructureOn = CHAN_STRUCTURE_TOGGLE_KEYS.filter((key) => toggles[key]).length;
    const chanBuySellOn = CHAN_BUYSELL_TOGGLE_KEYS.filter((key) => toggles[key]).length;
    return [
      ...staticGroups,
      {
        title: tr('chartChanStructure', {
          on: chanStructureOn,
          total: CHAN_STRUCTURE_TOGGLE_KEYS.length,
        }),
        items: CHAN_STRUCTURE_TOGGLE_KEYS.map((key) => toLayerItem(key, setToggle, tr)),
      },
      {
        title: tr('chartChanSignals', {
          on: chanBuySellOn,
          total: CHAN_BUYSELL_TOGGLE_KEYS.length,
        }),
        items: CHAN_BUYSELL_TOGGLE_KEYS.map((key) => toLayerItem(key, setToggle, tr)),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tr,
    activeTfData,
    lockedToggleKeys,
    setToggle,
    autoPatternsFeature.locked,
    optionsWallsFeature.locked,
    toggles,
  ]);

  const filteredPresets: LayerPreset[] = useMemo(
    () =>
      INDICATOR_PRESETS.map((p) => ({
        ...p,
        label: tr(p.label),
        on: p.on.filter((key) => !lockedToggleKeys.has(key)),
      })),
    [lockedToggleKeys, tr],
  );

  return (
    <LayerPanel
      inline
      groups={layerGroups}
      checked={toggles}
      presets={filteredPresets}
      onPreset={(on) => applyPreset(on as IndicatorToggleKey[])}
      range={markerRange}
      onRangeChange={setMarkerRange}
    />
  );
}
