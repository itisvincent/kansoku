import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { WatchlistScanState } from '@kansoku/shared/types';
import { errorMessage } from '@web/lib/api';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { useLocale } from '@web/lib/i18n';
import { useTitle } from '@web/lib/useTitle';
import { Button, Card, ErrorBox, MarketTime, NoteBlock, SectionTitle, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { loadAnalysisTimeframes, tfLabel } from '../charts/intraday/timeframes';
import { ItemList, RangeList, SetupList } from './ScanResults';
import { countRerunnable, readPinnedAnchor, SCAN_REASON_TEXT } from './scanShared';

const TOP_COUNT = 3;

/** scan: a new watchlist scan; again: the last scan as it was set up; failed: its failures. */
type ScanAction = 'scan' | 'again' | 'failed';
const POLL_MS = 3000;

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    margin: '0 auto',
    maxWidth: '980px',
    padding: '16px',
  },
  back: {
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'marginLeft': '10px',
    'textDecoration': 'none',
    ':hover': { color: colors.accent },
  },
  text: { color: colors.textSecondary, fontSize: fontSizes.sm, lineHeight: 1.6, margin: 0 },
  hint: { color: colors.textMuted, fontSize: fontSizes.sm, lineHeight: 1.5, margin: '0 0 6px' },
  controls: { alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '10px' },
  settings: { color: colors.textSecondary, fontSize: fontSizes.sm },
  error: { color: colors.down, fontSize: fontSizes.sm },
});

/** The scan has no chart being viewed, so "follow chart" leaves the anchor to the AI. */
function Progress({ state }: { state: WatchlistScanState }) {
  const { t } = useLocale();
  const settled = state.items.filter((item) => item.status !== 'queued' && item.status !== 'running');
  if (state.running) {
    return (
      <span className={stylex.props(styles.settings).className}>
        <Spinner /> {t('scanProgress', { done: settled.length, total: state.items.length })}
      </span>
    );
  }
  if (!state.finished_at) return null;
  return (
    <span className={stylex.props(styles.settings).className}>
      {t('scanFinished')} <MarketTime value={state.finished_at} format="date-time" />
    </span>
  );
}

function ScanBody({ state }: { state: WatchlistScanState }) {
  const { t } = useLocale();
  if (state.items.length === 0) return <NoteBlock>{t('scanEmpty')}</NoteBlock>;
  return (
    <>
      {state.skipped_over_cap > 0 && (
        <NoteBlock>
          {t('scanOverCap', { count: state.items.length, skipped: state.skipped_over_cap })}
        </NoteBlock>
      )}
      <Card>
        <SectionTitle>{t('scanTop')}</SectionTitle>
        <p className={stylex.props(styles.hint).className}>{t('scanTopHint')}</p>
        <SetupList setups={state.setups.slice(0, TOP_COUNT)} />
      </Card>
      {state.setups.length > TOP_COUNT && (
        <Card>
          <SectionTitle>{t('scanAll')}</SectionTitle>
          <SetupList setups={state.setups} />
        </Card>
      )}
      {state.ranges.length > 0 && (
        <Card>
          <SectionTitle>{t('scanRanges')}</SectionTitle>
          <p className={stylex.props(styles.hint).className}>{t('scanRangesHint')}</p>
          <RangeList ranges={state.ranges} />
        </Card>
      )}
      <Card>
        <SectionTitle>{t('scanTitle')}</SectionTitle>
        <ItemList items={state.items} />
      </Card>
    </>
  );
}

export function ScanPage() {
  const { t, locale } = useLocale();
  useTitle(t('scanTitle'));
  const windows = loadAnalysisTimeframes();
  const anchor = readPinnedAnchor(windows);
  const [confirming, setConfirming] = useState<ScanAction | null>(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const query = usePollingQuery(
    'overview.scanStatus',
    () => client.overview.scanStatus(),
    (data) => (data?.running ? POLL_MS : false),
    { cache: false },
  );
  const state = query.data;
  const running = state?.running === true;
  const rerunCount = state ? countRerunnable(state.items) : 0;

  const launch = async (action: ScanAction) => {
    setConfirming(null);
    setStarting(true);
    setNotice(null);
    try {
      const result =
        action === 'failed'
          ? await client.overview.scanRerunFailed()
          : action === 'again' && state
            ? await client.overview.scanStart({
                timeframes: [...state.timeframes],
                ...(state.anchor_tf ? { anchorTf: state.anchor_tf } : {}),
                scope: state.scope,
              })
            : await client.overview.scanStart({
                timeframes: [...windows],
                ...(anchor ? { anchorTf: anchor } : {}),
              });
      if (!result.started) setNotice(t(SCAN_REASON_TEXT[result.reason]));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setStarting(false);
      query.reload();
    }
  };

  const confirmText: Record<ScanAction, { button: string; hint: string }> = {
    scan: { button: t('scanConfirm'), hint: t('scanConfirmHint') },
    again: {
      button: t('scanAgainConfirm'),
      hint: t('scanAgainHint', { count: state?.items.length ?? 0 }),
    },
    failed: { button: t('scanRerunConfirm'), hint: t('scanRerunHint', { count: rerunCount }) },
  };

  const stop = async () => {
    try {
      await client.overview.scanCancel();
    } catch (error) {
      setNotice(errorMessage(error));
    }
    query.reload();
  };

  return (
    <div className={`scan-page ${stylex.props(styles.root).className}`}>
      <SectionTitle>
        {state?.scope === 'positions' ? t('scanTitlePositions') : t('scanTitle')}
        <a className={stylex.props(styles.back).className} href="/">
          ← {t('backHome')}
        </a>
      </SectionTitle>
      <p className={stylex.props(styles.text).className}>{t('scanIntro')}</p>
      <p className={stylex.props(styles.settings).className}>
        {t('scanWindows', { windows: windows.map((tf) => tfLabel(tf, locale)).join(' · ') })}
        {' · '}
        {anchor ? t('scanAnchor', { tf: tfLabel(anchor, locale) }) : t('scanAnchorAuto')}
      </p>
      <div className={stylex.props(styles.controls).className}>
        {running ? (
          <Button onClick={() => void stop()}>{t('scanStop')}</Button>
        ) : confirming ? (
          <>
            <Button accent disabled={starting} onClick={() => void launch(confirming)}>
              {confirmText[confirming].button}
            </Button>
            <Button onClick={() => setConfirming(null)}>{t('scanCancelConfirm')}</Button>
            <span className={stylex.props(styles.settings).className}>
              {confirmText[confirming].hint}
            </span>
          </>
        ) : (
          <>
            <Button accent disabled={starting} onClick={() => setConfirming('scan')}>
              {starting && <Spinner />}
              {t('scanStart')}
            </Button>
            {state && state.items.length > 0 && (
              <Button disabled={starting} onClick={() => setConfirming('again')}>
                {t('scanAgain')}
              </Button>
            )}
            {rerunCount > 0 && (
              <Button disabled={starting} onClick={() => setConfirming('failed')}>
                {t('scanRerunFailed', { count: rerunCount })}
              </Button>
            )}
          </>
        )}
        {state && <Progress state={state} />}
        {notice && <span className={stylex.props(styles.error).className}>{notice}</span>}
      </div>
      {state ? (
        <>
          {/* One failed poll should not hide results that are already on screen. */}
          {query.error && <span className={stylex.props(styles.error).className}>{query.error}</span>}
          <ScanBody state={state} />
        </>
      ) : query.error ? (
        <ErrorBox>{query.error}</ErrorBox>
      ) : (
        <NoteBlock>
          <Spinner />
        </NoteBlock>
      )}
    </div>
  );
}
