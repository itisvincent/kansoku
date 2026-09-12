import { useLocale } from '@web/lib/i18n';
import {
  AlignJustify,
  Eraser,
  Minus,
  MousePointer2,
  Ruler,
  Spline,
  Square,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useRef, useState } from 'react';
import { colors, radii } from '../../../theme/tokens.stylex';
import { StylePanel } from './StylePanel';
import type { DrawingsApi } from './useDrawings';
import type { DrawingTool } from './drawingsMachine';

const CLEAR_ARM_MS = 3000;

const styles = stylex.create({
  toolbar: {
    position: 'absolute',
    top: '40px',
    left: '8px',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '4px',
    backgroundColor: 'rgb(10 10 10 / 0.7)',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
  },
  button: {
    'width': '26px',
    'height': '26px',
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    ':hover:not(:disabled)': {
      color: colors.textPrimary,
      backgroundColor: colors.backgroundHover,
    },
    ':disabled': {
      color: colors.textMuted,
      opacity: 0.4,
      cursor: 'default',
    },
  },
  buttonPressed: {
    color: colors.accent,
    backgroundColor: colors.backgroundHover,
  },
  clearArmed: {
    color: colors.down,
  },
  separator: {
    height: '1px',
    margin: '2px',
    backgroundColor: colors.border,
  },
});

function toolbarButtonClassName(armed: boolean) {
  const className = stylex.props(styles.button, armed && styles.clearArmed).className;
  return armed ? `${className} drawing-toolbar-clear-armed` : className;
}

function useArmedConfirm(ms: number): [boolean, (onConfirm: () => void) => void] {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const trigger = useCallback(
    (onConfirm: () => void) => {
      if (!armed) {
        setArmed(true);
        timerRef.current = setTimeout(() => setArmed(false), ms);
        return;
      }
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setArmed(false);
      onConfirm();
    },
    [armed, ms],
  );

  return [armed, trigger];
}

export function DrawingToolbar({ api }: { api: DrawingsApi }) {
  const { t: tr } = useLocale();
  const TOOLS: { tool: DrawingTool; icon: typeof MousePointer2; label: string }[] = [
    { tool: 'cursor', icon: MousePointer2, label: tr('drawSelect') },
    { tool: 'measure', icon: Ruler, label: tr('drawMeasure') },
    { tool: 'trendline', icon: TrendingUp, label: tr('drawTrend') },
    { tool: 'polyline', icon: Spline, label: tr('drawPolyline') },
    { tool: 'hline', icon: Minus, label: tr('drawHorizontal') },
    { tool: 'rect', icon: Square, label: tr('drawRectangle') },
    { tool: 'fib', icon: AlignJustify, label: tr('drawFib') },
  ];

  const { t: i18n } = useLocale();
  const [armedAll, triggerAll] = useArmedConfirm(CLEAR_ARM_MS);
  const [armedAi, triggerAi] = useArmedConfirm(CLEAR_ARM_MS);

  return (
    <>
      <div
        className={`drawing-toolbar ${stylex.props(styles.toolbar).className}`}
        aria-label={i18n('chartDrawingTools')}
      >
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            {...stylex.props(styles.button, api.activeTool === tool && styles.buttonPressed)}
            aria-pressed={api.activeTool === tool}
            onClick={() => api.setActiveTool(tool)}
            title={label}
          >
            <Icon size={16} />
          </button>
        ))}
        <div className={`drawing-toolbar-sep ${stylex.props(styles.separator).className}`} />
        <button
          className={toolbarButtonClassName(armedAll)}
          disabled={api.count === 0}
          onClick={() => triggerAll(api.clearAll)}
          title={armedAll ? i18n('chartClearConfirm') : i18n('chartClear')}
        >
          <Trash2 size={16} />
        </button>
        {api.hasAi && (
          <button
            className={toolbarButtonClassName(armedAi)}
            onClick={() => triggerAi(api.clearAi)}
            title={armedAi ? i18n('chartClearAiConfirm') : i18n('chartClearAi')}
          >
            <Eraser size={16} />
          </button>
        )}
      </div>
      {api.selected ? (
        <StylePanel
          style={api.selected.style}
          showArrow={api.selected.kind === 'trendline' || api.selected.kind === 'polyline'}
          onPatch={(patch) => api.updateStyle(api.selected!.id, patch)}
        />
      ) : (
        api.activeTool !== 'cursor' &&
        api.activeTool !== 'measure' && (
          <StylePanel
            style={api.draftStyle}
            showArrow={api.activeTool === 'trendline' || api.activeTool === 'polyline'}
            onPatch={api.updateDraftStyle}
          />
        )
      )}
    </>
  );
}
