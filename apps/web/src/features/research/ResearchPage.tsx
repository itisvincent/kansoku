import { chineseTranslator, type Translator } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import { useDeferredValue, useEffect, useState } from 'react';
import {
  ChartCandlestick,
  ChevronLeft,
  Library,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  AssistantSessionMeta,
  ResearchCreateResult,
  ResearchDocument,
  ResearchDocumentMeta,
} from '@kansoku/core/contract/index';
import { canvasSlugFromResearchPath } from '@kansoku/core/contract/index';
import { FREE_CANVAS_LIMIT } from '@kansoku/core/canvas/quota';
import * as stylex from '@stylexjs/stylex';
import { CanvasFrame } from '@web/features/canvas/CanvasFrame';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { openLicenseModal } from '@web/features/edition/licenseModalStore';
import { errorMessage } from '@web/lib/api';
import { usePollingQuery, useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { queryClient } from '@web/lib/queryClient';
import { navigate, routePathname, useQueryParam, useRoute } from '@web/lib/router';
import { isDesktopRealtime } from '@web/lib/portTransport';
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Input,
  MarketTime,
  ResizablePanel,
  SegmentedControl,
  type SegmentedControlOption,
  Spinner,
} from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import { Markdown } from '../cockpit/markdown';
import { openCreateResearchDialog } from './CreateResearchDialog';
import { ResearchAssistant } from './ResearchAssistant';
import {
  kindForView,
  parseResearchView,
  relatedDocuments,
  researchListSecondary,
  researchListTitle,
  researchRoute,
  researchTypeLabel,
  type ResearchView,
  viewForKind,
} from './researchModel';

const CREATE_HINT_MS = 4000;

function viewOptions(
  counts: Record<ResearchView, number>,
  tr: Translator = chineseTranslator,
): SegmentedControlOption<ResearchView>[] {
  const VIEW_LABELS: { value: ResearchView; text: string }[] = [
    { value: 'stocks', text: tr('researchStocks') },
    { value: 'journal', text: tr('researchJournal') },
    { value: 'canvases', text: tr('researchCanvas') },
  ];

  return VIEW_LABELS.map((option) => ({
    value: option.value,
    label: (
      <>
        {option.text}
        <span className={stylex.props(styles.viewCount).className}>{counts[option.value]}</span>
      </>
    ),
  }));
}

function explorerLabel(view: ResearchView, tr: Translator = chineseTranslator): string {
  if (view === 'stocks') return tr('researchStocks');
  if (view === 'canvases') return tr('researchCanvas');
  return tr('researchTimeline');
}

function searchPlaceholder(view: ResearchView, tr: Translator = chineseTranslator): string {
  if (view === 'stocks') return tr('researchSearchStocks');
  if (view === 'canvases') return tr('researchSearchCanvas');
  return tr('researchSearchJournal');
}

function CanvasQuotaHint({ count }: { count: number }) {
  const { t: tr } = useLocale();
  const { pro, licensed } = useCapabilities();
  if (licensed) return <span>{count}</span>;
  const atLimit = count >= FREE_CANVAS_LIMIT;
  return (
    <span className={stylex.props(styles.quota).className}>
      {tr('researchFree')} {Math.min(count, FREE_CANVAS_LIMIT)}/{FREE_CANVAS_LIMIT}
      {atLimit && pro !== false ? (
        <button
          type="button"
          className={stylex.props(styles.quotaUpgrade).className}
          onClick={() => openLicenseModal('guard')}
        >
          {tr('researchUpgrade')}
        </button>
      ) : null}
    </span>
  );
}

const EXPLORER_MIN_WIDTH = 240;
const EXPLORER_MAX_WIDTH = 520;
const EXPLORER_WIDTH_STORAGE_KEY = 'kansoku.research.explorer-width';
const PENDING_LIST_POLL_MS = 2000;

