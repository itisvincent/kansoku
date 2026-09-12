import { chineseTranslator, type Translator } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useCapabilities } from './capabilitiesStore';
import { useLicenseModalTrigger } from './licenseModalStore';
import { ActivateForm, LicensePanel, useSubscribeInfo } from '../settings/LicensePanel';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  paywall: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 700,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    textWrap: 'balance',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: 0,
    padding: '12px 14px',
    listStyle: 'none',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderStyle: 'solid',
    borderWidth: '1px',
  },
  feature: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  featureName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  featureDesc: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  cta: {
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'height': sizes.controlHeight,
    'color': '#000',
    'backgroundColor': colors.accent,
    'borderRadius': radii.default,
    'fontSize': fontSizes.base,
    'fontWeight': 600,
    'textDecoration': 'none',
    'transitionProperty': 'transform, opacity',
    'transitionDuration': '120ms',
    ':hover': {
      color: '#000',
      opacity: 0.9,
    },
    ':active': {
      transform: 'scale(0.96)',
    },
  },
  yearly: {
    'alignSelf': 'center',
    'color': colors.accent,
    'fontSize': fontSizes.sm,
    'textDecoration': 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textWrap: 'pretty',
  },
  toggle: {
    'alignSelf': 'flex-start',
    'padding': '4px 0',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.accent,
    'fontSize': fontSizes.sm,
    'cursor': 'pointer',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  runtimeNotice: {
    marginBottom: '10px',
    padding: '8px 9px',
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    backgroundColor: colors.backgroundElement,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});

function monthlyCtaLabel(
  subscribe: {
    trialDays: number | null;
    priceLabel: string | null;
    listPriceLabel: string | null;
    discountLabel: string | null;
  },
  tr: Translator = chineseTranslator,
): string {
  const deal = [
    subscribe.discountLabel,
    subscribe.listPriceLabel ? tr('licenseListPrice', { value1: subscribe.listPriceLabel }) : null,
  ]
    .filter(Boolean)
    .join('，');
  if (subscribe.trialDays) {
    const after = subscribe.priceLabel
      ? tr('licenseThenPrice', { value1: subscribe.priceLabel })
      : '';
    const tag = deal ? `（${deal}）` : '';
    return tr('licenseTrialCta', { value1: subscribe.trialDays, value2: after, value3: tag });
  }
  const price = subscribe.priceLabel ? ` · ${subscribe.priceLabel}` : '';
  const tag = subscribe.discountLabel ? `（${subscribe.discountLabel}）` : '';
  return tr('licenseSubscribeCta', { value1: price, value2: tag });
}

function yearlyCtaLabel(
  yearly: {
    priceLabel: string | null;
    discountLabel: string | null;
    savingsLabel: string | null;
    trialDays: number | null;
  },
  tr: Translator = chineseTranslator,
): string {
  const price = yearly.priceLabel ? ` ${yearly.priceLabel}` : '';
  const deal = [yearly.discountLabel, yearly.savingsLabel].filter(Boolean).join(' · ');
  const tag = deal ? `（${deal}）` : '';
  const trial = yearly.trialDays ? tr('licenseYearlyTrial', { value1: yearly.trialDays }) : '';
  return tr('licenseYearlyCta', { value1: price, value2: tag, value3: trial });
}

export function Paywall({
  notice,
  onActivated,
}: {
  notice?: 'invalid' | 'expired';
  onActivated: () => void;
}) {
  const { t: tr } = useLocale();
  const FEATURES = [
    { name: tr('licenseAutoTrack'), desc: tr('licenseAutoTrackHelp') },
    { name: tr('licenseDeepResearch'), desc: tr('licenseDeepResearchHelp') },
    { name: tr('licenseResearchAi'), desc: tr('licenseResearchAiHelp') },
    { name: tr('licenseMemory'), desc: tr('licenseMemoryHelp') },
    { name: tr('trainBlind'), desc: tr('licenseTrainingHelp') },
    { name: tr('researchCanvas'), desc: tr('licenseCanvasHelp') },
  ];

  const subscribe = useSubscribeInfo();
  const [showActivate, setShowActivate] = useState(notice !== undefined);

  return (
    <div {...stylex.props(styles.paywall)}>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.title)}>Kansoku AI</div>
        <div {...stylex.props(styles.tagline)}>{tr('licenseUnlock')}</div>
      </div>
      <ul {...stylex.props(styles.features)}>
        {FEATURES.map((f) => (
          <li key={f.name} {...stylex.props(styles.feature)}>
            <span {...stylex.props(styles.featureName)}>{f.name}</span>
            <span {...stylex.props(styles.featureDesc)}>{f.desc}</span>
          </li>
        ))}
      </ul>
      {subscribe?.subscribeUrl ? (
        <a
          {...stylex.props(styles.cta)}
          href={subscribe.subscribeUrl}
          target="_blank"
          rel="noreferrer"
        >
          {monthlyCtaLabel(subscribe, tr)}
        </a>
      ) : null}
      {subscribe?.yearly ? (
        <a
          {...stylex.props(styles.yearly)}
          href={subscribe.yearly.subscribeUrl}
          target="_blank"
          rel="noreferrer"
        >
          {yearlyCtaLabel(subscribe.yearly, tr)}
        </a>
      ) : null}
      <div {...stylex.props(styles.hint)}>
        {subscribe?.trialDays ? tr('licenseTrialFree') : ''}
        {tr('licenseEmailCode')}
      </div>
      {showActivate ? (
        <ActivateForm notice={notice} showSubscribeLink={false} onActivated={onActivated} />
      ) : (
        <button {...stylex.props(styles.toggle)} onClick={() => setShowActivate(true)}>
          {tr('licenseHaveCode')}
        </button>
      )}
    </div>
  );
}

export function LicenseModalBody({ close }: { close: () => void }) {
  const { t: tr } = useLocale();
  const trigger = useLicenseModalTrigger();
  const { licensed, license } = useCapabilities();
  const notice =
    license?.state === 'invalid' ? 'invalid' : license?.state === 'expired' ? 'expired' : undefined;

  return (
    <>
      {trigger === 'runtime-403' ? (
        <div {...stylex.props(styles.runtimeNotice)}>{tr('licenseExpiredAction')}</div>
      ) : null}
      {licensed ? <LicensePanel /> : <Paywall notice={notice} onActivated={close} />}
    </>
  );
}
