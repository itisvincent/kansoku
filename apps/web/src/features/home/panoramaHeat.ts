import * as stylex from '@stylexjs/stylex';
import { colors } from '../../theme/tokens.stylex';

/** Tile colours for a day change, shared by the panorama views. */
const styles = stylex.create({
  heat0: {
    'backgroundColor': colors.backgroundElement,
    'color': colors.textSecondary,
    ':hover': {
      color: colors.textSecondary,
    },
  },
  heatG1: {
    'backgroundColor': '#14532d',
    'color': '#a7e3c0',
    ':hover': {
      color: '#a7e3c0',
    },
  },
  heatG2: {
    'backgroundColor': '#15803d',
    'color': '#d9f5e4',
    ':hover': {
      color: '#d9f5e4',
    },
  },
  heatG3: {
    'backgroundColor': '#16a34a',
    'color': '#eafff2',
    ':hover': {
      color: '#eafff2',
    },
  },
  heatR1: {
    'backgroundColor': '#58151c',
    'color': '#f0b1b1',
    ':hover': {
      color: '#f0b1b1',
    },
  },
  heatR2: {
    'backgroundColor': '#b91c1c',
    'color': '#ffdada',
    ':hover': {
      color: '#ffdada',
    },
  },
  heatR3: {
    'backgroundColor': '#dc2626',
    'color': '#ffecec',
    ':hover': {
      color: '#ffecec',
    },
  },
});

export function heatStyle(pct: number | null): stylex.StyleXStyles {
  if (pct == null || (pct > -0.2 && pct <= 0.2)) return styles.heat0;
  if (pct >= 4) return styles.heatG3;
  if (pct >= 1.5) return styles.heatG2;
  if (pct > 0.2) return styles.heatG1;
  if (pct <= -4) return styles.heatR3;
  if (pct <= -1.5) return styles.heatR2;
  return styles.heatR1;
}
