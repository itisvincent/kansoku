import { type MessageKey } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CapitalBucket, CockpitFlow } from '@kansoku/shared/types';
import {
  hhmm,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipTime,
} from '@web/features/charts/simple/theme';
import { client } from '@web/lib/client';
import { signed, upDown } from '@web/lib/format';
import { NoteBlock, SectionTitle } from '@web/ui';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { useIntervalFetch } from './useIntervalFetch';

const BUCKET_LABEL: Record<string, MessageKey> = {
  large: 'cockpitLargeOrder',
  medium: 'cockpitMediumOrder',
  small: 'cockpitSmallOrder',
};

const styles = stylex.create({
  chart: {
    height: '180px',
    width: '100%',
  },
  distribution: {
    display: 'grid',
    gap: '6px 10px',
    gridTemplateColumns: 'auto 1fr',
    fontSize: fontSizes.control,
  },
  bucketLabel: {
    color: colors.textSecondary,
  },
  bucketValue: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  bucketValueUp: {
    color: colors.up,
  },
  bucketValueDown: {
    color: colors.down,
  },
});

function BucketRow({ label, bucket }: { label: string; bucket: CapitalBucket }) {
  const tone = upDown(bucket.net);
  return (
    <>
      <div className={`k ${stylex.props(styles.bucketLabel).className}`}>{label}</div>
      <div
        className={`v ${stylex.props(styles.bucketValue, tone === 'up' ? styles.bucketValueUp : styles.bucketValueDown).className}`}
      >
        {signed(bucket.net, 0)}
      </div>
    </>
  );
}

function FlowMiniChart({ flow }: { flow: CockpitFlow }) {
  const { t: i18n } = useLocale();
  const { locale } = useLocale();
  const data = flow.curve
    .map((p) => ({ t: p.time, v: p.value }))
    .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.v));
  return (
    <div {...stylex.props(styles.chart)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.border} vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={hhmm}
            tick={{ fill: colors.textSecondary, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: colors.borderStrong }}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: colors.textSecondary, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            labelFormatter={(t) => tooltipTime(Number(t), locale)}
            formatter={(value) => [Number(value).toLocaleString(), i18n('cockpitNetInflow')]}
          />
          <ReferenceLine y={0} stroke={colors.borderStrong} />
          <Bar dataKey="v" isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.t} fill={d.v >= 0 ? colors.up : colors.down} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FlowTab({ symbol }: { symbol: string }) {
  const { t: i18n } = useLocale();
  const { data: flow, error } = useIntervalFetch<CockpitFlow | null>(
    `symbols.flow:${symbol}`,
    () => client.symbols.flow({ sym: symbol }),
    60_000,
  );

  if (error)
    return (
      <NoteBlock>
        {i18n('cockpitFlowFailed')}
        {error}
      </NoteBlock>
    );
  if (!flow) return <NoteBlock>{i18n('cockpitLoading')}</NoteBlock>;

  return (
    <>
      <SectionTitle>{i18n('cockpitFlowTitle')}</SectionTitle>
      <FlowMiniChart flow={flow} />
      {flow.distribution ? (
        <>
          <SectionTitle>{i18n('cockpitFlowBuckets')}</SectionTitle>
          <div className={`grid2 ${stylex.props(styles.distribution).className}`}>
            <BucketRow label={i18n(BUCKET_LABEL.large)} bucket={flow.distribution.large} />
            <BucketRow label={i18n(BUCKET_LABEL.medium)} bucket={flow.distribution.medium} />
            <BucketRow label={i18n(BUCKET_LABEL.small)} bucket={flow.distribution.small} />
          </div>
        </>
      ) : (
        <NoteBlock>{i18n('cockpitDistributionUnavailable')}</NoteBlock>
      )}
    </>
  );
}
