import { type MessageKey } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import * as stylex from '@stylexjs/stylex';
import type { SymbolAnalysisRow } from '@kansoku/shared/types';
import { NoteBlock } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { HistoryTab } from './HistoryTab';
import { JournalSection, type JournalEntryMeta } from './JournalSection';
import { NoteTab } from './NoteTab';

const styles = stylex.create({
  switch: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '2px',
    marginBottom: '10px',
  },
  switchItem: {
    'backgroundColor': 'transparent',
    'borderBottomColor': 'transparent',
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '2px',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontSize': fontSizes.control,
    'padding': '4px 10px',
    ':hover': {
      color: colors.textPrimary,
    },
  },
  switchItemActive: {
    borderBottomColor: colors.accent,
    color: colors.textPrimary,
  },
  emptyNote: {
    marginBottom: '16px',
  },
});

export type ReviewSection = 'history' | 'journal' | 'note';

const SECTIONS: { key: ReviewSection; label: MessageKey }[] = [
  { key: 'history', label: 'cockpitTabHistory' },
  { key: 'journal', label: 'cockpitTabJournal' },
  { key: 'note', label: 'cockpitTabNote' },
];

export function ReviewTab({
  symbol,
  rows,
  currentId,
  journal,
  section,
  onSectionChange,
  selectedJournal,
  onSelectJournal,
  reloadJournal,
}: {
  symbol: string;
  rows: SymbolAnalysisRow[];
  currentId: string | null;
  journal: JournalEntryMeta[];
  section: ReviewSection;
  onSectionChange: (section: ReviewSection) => void;
  selectedJournal: string | null;
  onSelectJournal: (name: string | null) => void;
  reloadJournal: () => void;
}) {
  const { t: i18n } = useLocale();
  const journalByDate = new Map(journal.map((e) => [e.date, e.name] as [string, string]));
  const openJournal = (name: string) => {
    onSelectJournal(name);
    onSectionChange('journal');
  };

  return (
    <div className="review-tab">
      <div {...stylex.props(styles.switch)}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`${section === s.key ? 'active ' : ''}${stylex.props(styles.switchItem, section === s.key && styles.switchItemActive).className}`}
            onClick={() => onSectionChange(s.key)}
          >
            {i18n(s.label)}
          </button>
        ))}
      </div>
      {section === 'history' &&
        (rows.length === 0 ? (
          <NoteBlock className={stylex.props(styles.emptyNote).className}>
            {i18n('cockpitNoHistory')}
          </NoteBlock>
        ) : (
          <HistoryTab
            symbol={symbol}
            rows={rows}
            currentId={currentId}
            journalByDate={journalByDate}
            onOpenJournal={openJournal}
          />
        ))}
      {section === 'journal' && (
        <JournalSection
          symbol={symbol}
          entries={journal}
          selected={selectedJournal}
          onSelect={onSelectJournal}
          reloadJournal={reloadJournal}
        />
      )}
      {section === 'note' && <NoteTab symbol={symbol} />}
    </div>
  );
}
