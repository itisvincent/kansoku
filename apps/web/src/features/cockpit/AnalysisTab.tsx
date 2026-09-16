import { useId, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useIntradayControls } from '../charts/intraday/controlsContext';
import { tfLabel } from '../charts/intraday/timeframes';
import { useLocale, type MessageKey } from '../../lib/i18n';
import { Badge } from '@web/ui';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { GenerateAnalysis } from './GenerateAnalysis';

export type AnalysisSection = 'prediction' | 'commentary' | 'review';

const sections: { key: AnalysisSection; label: MessageKey }[] = [
  { key: 'prediction', label: 'cockpitPrediction' },
  { key: 'commentary', label: 'cockpitCommentary' },
  { key: 'review', label: 'cockpitTabReview' },
];

const styles = stylex.create({
  root: { minWidth: 0 },
  header: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.lg,
    padding: '10px',
    marginBottom: '12px',
  },
  help: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.5,
    margin: '0 0 8px',
    overflowWrap: 'anywhere',
  },
  periods: { color: colors.textPrimary },
  tabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginBottom: '12px',
  },
  tab: {
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.control,
    'padding': '6px 8px',
    'display': 'inline-flex',
    'alignItems': 'center',
    'gap': '4px',
    ':hover': { color: colors.textPrimary },
    ':focus-visible': { outline: `2px solid ${colors.accent}`, outlineOffset: '2px' },
  },
  selected: {
    color: colors.textPrimary,
    backgroundColor: colors.backgroundHover,
    borderColor: colors.accent,
  },
});

export function AnalysisTab({
  sym,
  section,
  onSectionChange,
  prediction,
  commentary,
  review,
  unread,
  anchorTf,
}: {
  sym: string;
  section: AnalysisSection;
  onSectionChange: (section: AnalysisSection) => void;
  prediction: ReactNode;
  commentary: ReactNode;
  review: ReactNode;
  unread: number;
  anchorTf?: string;
}) {
  const { t, locale } = useLocale();
  const { analysisTfs } = useIntradayControls();
  const id = useId();
  const content = { prediction, commentary, review };

  return (
    <div className={`analysis-workspace ${stylex.props(styles.root).className}`}>
      <div {...stylex.props(styles.header)}>
        <p {...stylex.props(styles.help, styles.periods)}>
          {t('cockpitAnalysisPeriods', {
            periods: analysisTfs.map((tf) => tfLabel(tf, locale)).join(' · '),
          })}
        </p>
        <p {...stylex.props(styles.help)}>{t('cockpitAnalysisHelp')}</p>
        <GenerateAnalysis sym={sym} label="cockpitRunAnalysis" anchorTf={anchorTf} />
      </div>
      <div role="tablist" aria-label={t('cockpitAnalysisSections')} {...stylex.props(styles.tabs)}>
        {sections.map((item, index) => (
          <button
            key={item.key}
            type="button"
            id={`${id}-${item.key}-tab`}
            role="tab"
            aria-selected={section === item.key}
            aria-controls={`${id}-${item.key}-panel`}
            tabIndex={section === item.key ? 0 : -1}
            {...stylex.props(styles.tab, section === item.key && styles.selected)}
            onClick={() => onSectionChange(item.key)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % sections.length
                  : event.key === 'ArrowLeft'
                    ? (index + sections.length - 1) % sections.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? sections.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              onSectionChange(sections[next].key);
              document.getElementById(`${id}-${sections[next].key}-tab`)?.focus();
            }}
          >
            {t(item.label)}
            {item.key === 'commentary' && unread > 0 && <Badge tone="down">{unread}</Badge>}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-${section}-panel`}
        aria-labelledby={`${id}-${section}-tab`}
        tabIndex={0}
      >
        {content[section]}
      </div>
    </div>
  );
}
