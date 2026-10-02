import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useQueryClient } from '@tanstack/react-query';
import { Play, RefreshCw } from 'lucide-react';
import type { WatchlistScanState } from '@kansoku/shared/types';
import { errorMessage } from '@web/lib/api';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { useLocale } from '@web/lib/i18n';
import { Button, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { loadAnalysisTimeframes } from '../charts/intraday/timeframes';
import { readPinnedAnchor, SCAN_REASON_TEXT } from '../scan/scanShared';

const POLL_MS = 3_000;

const styles = stylex.create({
  row: {
    alignItems: 'center',
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginLeft: 'auto',
    textTransform: 'none',
  },
  text: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: 400,
    letterSpacing: 'normal',
  },
  error: {
    color: colors.down,
    fontSize: fontSizes.sm,
    fontWeight: 400,
    letterSpacing: 'normal',
  },
  link: {
    color: colors.accent,
    fontSize: fontSizes.sm,
    fontWeight: 400,
  },
});

function settledCount(state: WatchlistScanState): number {
  return state.items.filter((item) => item.status !== 'queued' && item.status !== 'running')
    .length;
}

/**
 * Next to the Positions title: Refresh (reload positions now, past every cache) and
 * Analyze all positions (the Run analysis of the Prediction tab, for every holding, run
 * by the scan two at a time; results open on the Scan page).
 */
export function PositionsActions({ count }: { count: number }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Same query as the Scan page, so both show the same run.
  const scan = usePollingQuery<WatchlistScanState>(
    'overview.scanStatus',
    () => client.overview.scanStatus(),
    (data) => (data?.running ? POLL_MS : false),
    { cache: false },
  );
  const state = scan.data;
  const positionsRun = state?.scope === 'positions';
  const running = state?.running === true;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const data = await client.positions.refresh();
      queryClient.setQueryData(['positions.list'], data);
    } catch {
      // Refetch so the card shows the error in its usual place.
      await queryClient.invalidateQueries({ queryKey: ['positions.list'] });
    } finally {
      setRefreshing(false);
    }
  };

  const start = async () => {
    setConfirming(false);
    setStarting(true);
    setNotice(null);
    try {
      const windows = loadAnalysisTimeframes();
      const anchor = readPinnedAnchor(windows);
      const result = await client.overview.scanStart({
        timeframes: [...windows],
        ...(anchor ? { anchorTf: anchor } : {}),
        scope: 'positions',
      });
      if (!result.started) setNotice(t(SCAN_REASON_TEXT[result.reason]));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setStarting(false);
      scan.reload();
    }
  };

  return (
    <span className={`positions-actions ${stylex.props(styles.row).className}`}>
      <Button
        size="sm"
        disabled={refreshing}
        title={t('homeRefreshPositions')}
        onClick={() => void refresh()}
      >
        {refreshing ? <Spinner /> : <RefreshCw size={13} />} {t('homeRefreshPositions')}
      </Button>

      {running ? (
        <span {...stylex.props(styles.text)}>
          <Spinner />{' '}
          {positionsRun
            ? t('homeAnalyzingPositions', { done: settledCount(state), total: state.items.length })
            : t('homeAnalyzeOtherRunning')}{' '}
          <a {...stylex.props(styles.link)} href="/scan">
            {t('homeAnalyzeView')}
          </a>
        </span>
      ) : confirming ? (
        <>
          <span {...stylex.props(styles.text)}>
            {t('homeAnalyzeConfirm', { count: String(count) })}
          </span>
          <Button size="sm" accent disabled={starting} onClick={() => void start()}>
            {t('homeAnalyzeStart')}
          </Button>
          <Button size="sm" onClick={() => setConfirming(false)}>
            {t('homeAnalyzeCancel')}
          </Button>
        </>
      ) : (
        <>
          <Button
            size="sm"
            accent
            disabled={starting || count === 0}
            onClick={() => setConfirming(true)}
          >
            {starting ? <Spinner /> : <Play size={13} />} {t('homeAnalyzeAllPositions')}
          </Button>
          {positionsRun && state?.finished_at && (
            <a {...stylex.props(styles.link)} href="/scan">
              {t('homeAnalyzeView')}
            </a>
          )}
        </>
      )}
      {notice && <span {...stylex.props(styles.error)}>{notice}</span>}
    </span>
  );
}
