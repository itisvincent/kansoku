import { useLocale, type MessageKey } from '@web/lib/i18n';
import { Fragment, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Popover } from '@base-ui/react/popover';
import { Check, Columns2, LayoutGrid, Rows2, Square, type LucideIcon } from 'lucide-react';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { GRID_LAYOUTS, type GridLayout } from './chartGridState';

const styles = stylex.create({
  trigger: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '26px',
    'justifyContent': 'center',
    'width': '30px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
  },
  triggerOn: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  positioner: {
    zIndex: 200,
  },
  popup: {
    backgroundColor: `color-mix(in srgb, ${colors.backgroundSurface} 96%, transparent)`,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.35)',
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    padding: '6px 0',
    width: '272px',
  },
  title: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    padding: '0 10px 6px',
  },
  option: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'flex',
    'fontSize': fontSizes.sm,
    'gap': '8px',
    'padding': '5px 10px',
    'textAlign': 'left',
    'width': '100%',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  optionOn: {
    color: colors.accent,
  },
  divider: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    marginTop: '4px',
    paddingTop: '4px',
  },
  checkSlot: {
    display: 'inline-flex',
    flexShrink: 0,
    justifyContent: 'center',
    width: '14px',
  },
  optionHelp: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    padding: '0 10px 4px 32px',
  },
  shortcuts: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'grid',
    fontSize: fontSizes.xs,
    gap: '4px 8px',
    gridTemplateColumns: 'auto 1fr',
    marginTop: '6px',
    padding: '6px 10px 0',
  },
  shortcutsTitle: {
    color: colors.textSecondary,
    gridColumn: '1 / -1',
  },
  keys: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    whiteSpace: 'nowrap',
  },
  keysHelp: {
    color: colors.textMuted,
  },
  foot: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    marginTop: '4px',
    padding: '6px 10px 0',
  },
});

const OPTIONS: Record<GridLayout, { icon: LucideIcon; label: MessageKey }> = {
  '1': { icon: Square, label: 'chartLayoutSingle' },
  '2h': { icon: Columns2, label: 'chartLayoutSideBySide' },
  '2v': { icon: Rows2, label: 'chartLayoutStacked' },
  '4': { icon: LayoutGrid, label: 'chartLayoutFour' },
};

const SHORTCUTS: { keys: string; help: MessageKey }[] = [
  { keys: 'Alt+1…4', help: 'chartShortcutLayouts' },
  { keys: '[  ]', help: 'chartShortcutTf' },
  { keys: 'Alt+Enter', help: 'chartShortcutEnlarge' },
  { keys: 'A–Z', help: 'chartShortcutSearch' },
];

export function ChartLayoutMenu({
  layout,
  onChange,
  linkScroll,
  onLinkScrollChange,
}: {
  layout: GridLayout;
  onChange: (layout: GridLayout) => void;
  linkScroll: boolean;
  onLinkScrollChange: (on: boolean) => void;
}) {
  const { t: i18n } = useLocale();
  const [open, setOpen] = useState(false);
  const Current = OPTIONS[layout].icon;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={`chart-layout-trigger ${stylex.props(styles.trigger, layout !== '1' && styles.triggerOn).className}`}
        aria-label={i18n('chartLayout')}
        title={i18n('chartLayout')}
      >
        <Current size={14} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className={stylex.props(styles.positioner).className}
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <Popover.Popup
            className={`chart-layout-popup ${stylex.props(styles.popup).className}`}
            aria-label={i18n('chartLayout')}
          >
            <div className={stylex.props(styles.title).className}>{i18n('chartLayout')}</div>
            {GRID_LAYOUTS.map((key) => {
              const { icon: Icon, label } = OPTIONS[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={`chart-layout-option ${stylex.props(styles.option, key === layout && styles.optionOn).className}`}
                  aria-pressed={key === layout}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  <Icon size={14} />
                  {i18n(label)}
                </button>
              );
            })}
            <div className={stylex.props(styles.divider).className}>
              <button
                type="button"
                className={`chart-layout-link-scroll ${stylex.props(styles.option).className}`}
                aria-pressed={linkScroll}
                onClick={() => onLinkScrollChange(!linkScroll)}
              >
                <span className={stylex.props(styles.checkSlot).className} aria-hidden="true">
                  {linkScroll && <Check size={13} />}
                </span>
                {i18n('chartLinkScroll')}
              </button>
              <div className={stylex.props(styles.optionHelp).className}>
                {i18n('chartLinkScrollHelp')}
              </div>
            </div>
            <div className={stylex.props(styles.foot).className}>{i18n('chartLayoutHelp')}</div>
            <div className={stylex.props(styles.shortcuts).className}>
              <span className={stylex.props(styles.shortcutsTitle).className}>
                {i18n('chartShortcuts')}
              </span>
              {SHORTCUTS.map(({ keys, help }) => (
                <Fragment key={keys}>
                  <kbd className={stylex.props(styles.keys).className}>{keys}</kbd>
                  <span className={stylex.props(styles.keysHelp).className}>{i18n(help)}</span>
                </Fragment>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
