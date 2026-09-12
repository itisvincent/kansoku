import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type { ChartMeta } from '@kansoku/shared/types';
import { symbolAnalysisPath } from '@kansoku/shared/chartUrl';
import { CockpitSkeleton } from '@web/features/cockpit/CockpitSkeleton';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Empty, ErrorBox } from '@web/ui';
import { useIntradayDoc } from '../intraday/useIntradayDoc';
import { colors } from '../../../theme/tokens.stylex';
import { useLocale } from '@web/lib/i18n';
import { SepaCockpit, type SepaDocView } from './SepaCockpit';

const styles = stylex.create({
  page: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '24px 20px 60px',
  },
  icon: {
    verticalAlign: '-2px',
  },
  backLink: {
    'color': colors.textPrimary,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
});

function Page({ children }: { children: ReactNode }) {
  const pageProps = stylex.props(styles.page);
  return (
    <div {...pageProps} className={`page ${pageProps.className}`}>
      {children}
    </div>
  );
}

function PinnedSepaView({ sym, analysisId }: { sym: string; analysisId: string }) {
  const { t } = useLocale();
  const { doc, error, reload } = useIntradayDoc(analysisId);

  if (error) {
    return (
      <Page>
        <ErrorBox>{error}</ErrorBox>
      </Page>
    );
  }
  if (!doc) return <CockpitSkeleton />;
  if (doc.built.kind !== 'sepa') {
    return (
      <Page>
        <ErrorBox>
          <p>{t('notSepaDashboard')}</p>
          <a
            className={`back-link ${stylex.props(styles.backLink).className}`}
            href={symbolAnalysisPath(sym, analysisId)}
          >
            {t('viewCockpit')}
          </a>
        </ErrorBox>
      </Page>
    );
  }
  const sepaDoc: SepaDocView = { ...doc, built: doc.built };
  return <SepaCockpit sym={sym} doc={sepaDoc} reload={reload} />;
}

function LatestSepaView({ sym }: { sym: string }) {
  const { t } = useLocale();
  const { data: charts, error: listError } = useQuery<ChartMeta[]>(
    `charts.list:sepa:${sym}`,
    () => client.charts.list({ type: 'sepa', symbol: sym }),
    { persist: false },
  );
  const latestId = charts?.[0]?.id ?? null;
  const { doc, error: docError, reload } = useIntradayDoc(latestId);

  if (listError) {
    return (
      <Page>
        <ErrorBox>{listError}</ErrorBox>
      </Page>
    );
  }
  if (!charts) return <CockpitSkeleton />;
  if (charts.length === 0) {
    return (
      <Page>
        <Empty>
          <p>{t('noSepaDashboard')}</p>
          <a
            className={`back-link ${stylex.props(styles.backLink).className}`}
            href={symbolAnalysisPath(sym, null)}
          >
            <ArrowLeft className={stylex.props(styles.icon).className} size={13} /> {t('backToCockpit')}
          </a>
        </Empty>
      </Page>
    );
  }
  if (docError) {
    return (
      <Page>
        <ErrorBox>{docError}</ErrorBox>
      </Page>
    );
  }
  if (!doc || doc.built.kind !== 'sepa') return <CockpitSkeleton />;
  const sepaDoc: SepaDocView = { ...doc, built: doc.built };
  return <SepaCockpit sym={sym} doc={sepaDoc} reload={reload} />;
}

export function SepaSymbolPage({ sym, analysisId }: { sym: string; analysisId: string | null }) {
  if (analysisId) return <PinnedSepaView sym={sym} analysisId={analysisId} />;
  return <LatestSepaView sym={sym} />;
}