const styles = stylex.create({
  fullpage: {
    'display': 'flex',
    'flexDirection': 'column',
    'height': '100cqh',
    'overflow': 'hidden',
    '@media (max-width: 760px)': {
      height: 'auto',
      minHeight: '100cqh',
      overflow: 'visible',
    },
  },
  fullpageDesktop: {
    'height': 'calc(100cqh - 40px)',
    '@media (max-width: 760px)': {
      height: 'auto',
      minHeight: 'calc(100cqh - 40px)',
    },
  },
  page: {
    backgroundColor: colors.backgroundCanvas,
    color: colors.textPrimary,
  },
  header: {
    'alignItems': 'center',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'display': 'flex',
    'flex': '0 0 auto',
    'gap': '24px',
    'minHeight': '46px',
    'padding': '0 12px 0 12px',
    '@media (max-width: 760px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: '10px',
      minHeight: 0,
      padding: '10px 48px 10px 12px',
    },
  },
  headerDesktop: {
    '@media (max-width: 760px)': {
      paddingRight: '14px',
    },
  },
  home: {
    'alignItems': 'center',
    'color': colors.textSecondary,
    'display': 'flex',
    'flex': '0 0 auto',
    'gap': '7px',
    'minWidth': 0,
    'textDecoration': 'none',
    ':hover': {
      color: colors.textPrimary,
    },
  },
  homeChevron: {
    color: colors.textMuted,
    flex: '0 0 auto',
  },
  titleIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 176, 0, 0.08)',
    borderColor: 'rgba(255, 176, 0, 0.28)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    color: colors.accent,
    display: 'inline-flex',
    flex: '0 0 auto',
    height: '22px',
    justifyContent: 'center',
    width: '22px',
  },
  titleHeadingTitle: {
    color: 'inherit',
    fontSize: fontSizes.base,
    fontWeight: 600,
    margin: 0,
    whiteSpace: 'nowrap',
  },
  controls: {
    'alignItems': 'center',
    'display': 'flex',
    'flex': '1 1 auto',
    'gap': '8px',
    'justifyContent': 'flex-end',
    'minWidth': 0,
    '@media (max-width: 760px)': {
      flexWrap: 'wrap',
      justifyContent: 'stretch',
    },
  },
  viewSwitch: {
    'flex': '0 0 auto',
    'height': '28px',
    '@media (max-width: 760px)': {
      justifyContent: 'flex-start',
    },
  },
  viewCount: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.default,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    lineHeight: '15px',
    padding: '0 5px',
  },
  searchActions: {
    'alignItems': 'center',
    'display': 'flex',
    'flex': '0 0 calc(clamp(320px, 24vw, 420px) - 14px)',
    'gap': '8px',
    'minWidth': 0,
    'paddingLeft': '16px',
    '@media (max-width: 1100px)': {
      flex: '0 1 290px',
      paddingLeft: 0,
    },
    '@media (max-width: 760px)': {
      flex: '2 1 240px',
    },
  },
  search: {
    alignItems: 'center',
    display: 'flex',
    flex: '1 1 auto',
    minWidth: 0,
    position: 'relative',
  },
  searchIcon: {
    color: colors.textMuted,
    left: '9px',
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: '30px',
    width: '100%',
  },
  visuallyHidden: {
    border: 0,
    clip: 'rect(0, 0, 0, 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: '1px',
  },
  refresh: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': '28px',
    'justifyContent': 'center',
    'padding': 0,
    'width': '28px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      borderColor: colors.borderStrong,
      color: colors.textPrimary,
    },
  },
  quota: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: '8px',
  },
  quotaUpgrade: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': 'rgba(255, 176, 0, 0.4)',
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.accent,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.xs,
    'height': '22px',
    'letterSpacing': 0,
    'padding': '0 8px',
    ':hover': {
      backgroundColor: 'rgba(255, 176, 0, 0.1)',
      borderColor: colors.accent,
    },
  },
  newButton: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': 'rgba(255, 176, 0, 0.4)',
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.accent,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'fontSize': fontSizes.xs,
    'gap': '5px',
    'height': '22px',
    'letterSpacing': 0,
    'padding': '0 8px',
    'textTransform': 'none',
    ':hover': {
      backgroundColor: 'rgba(255, 176, 0, 0.1)',
      borderColor: colors.accent,
      color: colors.accent,
    },
  },
  createHint: {
    backgroundColor: 'rgba(255, 176, 0, 0.12)',
    borderRadius: radii.full,
    color: colors.accent,
    fontSize: fontSizes.sm,
    margin: '14px auto 0',
    padding: '6px 12px',
    position: 'sticky',
    top: 0,
    width: 'fit-content',
    zIndex: 1,
  },
  workspace: {
    'display': 'flex',
    'flex': '1 1 auto',
    'minHeight': 0,
    '@media (max-width: 760px)': {
      flexDirection: 'column',
    },
  },
  explorerPanel: {
    'maxWidth': 'min(520px, 46vw)',
    '@media (max-width: 760px)': {
      flex: '0 0 auto',
      maxWidth: 'none !important',
      minWidth: '0 !important',
      width: '100% !important',
    },
  },
  explorerPanelContent: {
    '@media (max-width: 760px)': {
      width: '100%',
    },
  },
  explorerPanelHandle: {
    '@media (max-width: 760px)': {
      display: 'none',
    },
  },
  explorer: {
    'backgroundColor': colors.backgroundSurface,
    'height': '100%',
    'minHeight': 0,
    'minWidth': 0,
    'overflowY': 'auto',
    '@media (max-width: 760px)': {
      borderBottomColor: colors.border,
      borderBottomStyle: 'solid',
      borderBottomWidth: '1px',
      borderRightStyle: 'none',
      maxHeight: '300px',
    },
  },
  explorerHead: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    justifyContent: 'space-between',
    letterSpacing: '0.04em',
    minHeight: '34px',
    padding: '0 12px',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  documentList: {
    display: 'flex',
    flexDirection: 'column',
  },
  documentRow: {
    'alignItems': 'stretch',
    'backgroundColor': 'transparent',
    'border': 'none',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'flex',
    'flexDirection': 'column',
    'gap': '4px',
    'minWidth': 0,
    'padding': '9px 12px',
    'textAlign': 'left',
    'transition': 'background-color 120ms ease',
    'width': '100%',
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.025)',
    },
    ':focus-visible': {
      outline: `1px solid ${colors.borderStrong}`,
      outlineOffset: '-1px',
    },
  },
  documentRowActive: {
    'backgroundColor': 'rgba(255, 255, 255, 0.055)',
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.065)',
    },
  },
  documentRowHead: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '8px',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  documentRowTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 600,
    lineHeight: 1.3,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  documentRowTitleActive: {
    color: colors.textPrimary,
  },
  documentRowDate: {
    color: colors.textMuted,
    flex: '0 0 auto',
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
  },
  documentRowDateActive: {
    color: colors.textMuted,
  },
  documentRowMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  documentRowMetaActive: {
    color: colors.textSecondary,
  },
  documentRowExcerpt: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 1.45,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  state: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '8px',
    justifyContent: 'center',
    minHeight: '140px',
  },
  error: {
    margin: '12px',
  },
  empty: {
    paddingInline: '14px',
  },
  reader: {
    'backgroundColor': colors.backgroundCanvas,
    'flex': '1 1 auto',
    'minHeight': 0,
    'minWidth': 0,
    'overflowY': 'auto',
    '@media (max-width: 760px)': {
      overflow: 'visible',
    },
  },
  readerDocument: {
    'margin': '0 auto',
    'padding': '24px 28px 64px',
    'width': 'min(100%, 920px)',
    '@media (max-width: 760px)': {
      padding: '20px 16px 48px',
    },
  },
  readerDocumentCanvas: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    padding: '16px 16px 0',
    width: '100%',
  },
  readerHead: {
    'alignItems': 'flex-start',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'display': 'flex',
    'gap': '16px',
    'justifyContent': 'space-between',
    'marginBottom': '22px',
    'paddingBottom': '18px',
    '@media (max-width: 760px)': {
      flexDirection: 'column',
    },
  },
  readerHeading: {
    minWidth: 0,
  },
  readerHeadCompact: {
    alignItems: 'center',
    marginBottom: '10px',
    paddingBottom: '7px',
  },
  readerTitleRow: {
    display: 'contents',
  },
  readerTitleRowCompact: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    minWidth: 0,
  },
  readerHeadingBadgeCompact: {
    flex: '0 0 auto',
    marginBottom: 0,
  },
  readerHeadingTitleCompact: {
    fontSize: fontSizes.base,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  readerMetaCompact: {
    marginTop: '2px',
  },
  readerHeadingBadge: {
    marginBottom: '7px',
  },
  readerHeadingTitle: {
    color: colors.textPrimary,
    fontSize: '24px',
    fontWeight: 600,
    margin: 0,
    overflowWrap: 'anywhere',
    textWrap: 'balance',
  },
  readerMeta: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: fontSizes.sm,
    gap: '6px 10px',
    marginTop: '8px',
  },
  readerMetaCode: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.default,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    overflowWrap: 'anywhere',
    padding: '2px 5px',
  },
  cockpitLink: {
    'color': colors.textPrimary,
    'flex': '0 0 auto',
    'textDecoration': 'none',
    'whiteSpace': 'nowrap',
    ':hover': {
      color: colors.accent,
    },
  },
  readerBody: {
    minWidth: 0,
  },
  readerBodyCanvas: {
    flex: '1 1 auto',
    minHeight: 0,
  },
  context: {
    'backgroundColor': colors.backgroundSurface,
    'borderLeftColor': colors.border,
    'borderLeftStyle': 'solid',
    'borderLeftWidth': '1px',
    'display': 'flex',
    'flex': '0 0 clamp(320px, 24vw, 420px)',
    'flexDirection': 'column',
    'minHeight': 0,
    'minWidth': 0,
    'overflow': 'hidden',
    'width': 'clamp(320px, 24vw, 420px)',
    '@media (max-width: 1100px)': {
      flexBasis: '320px',
      width: '320px',
    },
    '@media (max-width: 760px)': {
      borderLeftStyle: 'none',
      borderTopColor: colors.border,
      borderTopStyle: 'solid',
      borderTopWidth: '1px',
      minHeight: '520px',
      width: '100%',
    },
  },
});

