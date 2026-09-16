import { useLocale } from '@web/lib/i18n';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, ChevronsRight, TriangleAlert } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { IntradayDashboard, IntradayTimeframeSwitch } from '../charts/intraday/IntradayDashboard';
import { ChartLayerMenu } from '../charts/intraday/ChartLayerMenu';
import { MaLinesMenu } from '../charts/intraday/MaLinesMenu';
import { withViewTimeframe } from '../charts/intraday/timeframes';
import { useViewTimeframe } from '../charts/intraday/useViewTimeframe';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { resolveIntradayTf, useIntradayDoc } from '../charts/intraday/useIntradayDoc';
import { SepaCockpit, type SepaDocView } from '../charts/sepa/SepaCockpit';
import { TopbarQuote } from '../quotes/QuoteBar';
import { marketOfSymbol } from '../../lib/market';
import { recordRecentSymbol } from '../charts/recentCharts';
import { Dot, ErrorBox, MarketTime, Tooltip } from '../../ui';
import { useTitle } from '../../lib/useTitle';
import { isDesktopRealtime } from '../../lib/portTransport';
import { AnalysisRunDetails } from './AnalysisRunDetails';
import { CockpitSkeleton } from './CockpitSkeleton';
import { AnalysisTimeline } from './AnalysisTimeline';
import { ChatDock } from './chat/ChatDock';
import type { AnalysisSection } from './AnalysisTab';
import { PreviewCockpit } from './PreviewCockpit';
import { ReanalyzeStrip } from './ReanalyzeStrip';
import { conclusionOutdated } from '../charts/intraday/ConclusionCard';
import { PredictionTab } from '../charts/intraday/tabs/PredictionTab';
import { EventCanvasHost } from '@web/features/events/EventCanvasHost';
import { buildSharedSidebarTabs } from './sharedSidebarTabs';
import { useAiUnreadBadge } from './useAiUnreadBadge';
import { useCockpitComments } from './useCockpitComments';
import { useCockpitEnv } from './useCockpitEnv';
import { useAnalystRun } from './useAnalystRun';
import { useCockpitReviewState } from './useCockpitReviewState';
import { useLatestAnalysis } from './useLatestAnalysis';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  page: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px 20px 60px',
  },
  pageTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  icon: {
    verticalAlign: '-2px',
  },
  fullpage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  fullpageDesktop: {
    height: 'calc(100vh - 40px)',
  },
  backLink: {
    'color': colors.textPrimary,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
  detailTopbar: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '12px',
    padding: '8px 14px',
    fontSize: fontSizes.md,
  },
  detailTopbarSplit: {
    display: 'grid',
    gap: 0,
    gridTemplateColumns: `1fr ${sizes.sidebarWidth}`,
    padding: 0,
  },
  topbarColumn: {
    alignItems: 'center',
    display: 'flex',
    gap: '12px',
    minWidth: 0,
    padding: '8px 14px',
  },
  topbarChart: {
    borderRightColor: colors.border,
    borderRightStyle: 'solid',
    borderRightWidth: '1px',
  },
  topbarSide: {
    gap: '8px',
  },
  topbarMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
  },
  topbarChartTail: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: '8px',
    marginLeft: 'auto',
  },
  detailBody: {
    flex: 1,
    minHeight: 0,
  },
  loadForwardButton: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderRadius': radii.default,
    'boxSizing': 'border-box',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.sm,
    'gap': '5px',
    'height': '26px',
    'padding': '0 9px',
    ':hover:not(:disabled)': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.borderStrong,
      color: colors.textPrimary,
    },
    ':disabled': {
      color: colors.textMuted,
      cursor: 'default',
    },
  },
  loadForwardIcon: {
    opacity: 0.55,
  },
  timeframeError: {
    color: colors.down,
    fontSize: fontSizes.sm,
    whiteSpace: 'nowrap',
  },
  alertBadge: {
    'alignItems': 'center',
    'backgroundColor': 'color-mix(in srgb, currentColor 10%, transparent)',
    'borderColor': 'color-mix(in srgb, currentColor 20%, transparent)',
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'boxSizing': 'border-box',
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontWeight': 500,
    'gap': '6px',
    'height': '26px',
    'letterSpacing': 'normal',
    'maxWidth': '320px',
    'padding': '0 9px 0 7px',
    'textTransform': 'none',
    'transition': 'background 0.12s ease, border-color 0.12s ease',
    'whiteSpace': 'nowrap',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, currentColor 16%, transparent)',
      borderColor: 'color-mix(in srgb, currentColor 32%, transparent)',
    },
  },
  alertBadgeText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  alertBadgeIcon: {
    gap: '4px',
    maxWidth: 'none',
    padding: '0 7px',
  },
});

