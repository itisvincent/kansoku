import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { DivergencePair, IntradayTfData, Pattern123 } from '@kansoku/shared/types';
import { useLocale } from '@web/lib/i18n';
import { SectionTitle } from '@web/ui';
import { colors, fontSizes } from '../../../../theme/tokens.stylex';
import { tfLabel, type ChartTf } from '../timeframes';
import { AutoSignalItem, Pattern123Item } from './predictionTabParts';

/** How many signals show before "Show all". */
export const AUTO_SIGNALS_VISIBLE = 5;

export type AutoSignal =
  | { type: 'p123'; time: number; pattern: Pattern123 }
  | { type: 'pair'; time: number; kindKey: string; pair: DivergencePair };

/**
 * The detected signals for one timeframe, newest first. The MACD-beichi detector runs
 * the same divergence search on MACD swings, so it usually returns the very pairs the
 * divergence detector found; a beichi pair with the same direction and the same two
 * points as a divergence is shown once.
 */
export function orderAutoSignals(tf: IntradayTfData | null | undefined): AutoSignal[] {
  if (!tf) return [];
  const out: AutoSignal[] = [];
  const seenPairs = new Set<string>();
  const addPairs = (pairs: DivergencePair[] | undefined, family: string) => {
    for (const pair of pairs ?? []) {
      const id = `${pair.kind}:${pair.a.time}:${pair.b.time}`;
      if (seenPairs.has(id)) continue;
      seenPairs.add(id);
      out.push({ type: 'pair', time: pair.b.time, kindKey: `${family}-${pair.kind}`, pair });
    }
  };
  addPairs(tf.autoDivergence, 'divergence');
  addPairs(tf.autoBeichi, 'macdBeichi');
  for (const pattern of tf.pattern123 ?? []) {
    out.push({ type: 'p123', time: pattern.confirm?.time ?? pattern.p3.time, pattern });
  }
  return out.sort((a, b) => b.time - a.time);
}

const styles = stylex.create({
  toggle: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: colors.accent,
    cursor: 'pointer',
    fontSize: fontSizes.control,
    marginTop: '4px',
    padding: '2px 0',
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.4,
    marginTop: '6px',
  },
});

export function AutoSignalsSection({
  tf,
  activeTf,
}: {
  tf: IntradayTfData | null | undefined;
  activeTf: ChartTf;
}) {
  const { t, locale } = useLocale();
  const [showAll, setShowAll] = useState(false);
  const signals = orderAutoSignals(tf);
  if (!signals.length) return null;
  const visible = showAll ? signals : signals.slice(0, AUTO_SIGNALS_VISIBLE);
  const hidden = signals.length - AUTO_SIGNALS_VISIBLE;
  return (
    <>
      <SectionTitle>
        {t('chartAutoSignals')}
        {tfLabel(activeTf, locale)}
      </SectionTitle>
      {visible.map((signal) =>
        signal.type === 'p123' ? (
          <Pattern123Item key={`p123-${signal.time}-${signal.pattern.p1.time}`} pat={signal.pattern} />
        ) : (
          <AutoSignalItem
            key={`${signal.kindKey}-${signal.pair.a.time}-${signal.pair.b.time}`}
            kindKey={signal.kindKey}
            pair={signal.pair}
          />
        ),
      )}
      {hidden > 0 && (
        <button
          type="button"
          className={`auto-signals-toggle ${stylex.props(styles.toggle).className}`}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? t('chartAutoSignalsShowFewer')
            : t('chartAutoSignalsShowAll', { value1: String(signals.length) })}
        </button>
      )}
      <div className={`note-block ${stylex.props(styles.note).className}`}>
        {t('chartAutoSignalsHelp')}
      </div>
    </>
  );
}
