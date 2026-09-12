import { useLocale } from '@web/lib/i18n';
import type { SymbolAnalysisRow } from '@kansoku/shared/types';
import { formatMarketMonthDayTime } from '@kansoku/shared/time';
import { tradeDirectionLabel } from '@web/lib/marketLabels';
import { Select } from '@web/ui';
import type { AnalysisViewMode } from './analysisMode';

const LIVE_VALUE = '__live_view__';
const LATEST_VALUE = '__latest_analysis__';

export function AnalysisTimeline({
  rows,
  activeId,
  mode,
  onLive,
  onSelect,
}: {
  rows: SymbolAnalysisRow[];
  activeId: string | null;
  mode: AnalysisViewMode;
  onLive: () => void;
  onSelect: (id: string | null) => void;
}) {
  const { t: i18n, locale } = useLocale();
  if (rows.length === 0) return null;
  const options = [
    { value: LIVE_VALUE, label: i18n('cockpitLive') },
    { value: LATEST_VALUE, label: i18n('cockpitLatest') },
    ...rows.map((row) => ({
      value: row.id,
      label: `${formatMarketMonthDayTime(row.created_at)}${row.direction ? ` · ${tradeDirectionLabel(row.direction, locale)}` : ''}`,
    })),
  ];
  return (
    <Select
      size="sm"
      value={
        mode === 'live' ? LIVE_VALUE : mode === 'latest' ? LATEST_VALUE : (activeId ?? LATEST_VALUE)
      }
      options={options}
      onChange={(value) => {
        if (value === LIVE_VALUE) onLive();
        else onSelect(value === LATEST_VALUE ? null : value);
      }}
    />
  );
}