export function SymbolCockpit({ sym }: { sym: string }) {
  const { t: i18n, locale } = useLocale();
  const symLabel = sym.toUpperCase().replace(/\.US$/, '');
  const desktopShell = isDesktopRealtime();
  const market = marketOfSymbol(sym);
  const {
    mode,
    activeId: latestId,
    latestChecked,
    latestError,
    hasNewer,
    jumpToLatest,
    goToLive,
    goToAnalysis,
    analyses,
  } = useLatestAnalysis(sym);

  const {
    doc,
    error,
    reload,
    degraded,
    live,
    canLoadForward,
    loadForward,
    forwardBusy,
    intradayTf,
    setIntradayTf,
    loadHistory,
  } = useIntradayDoc(mode === 'live' ? null : latestId);

  useTitle(doc ? doc.title || symLabel : latestChecked && !latestId ? symLabel : undefined);

  useEffect(() => {
    if (doc || (latestChecked && !latestId && !latestError)) recordRecentSymbol(sym);
  }, [sym, doc?.id, latestChecked, latestId, latestError]);

  const env = useCockpitEnv(sym);
  const {
    journalEntries,
    reloadJournal,
    reviewSection,
    setReviewSection,
    selectedJournal,
    setSelectedJournal,
  } = useCockpitReviewState(sym);

  const [activeTab, setActiveTab] = useState('analysis');
  const [analysisSection, setAnalysisSection] = useState<AnalysisSection>('prediction');
  const { comments, error: commentsError, loaded: commentsLoaded } = useCockpitComments(sym);
  const { unread, latestAlert } = useAiUnreadBadge(
    sym,
    comments,
    commentsLoaded,
    activeTab === 'analysis' && analysisSection === 'commentary' ? 'ai' : activeTab,
  );

  const intradaySidebar = doc?.built.kind === 'intraday' ? doc.built.sidebar : null;
  const viewTimeframe = useViewTimeframe(sym, intradayTf ?? '4h', {
    asOf: live ? undefined : intradaySidebar?.asOf,
    live,
  });
  const reassessNow = Date.now();
  const reassessNeeded =
    conclusionOutdated(
      intradaySidebar?.context?.generated_at,
      doc?.prediction_stale,
      reassessNow,
    ) ||
    conclusionOutdated(
      doc?.prediction_updated_at ?? intradaySidebar?.prediction?.anchor?.time,
      doc?.prediction_stale,
      reassessNow,
    );
  const conclusionRun = useAnalystRun(sym, mode !== 'live' && reassessNeeded);
  const conclusionReassess = {
    start: conclusionRun.start,
    busy: conclusionRun.pending || conclusionRun.running,
    hint: conclusionRun.hint,
    details: conclusionRun.status ? <AnalysisRunDetails status={conclusionRun.status} /> : null,
  };

  if (mode === 'live') {
    return (
      <PreviewCockpit
        sym={sym}
        analysesRows={analyses}
        onLive={goToLive}
        onSelectAnalysis={goToAnalysis}
      />
    );
  }

  if (latestChecked && !latestId) {
    if (latestError)
      return (
        <div className={`page ${stylex.props(styles.page).className}`}>
          <h1 className={stylex.props(styles.pageTitle).className}>{sym}</h1>
          <ErrorBox>{latestError}</ErrorBox>
          <p>
            <a className={`back-link ${stylex.props(styles.backLink).className}`} href="/">
              <ArrowLeft className={`icon ${stylex.props(styles.icon).className}`} size={13} />{' '}
              {i18n('cockpitBack')}
            </a>
          </p>
        </div>
      );
    return (
      <PreviewCockpit
        sym={sym}
        analysesRows={analyses}
        onLive={goToLive}
        onSelectAnalysis={goToAnalysis}
      />
    );
  }

  if (error) {
    return (
      <div className={`page ${stylex.props(styles.page).className}`}>
        <ErrorBox>{error}</ErrorBox>
        <p>
          <a className={`back-link ${stylex.props(styles.backLink).className}`} href="/">
            <ArrowLeft className={`icon ${stylex.props(styles.icon).className}`} size={13} />{' '}
            {i18n('cockpitBack')}
          </a>
        </p>
      </div>
    );
  }

  if (!doc) return <CockpitSkeleton />;

  if (doc.built.kind === 'sepa') {
    const sepaDoc: SepaDocView = { ...doc, built: doc.built };
    return <SepaCockpit sym={sym} doc={sepaDoc} reload={reload} />;
  }

  if (doc.built.kind !== 'intraday')
    return (
      <div className={`page ${stylex.props(styles.page).className}`}>
        <ErrorBox>{i18n('cockpitOldChart')}</ErrorBox>
      </div>
    );

  const activeIntradayTf = resolveIntradayTf(doc.built, intradayTf);
  const chartBuilt = withViewTimeframe(doc.built, activeIntradayTf, viewTimeframe.tf);
  const analysesRows = analyses;

  const sidebarTabs = buildSharedSidebarTabs({
    locale,
    sym,
    sidebar: doc.built.sidebar,
    anchorTf: activeIntradayTf,
    env,
    analysesRows,
    latestId,
    journalEntries,
    reloadJournal,
    reviewSection,
    setReviewSection,
    selectedJournal,
    setSelectedJournal,
    comments,
    commentsError,
    commentsLoaded,
    unread,
    analysisSection,
    setAnalysisSection,
    prediction: (
      <>
        <ReanalyzeStrip sym={sym} />
        <PredictionTab
          built={chartBuilt}
          activeTf={activeIntradayTf}
          predictionUpdatedAt={doc.prediction_updated_at}
          predictionStale={doc.prediction_stale}
        />
      </>
    ),
  });

  return (
    <EventCanvasHost>
      <IntradayControlsProvider>
        <div
          className={`fullpage ${stylex.props(styles.fullpage, desktopShell && styles.fullpageDesktop).className}`}
        >
          <div
            className={`detail-topbar detail-topbar--split ${stylex.props(styles.detailTopbar, styles.detailTopbarSplit).className}`}
          >
            <div
              className={`topbar-chart ${stylex.props(styles.topbarColumn, styles.topbarChart).className}`}
            >
              <a className={`back-link ${stylex.props(styles.backLink).className}`} href="/">
                <ArrowLeft className={`icon ${stylex.props(styles.icon).className}`} size={13} />{' '}
                {i18n('cockpitList')}
              </a>
              <span className={`meta ${stylex.props(styles.topbarMeta).className}`}>{sym}</span>
              {degraded && <Dot tone="accent" pulse title={i18n('cockpitStale')} />}
              <IntradayTimeframeSwitch activeTf={activeIntradayTf} onChange={setIntradayTf} />
              <AnalysisTimeline
                rows={analysesRows}
                activeId={latestId}
                mode={mode}
                onLive={goToLive}
                onSelect={goToAnalysis}
              />
              {canLoadForward && (
                <button
                  className={`load-forward-btn ${stylex.props(styles.loadForwardButton).className}`}
                  disabled={forwardBusy}
                  onClick={loadForward}
                  title={i18n('cockpitFrozenHelp')}
                >
                  <ChevronsRight
                    size={14}
                    className={`load-forward-icon ${stylex.props(styles.loadForwardIcon).className}`}
                  />
                  <span>{forwardBusy ? i18n('cockpitLoading') : i18n('cockpitLaterCandles')}</span>
                </button>
              )}
              {viewTimeframe.notice && (
                <span role="status" title={viewTimeframe.notice}>
                  {i18n('chartHistoryShort')}
                </span>
              )}
              {viewTimeframe.error && (
                <span
                  className={`tf-load-error ${stylex.props(styles.timeframeError).className}`}
                  title={viewTimeframe.error}
                >
                  {i18n('cockpitTimeframeFailed')}
                </span>
              )}
              <span
                className={`topbar-chart-tail ${stylex.props(styles.topbarChartTail).className}`}
              >
                <MaLinesMenu
                  built={chartBuilt}
                  activeTf={activeIntradayTf}
                  symbol={sym}
                  live={live}
                />
                <ChartLayerMenu built={chartBuilt} activeTf={activeIntradayTf} />
              </span>
            </div>
            <div
              className={`topbar-side ${stylex.props(styles.topbarColumn, styles.topbarSide).className}`}
            >
              {hasNewer && (
                <button
                  className={`badge badge--accent alert-badge ${stylex.props(styles.alertBadge).className}`}
                  onClick={jumpToLatest}
                >
                  <Dot tone="accent" pulse />
                  <span
                    className={`alert-badge-text ${stylex.props(styles.alertBadgeText).className}`}
                  >
                    {i18n('cockpitNewAnalysis')}
                  </span>
                </button>
              )}
              {latestAlert && (
                <Tooltip
                  content={
                    <>
                      AI{' '}
                      {latestAlert.level === 'alert'
                        ? i18n('cockpitAlert')
                        : i18n('cockpitReminder')}{' '}
                      <MarketTime value={latestAlert.ts} format="clock" market={market} /> ·{' '}
                      {latestAlert.trigger ?? latestAlert.text}
                    </>
                  }
                >
                  <button
                    className={`badge badge--${latestAlert.level === 'alert' ? 'down' : 'accent'} alert-badge alert-badge--icon ${stylex.props(styles.alertBadge, styles.alertBadgeIcon).className}`}
                    onClick={() => {
                      setActiveTab('analysis');
                      setAnalysisSection('commentary');
                    }}
                    aria-label={i18n('cockpitAiAlert', {
                      level: i18n(
                        latestAlert.level === 'alert' ? 'cockpitAlert' : 'cockpitReminder',
                      ),
                      text: latestAlert.text,
                    })}
                  >
                    <Dot tone={latestAlert.level === 'alert' ? 'down' : 'accent'} pulse />
                    {latestAlert.level === 'alert' ? (
                      <TriangleAlert
                        className={`icon ${stylex.props(styles.icon).className}`}
                        size={13}
                      />
                    ) : (
                      <Bell className={`icon ${stylex.props(styles.icon).className}`} size={13} />
                    )}
                  </button>
                </Tooltip>
              )}
              {doc.symbol && <TopbarQuote sym={sym} />}
            </div>
          </div>
          <div className={`detail-body ${stylex.props(styles.detailBody).className}`}>
            <IntradayDashboard
              symbol={sym}
              built={chartBuilt}
              activeTf={activeIntradayTf}
              predictionUpdatedAt={doc.prediction_updated_at}
              predictionStale={doc.prediction_stale}
              conclusionReassess={conclusionReassess}
              onLoadHistory={loadHistory}
              sidebarTabs={sidebarTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              dock={<ChatDock chartId={doc.id} docCreatedAt={doc.created_at} />}
              live={live}
            />
          </div>
        </div>
      </IntradayControlsProvider>
    </EventCanvasHost>
  );
}
