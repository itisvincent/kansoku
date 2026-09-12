import { useLocale } from '@web/lib/i18n';
import type { NewsItem } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { Badge, MarketTime, NoteBlock, SectionTitle } from '../../ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  item: {
    'backgroundColor': colors.backgroundSurface,
    'borderLeftColor': colors.borderStrong,
    'borderLeftStyle': 'solid',
    'borderLeftWidth': '2px',
    'color': colors.textPrimary,
    'display': 'block',
    'marginBottom': '4px',
    'padding': '7px 8px',
    'textDecoration': 'none',
    ':hover': {
      borderLeftColor: colors.accent,
      color: colors.accent,
      textDecoration: 'none',
    },
    ':hover .news-title': {
      color: colors.accent,
    },
  },
  meta: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
    gap: '6px',
  },
  title: {
    color: colors.textPrimary,
    display: 'block',
    fontSize: fontSizes.base,
    lineHeight: 1.45,
    marginTop: '3px',
  },
});

export function NewsSection({ news }: { news: NewsItem[] }) {
  const { t: i18n } = useLocale();
  if (!news.length) return null;

  return (
    <>
      <SectionTitle>{i18n('chartRelatedNews')}</SectionTitle>
      {news.map((n) => {
        const community = n.url.includes('/topics/');
        return (
          <a
            key={n.id}
            className={`news-item ${stylex.props(styles.item).className}`}
            href={n.url}
            rel="noreferrer"
            target="_blank"
          >
            <span className={`news-meta ${stylex.props(styles.meta).className}`}>
              <MarketTime value={n.published_at} format="month-day-time" />
              <Badge>{community ? i18n('chartCommunity') : i18n('chartNews')}</Badge>
            </span>
            <span className={`news-title ${stylex.props(styles.title).className}`}>{n.title}</span>
          </a>
        );
      })}
      <NoteBlock>{i18n('chartCommunityNote')}</NoteBlock>
    </>
  );
}
