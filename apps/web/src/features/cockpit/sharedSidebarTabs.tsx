import type { ReactNode } from 'react';
import { translate, type Locale } from '@web/lib/i18n';
import * as stylex from '@stylexjs/stylex';
import type { CockpitComment, IntradaySidebar, SymbolAnalysisRow } from '@kansoku/shared/types';
import type { SidebarTab } from '@web/features/charts/SidebarTabs';
import { NewsTab } from '@web/features/charts/intraday/tabs/NewsTab';
import { SymbolEventsTab } from '@web/features/events/SymbolEventsTab';
import { Badge } from '@web/ui';
import { AnalysisTab, type AnalysisSection } from './AnalysisTab';
import { AiTab } from './AiTab';
import type { CockpitEnvState } from './useCockpitEnv';
import { EnvTab } from './EnvTab';
import { FlowTab } from './FlowTab';
import { ReviewTab, type ReviewSection } from './ReviewTab';

const styles = stylex.create({
  unreadBadge: {
    marginLeft: '4px',
  },
});

export function buildSharedSidebarTabs(params: {
  locale?: Locale;
  sym: string;
  sidebar: IntradaySidebar;
  env: CockpitEnvState;
  analysesRows: SymbolAnalysisRow[];
  latestId: string | null;
  journalEntries: { name: string; date: string }[];
  reloadJournal: () => void;
  reviewSection: ReviewSection;
  setReviewSection: (section: ReviewSection) => void;
  selectedJournal: string | null;
  setSelectedJournal: (name: string | null) => void;
  comments: CockpitComment[];
  commentsError: string | null;
  commentsLoaded: boolean;
  unread: number;
  prediction: ReactNode;
  analysisSection: AnalysisSection;
  setAnalysisSection: (section: AnalysisSection) => void;
  anchorTf?: string;
}): SidebarTab[] {
  const {
    sym,
    sidebar,
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
    prediction,
    analysisSection,
    setAnalysisSection,
    anchorTf,
  } = params;
  const i18n = (key: Parameters<typeof translate>[1]) => translate(params.locale ?? 'zh-CN', key);
  const hasNews =
    Boolean(sidebar.context?.news?.length) || Boolean(sidebar.news?.length) || Boolean(sym);

  return [
    {
      key: 'analysis',
      label: (
        <>
          {i18n('cockpitTabAnalysis')}
          {unread > 0 && (
            <Badge tone="down" className={stylex.props(styles.unreadBadge).className}>
              {unread}
            </Badge>
          )}
        </>
      ),
      content: (
        <AnalysisTab
          sym={sym}
          section={analysisSection}
          onSectionChange={setAnalysisSection}
          unread={unread}
          anchorTf={anchorTf}
          prediction={prediction}
          commentary={
            <AiTab
              showRunControl={false}
              symbol={sym}
              comments={comments}
              error={commentsError}
              loaded={commentsLoaded}
              analysisRevision={analysesRows[0]?.id ?? latestId ?? undefined}
            />
          }
          review={
            <ReviewTab
              showRunControl={false}
              symbol={sym}
              rows={analysesRows}
              currentId={latestId}
              journal={journalEntries}
              section={reviewSection}
              onSectionChange={setReviewSection}
              selectedJournal={selectedJournal}
              onSelectJournal={setSelectedJournal}
              reloadJournal={reloadJournal}
            />
          }
        />
      ),
    },
    {
      key: 'env',
      label: i18n('cockpitTabEnv'),
      content: (
        <>
          <EnvTab
            position={env.position}
            positionError={env.positionError}
            benchmark={env.benchmark}
            benchmarkError={env.benchmarkError}
            relvol={env.relvol}
          />
          <FlowTab symbol={sym} />
        </>
      ),
    },
    {
      key: 'news',
      label: i18n('cockpitTabNews'),
      hidden: !hasNews,
      content: <NewsTab context={sidebar.context} news={sidebar.news ?? []} sym={sym} />,
    },
    {
      key: 'events',
      label: i18n('cockpitTabEvents'),
      content: <SymbolEventsTab symbol={sym} />,
    },
  ];
}
