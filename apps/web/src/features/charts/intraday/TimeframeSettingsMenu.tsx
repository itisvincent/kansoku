import { useLocale } from '@web/lib/i18n';
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Popover } from '@base-ui/react/popover';
import { Settings2 } from 'lucide-react';
import { Checkbox } from '@web/ui';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { useIntradayControls } from './controlsContext';
import { MAX_ANALYSIS_TFS, TF_OPTIONS, tfLabel } from './timeframes';

const styles = stylex.create({
  trigger: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'border': 0,
    'borderRadius': radii.default,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '20px',
    'justifyContent': 'center',
    'minWidth': '22px',
    'padding': '0 5px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
  },
  positioner: {
    zIndex: 200,
  },
  popup: {
    backgroundColor: 'rgb(10 10 10 / 0.96)',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.6)',
    color: colors.textPrimary,
    fontSize: fontSizes.xs,
    padding: '7px 0',
    width: '196px',
  },
  title: {
    color: colors.textSecondary,
    padding: '0 10px 6px',
  },
  row: {
    'alignItems': 'center',
    'cursor': 'pointer',
    'display': 'flex',
    'gap': '7px',
    'padding': '3px 10px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  rowFixed: {
    color: colors.textSecondary,
    cursor: 'default',
  },
  tag: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: fontSizes.xs,
    marginLeft: 'auto',
    padding: '0 5px',
  },
  tagOn: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  tagDisabled: {
    cursor: 'default',
    opacity: 0.45,
  },
  foot: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    color: colors.textMuted,
    lineHeight: 1.5,
    marginTop: '4px',
    padding: '6px 10px 0',
  },
});

export function TimeframeSettingsMenu() {
  const { t: i18n, locale } = useLocale();
  const { visibleTfs, toggleTf, analysisTfs, toggleAnalysisTf } = useIntradayControls();
  const [open, setOpen] = useState(false);
  const shown = new Set(visibleTfs);
  const analysis = new Set(analysisTfs);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={`tf-settings-trigger ${stylex.props(styles.trigger).className}`}
        aria-label={i18n('chartTfSettings')}
        title={i18n('chartTfSettings')}
      >
        <Settings2 size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className={`tf-settings-positioner ${stylex.props(styles.positioner).className}`}
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <Popover.Popup
            className={`tf-settings-popup ${stylex.props(styles.popup).className}`}
            aria-label={i18n('chartTfSettings')}
          >
            <div className={`tf-settings-title ${stylex.props(styles.title).className}`}>
              {i18n('chartTfVisible')}
            </div>
            {TF_OPTIONS.map((option) => {
              const isAnalysis = analysis.has(option.key);
              const analysisLocked =
                (isAnalysis && analysis.size === 1) ||
                (!isAnalysis && analysis.size >= MAX_ANALYSIS_TFS);
              return (
                <div
                  key={option.key}
                  className={`tf-settings-row ${stylex.props(styles.row).className}`}
                >
                  <Checkbox
                    size="sm"
                    checked={shown.has(option.key)}
                    disabled={shown.has(option.key) && shown.size === 1}
                    onCheckedChange={() => toggleTf(option.key)}
                  />
                  {tfLabel(option.key, locale)}
                  <button
                    type="button"
                    className={`tf-settings-tag ${stylex.props(styles.tag, isAnalysis && styles.tagOn, analysisLocked && styles.tagDisabled).className}`}
                    aria-pressed={isAnalysis}
                    disabled={analysisLocked}
                    title={i18n('chartTfAnalysisHint')}
                    onClick={() => toggleAnalysisTf(option.key)}
                  >
                    {i18n('chartTfAnalysis')}
                  </button>
                </div>
              );
            })}
            <div className={`tf-settings-foot ${stylex.props(styles.foot).className}`}>
              {i18n('chartTfHelp')}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