function defaultExplorerWidth(): number {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, viewportWidth * 0.215));
}

function ResearchExplorer({
  documents,
  selectedPath,
  showExcerpts,
  loading,
  error,
  onSelect,
}: {
  documents: ResearchDocumentMeta[];
  selectedPath: string | null;
  showExcerpts: boolean;
  loading: boolean;
  error: string | null;
  onSelect: (document: ResearchDocumentMeta) => void;
}) {
  const { t: tr } = useLocale();
  if (loading && documents.length === 0) {
    return (
      <div {...stylex.props(styles.state)}>
        <Spinner />
        {tr('researchLoading')}
      </div>
    );
  }
  if (error) return <ErrorBox className={stylex.props(styles.error).className}>{error}</ErrorBox>;
  if (documents.length === 0)
    return (
      <Empty className={stylex.props(styles.empty).className}>{tr('researchNoMatches')}</Empty>
    );

  return (
    <div {...stylex.props(styles.documentList)}>
      {documents.map((document) => {
        const active = document.path === selectedPath;
        return (
          <button
            type="button"
            key={document.path}
            {...stylex.props(styles.documentRow, active && styles.documentRowActive)}
            aria-pressed={active}
            onClick={() => onSelect(document)}
          >
            <span {...stylex.props(styles.documentRowHead)}>
              <span
                {...stylex.props(styles.documentRowTitle, active && styles.documentRowTitleActive)}
                title={document.title}
              >
                {researchListTitle(document)}
              </span>
              {document.date && (
                <span
                  {...stylex.props(styles.documentRowDate, active && styles.documentRowDateActive)}
                >
                  {document.date.slice(5)}
                </span>
              )}
            </span>
            <span {...stylex.props(styles.documentRowMeta, active && styles.documentRowMetaActive)}>
              {researchListSecondary(document, tr)}
            </span>
            {showExcerpts && document.excerpt && (
              <span {...stylex.props(styles.documentRowExcerpt)}>{document.excerpt}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ResearchReader({
  document,
  loading,
  downloading,
  error,
  continuingCanvas,
  onContinueCanvas,
}: {
  document: ResearchDocument | null;
  loading: boolean;
  downloading: boolean;
  error: string | null;
  continuingCanvas: boolean;
  onContinueCanvas: (document: ResearchDocument) => void;
}) {
  const { t: tr } = useLocale();
  if (loading && !document) {
    return (
      <div {...stylex.props(styles.state)}>
        <Spinner /> {downloading ? tr('researchIcloudLoading') : tr('researchBodyLoading')}
      </div>
    );
  }
  if (error) return <ErrorBox className={stylex.props(styles.error).className}>{error}</ErrorBox>;
  if (!document) return <Empty>{tr('researchSelect')}</Empty>;

  const cockpitSymbol = document.kind === 'stock' ? document.symbols[0] : null;
  const compactHead = document.kind === 'canvas';
  return (
    <article
      {...stylex.props(
        styles.readerDocument,
        document.kind === 'canvas' && styles.readerDocumentCanvas,
      )}
    >
      <header {...stylex.props(styles.readerHead, compactHead && styles.readerHeadCompact)}>
        <div {...stylex.props(styles.readerHeading)}>
          <div
            {...stylex.props(compactHead ? styles.readerTitleRowCompact : styles.readerTitleRow)}
          >
            <Badge
              className={
                stylex.props(
                  styles.readerHeadingBadge,
                  compactHead && styles.readerHeadingBadgeCompact,
                ).className
              }
              tone={document.kind === 'stock' ? 'accent' : undefined}
            >
              {researchTypeLabel(document.type, tr)}
            </Badge>
            <h2
              {...stylex.props(
                styles.readerHeadingTitle,
                compactHead && styles.readerHeadingTitleCompact,
              )}
            >
              {document.title}
            </h2>
          </div>
          <div {...stylex.props(styles.readerMeta, compactHead && styles.readerMetaCompact)}>
            <code {...stylex.props(styles.readerMetaCode)}>{document.path}</code>
            <span>
              {tr('researchUpdated')}
              <MarketTime value={document.mtime} format="month-day-time" />
            </span>
            {document.origin?.eventId && (
              <span>
                {tr('researchFromEvent')}
                {document.origin.eventId}
              </span>
            )}
          </div>
        </div>
        {cockpitSymbol && (
          <a
            className={`btn ${stylex.props(styles.cockpitLink).className}`}
            href={`/symbol/${encodeURIComponent(`${cockpitSymbol}.US`)}`}
          >
            <ChartCandlestick size={14} />
            {tr('researchCockpit')}
          </a>
        )}
        {document.kind === 'canvas' && (
          <Button
            accent
            size="sm"
            disabled={continuingCanvas}
            onClick={() => onContinueCanvas(document)}
          >
            <MessageSquareText size={13} />
            {continuingCanvas ? tr('researchOpening') : tr('researchContinueChat')}
          </Button>
        )}
      </header>
      <div
        className={`research-reader-body ${stylex.props(styles.readerBody, document.kind === 'canvas' && styles.readerBodyCanvas).className}`}
      >
        {document.kind === 'canvas' ? (
          <ResearchCanvasBody path={document.path} />
        ) : (
          <Markdown>{document.markdown}</Markdown>
        )}
      </div>
    </article>
  );
}

function ResearchCanvasBody({ path }: { path: string }) {
  const { t: tr } = useLocale();
  const slug = canvasSlugFromResearchPath(path);
  const { data, loading, error } = useQuery(slug ? `canvas.get:${slug}` : null, () =>
    slug ? client.canvas.get({ slug }) : Promise.reject(new Error('Invalid canvas path')),
  );
  if (loading && !data) {
    return (
      <div {...stylex.props(styles.state)}>
        <Spinner />
        {tr('researchOpeningCanvas')}
      </div>
    );
  }
  if (error) return <ErrorBox className={stylex.props(styles.error).className}>{error}</ErrorBox>;
  if (!data || !slug) return <Empty>{tr('researchCanvasMissing')}</Empty>;
  return <CanvasFrame source={data.source} slug={data.slug} data={data.data} />;
}

function ResearchContext({
  selected,
  document,
  allDocuments,
  onSelect,
  onDocumentChanged,
}: {
  selected: ResearchDocumentMeta | null;
  document: ResearchDocument | null;
  allDocuments: ResearchDocumentMeta[];
  onSelect: (document: ResearchDocumentMeta) => void;
  onDocumentChanged: (document?: ResearchDocument) => void;
}) {
  const { t: tr } = useLocale();
  if (!selected) return null;
  const related = relatedDocuments(selected, allDocuments).slice(0, 8);

  return (
    <aside {...stylex.props(styles.context)} aria-label={tr('researchRelated')}>
      {document ? (
        <ResearchAssistant
          key={document.path}
          document={document}
          selected={selected}
          related={related}
          onSelect={onSelect}
          onDocumentChanged={onDocumentChanged}
        />
      ) : (
        <div {...stylex.props(styles.state)}>
          <Spinner />
          {tr('researchBodyLoading')}
        </div>
      )}
    </aside>
  );
}

export function ResearchPage() {
  const { t: tr } = useLocale();
  useTitle(tr('researchLibrary'));
  const view = parseResearchView(useQueryParam('view'));
  const selectedPath = useQueryParam('path');
  const route = useRoute();
  const [query, setQuery] = useState('');
  const [createHint, setCreateHint] = useState<string | null>(null);
  const [continuingCanvasPath, setContinuingCanvasPath] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const kind = kindForView(view);

  useEffect(() => {
    if (!createHint) return;
    const timer = setTimeout(() => setCreateHint(null), CREATE_HINT_MS);
    return () => clearTimeout(timer);
  }, [createHint]);

  const {
    data: allDocuments,
    error: allError,
    loading: allLoading,
    reload: reloadAll,
  } = usePollingQuery<ResearchDocumentMeta[]>(
    'research.list:all',
    () => client.research.list({}),
    (rows) => (rows?.some((row) => row.pending) ? PENDING_LIST_POLL_MS : false),
    { cache: false },
  );
  const {
    data: searchDocuments,
    error: searchError,
    loading: searchLoading,
    reload: reloadSearch,
  } = useQuery<ResearchDocumentMeta[]>(
    deferredQuery ? `research.list:${kind}:${deferredQuery}` : null,
    () => client.research.list({ kind, query: deferredQuery }),
    { cache: false },
  );

  const baseDocuments = (allDocuments ?? []).filter((document) => document.kind === kind);
  const visibleDocuments = deferredQuery ? (searchDocuments ?? []) : baseDocuments;
  const selected =
    visibleDocuments.find((document) => document.path === selectedPath) ??
    visibleDocuments[0] ??
    null;
  const selectedDocumentPath = selected?.path ?? null;
  const {
    data: document,
    error: documentError,
    loading: documentLoading,
    reload: reloadDocument,
  } = useQuery<ResearchDocument>(
    selectedDocumentPath ? `research.get:${selectedDocumentPath}` : null,
    () =>
      selectedDocumentPath
        ? client.research.get({ path: selectedDocumentPath })
        : Promise.reject(new Error('No research document selected')),
    { cache: false },
  );

  useEffect(() => {
    if (!selected || selected.path === selectedPath) return;
    // The route is global: while this tab navigates away (deep link, in-page
    // link, background-tab refresh) the route flips off /research before this
    // page unmounts, and syncing the selection then would bounce the tab
    // straight back to the research route. Only sync on the research route.
    if (routePathname(route) !== '/research') return;
    navigate(researchRoute(view, selected.path), { replace: true });
  }, [route, selectedDocumentPath, selectedPath, view]);

  const selectDocument = (next: ResearchDocumentMeta) => {
    setQuery('');
    navigate(researchRoute(viewForKind(next.kind), next.path));
  };
  const changeView = (next: ResearchView) => {
    setQuery('');
    navigate(researchRoute(next));
  };
  const refresh = () => {
    reloadAll();
    reloadSearch();
    reloadDocument();
  };
  const handleResearchCreated = (result: ResearchCreateResult) => {
    queryClient.setQueryData<ResearchDocumentMeta[]>(['research.list:all'], (current) => {
      if (!current || current.some((item) => item.path === result.document.path)) return current;
      return [result.document, ...current];
    });
    queryClient.setQueryData<ResearchDocument>(
      [`research.get:${result.document.path}`],
      result.document,
    );
    reloadAll();
    if (result.existed) setCreateHint(tr('researchAlreadyExists'));
  };
  const openCreateDialog = () => openCreateResearchDialog(kind, handleResearchCreated);
  const continueCanvasInChat = async (canvas: ResearchDocument) => {
    if (continuingCanvasPath) return;
    setContinuingCanvasPath(canvas.path);
    try {
      const { session } = await client.assistant.createSession({
        title: tr('researchCanvasTitle', { value1: canvas.title }),
      });
      queryClient.setQueryData<AssistantSessionMeta[]>(['assistant.sessions'], (current) => [
        session,
        ...(current ?? []).filter((item) => item.id !== session.id),
      ]);
      navigate(
        `/chat?${new URLSearchParams({ session: session.id, canvas: canvas.path }).toString()}`,
        { newTab: true },
      );
    } catch (error) {
      setCreateHint(errorMessage(error));
      setContinuingCanvasPath(null);
    }
  };

  const stockCount = (allDocuments ?? []).filter((item) => item.kind === 'stock').length;
  const journalCount = (allDocuments ?? []).filter((item) => item.kind === 'journal').length;
  const canvasCount = (allDocuments ?? []).filter((item) => item.kind === 'canvas').length;
  const listLoading = deferredQuery ? searchLoading : allLoading;
  const listError = deferredQuery ? searchError : allError;
  const desktopShell = isDesktopRealtime();

  return (
    <div
      className={`fullpage research-page ${stylex.props(styles.fullpage, styles.page, desktopShell && styles.fullpageDesktop).className}`}
    >
      <header {...stylex.props(styles.header, desktopShell && styles.headerDesktop)}>
        <a href="/" {...stylex.props(styles.home)} aria-label={tr('uiHome')}>
          <ChevronLeft size={13} {...stylex.props(styles.homeChevron)} />
          <span {...stylex.props(styles.titleIcon)}>
            <Library size={13} />
          </span>
          <h1 {...stylex.props(styles.titleHeadingTitle)}>{tr('researchLibrary')}</h1>
        </a>
        <SegmentedControl
          ariaLabel={tr('researchViews')}
          className={`research-view-switch ${stylex.props(styles.viewSwitch).className}`}
          onChange={changeView}
          options={viewOptions(
            {
              stocks: stockCount,
              journal: journalCount,
              canvases: canvasCount,
            },
            tr,
          )}
          size="lg"
          value={view}
          variant="plain"
        />
        <div {...stylex.props(styles.controls)}>
          <div {...stylex.props(styles.searchActions)}>
            <label {...stylex.props(styles.search)}>
              <Search size={14} aria-hidden="true" {...stylex.props(styles.searchIcon)} />
              <span className={`sr-only ${stylex.props(styles.visuallyHidden).className}`}>
                {tr('researchSearch')}
              </span>
              <Input
                type="search"
                value={query}
                className={stylex.props(styles.searchInput).className}
                placeholder={searchPlaceholder(view, tr)}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              {...stylex.props(styles.refresh)}
              aria-label={tr('researchRefresh')}
              onClick={refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      <div {...stylex.props(styles.workspace)}>
        <ResizablePanel
          className={`research-explorer-panel ${stylex.props(styles.explorerPanel).className}`}
          contentClassName={stylex.props(styles.explorerPanelContent).className}
          handleClassName={stylex.props(styles.explorerPanelHandle).className}
          side="start"
          defaultSize={defaultExplorerWidth()}
          minSize={EXPLORER_MIN_WIDTH}
          maxSize={EXPLORER_MAX_WIDTH}
          storageKey={EXPLORER_WIDTH_STORAGE_KEY}
          handleLabel={tr('researchResize')}
        >
          <aside {...stylex.props(styles.explorer)}>
            <div {...stylex.props(styles.explorerHead)}>
              <span>{explorerLabel(view, tr)}</span>
              {view === 'canvases' ? (
                <CanvasQuotaHint count={canvasCount} />
              ) : (
                <button
                  type="button"
                  {...stylex.props(styles.newButton)}
                  onClick={openCreateDialog}
                >
                  <Plus size={12} />
                  {tr('researchNewShort')}
                </button>
              )}
            </div>
            <ResearchExplorer
              documents={visibleDocuments}
              selectedPath={selected?.path ?? null}
              showExcerpts={Boolean(deferredQuery)}
              loading={listLoading}
              error={listError}
              onSelect={selectDocument}
            />
          </aside>
        </ResizablePanel>
        <main {...stylex.props(styles.reader)}>
          {createHint && (
            <div {...stylex.props(styles.createHint)} role="status">
              {createHint}
            </div>
          )}
          <ResearchReader
            document={document}
            loading={documentLoading}
            downloading={Boolean(selected?.pending)}
            error={documentError}
            continuingCanvas={continuingCanvasPath === document?.path}
            onContinueCanvas={(canvas) => void continueCanvasInChat(canvas)}
          />
        </main>
        {selected?.kind === 'canvas' ? null : (
          <ResearchContext
            selected={selected}
            document={document?.path === selected?.path ? document : null}
            allDocuments={allDocuments ?? []}
            onSelect={selectDocument}
            onDocumentChanged={refresh}
          />
        )}
      </div>
    </div>
  );
}
