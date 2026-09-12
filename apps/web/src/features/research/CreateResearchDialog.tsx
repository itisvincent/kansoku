import { LocalizedText, useLocale  } from '@web/lib/i18n';
import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { ResearchCreateResult, ResearchKind } from '@kansoku/core/contract/index';
import { trackFeatureUsed } from '@web/lib/analytics';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { easternToday } from '@web/lib/easternDate';
import { navigate } from '@web/lib/router';
import { Button, ErrorBox, Input, openModal, SegmentedControl, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { researchRoute, viewForKind } from './researchModel';

const styles = stylex.create({
  dialog: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minWidth: '360px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  symbolInput: {
    textTransform: 'uppercase',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px',
  },
});

export function CreateResearchDialog({
  initialKind,
  close,
  onCreated,
}: {
  initialKind: ResearchKind;
  close: () => void;
  onCreated: (result: ResearchCreateResult) => void;
}) {
  const { t: tr } = useLocale();
  const KIND_OPTIONS: { label: string; value: ResearchKind }[] = [
    { label: tr('researchStocks'), value: 'stock' },
    { label: tr('researchJournal'), value: 'journal' },
  ];

  const [kind, setKind] = useState<ResearchKind>(initialKind);
  const [symbol, setSymbol] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => easternToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedSymbol = symbol.trim();
  const trimmedTitle = title.trim();
  const canSubmit = kind === 'stock' ? trimmedSymbol.length > 0 : trimmedTitle.length > 0;

  const changeKind = (next: ResearchKind) => {
    setKind(next);
    setError(null);
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.research.create(
        kind === 'stock'
          ? { kind: 'stock', symbol: trimmedSymbol }
          : { kind: 'journal', title: trimmedTitle, date },
      );
      trackFeatureUsed('research_create', { variant: kind === 'stock' ? 'stock' : 'journal' });
      navigate(researchRoute(viewForKind(result.document.kind), result.document.path));
      onCreated(result);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <div className={`create-research-dialog ${stylex.props(styles.dialog).className}`}>
      <SegmentedControl
        ariaLabel={tr('researchCreateType')}
        value={kind}
        onChange={changeKind}
        options={KIND_OPTIONS}
      />
      {kind === 'stock' ? (
        <label className={`create-research-field ${stylex.props(styles.field).className}`}>
          <span>{tr('researchSymbol')}</span>
          <Input
            autoFocus
            className={`create-research-symbol-input ${stylex.props(styles.symbolInput).className}`}
            placeholder={tr('researchSymbolExample')}
            value={symbol}
            disabled={busy}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          />
        </label>
      ) : (
        <>
          <label className={`create-research-field ${stylex.props(styles.field).className}`}>
            <span>{tr('researchTitle')}</span>
            <Input
              autoFocus
              placeholder={tr('researchJournalTitle')}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className={`create-research-field ${stylex.props(styles.field).className}`}>
            <span>{tr('researchDate')}</span>
            <Input
              type="date"
              value={date}
              disabled={busy}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </>
      )}
      {error && (
        <ErrorBox className="create-research-error" role="alert">
          {error}
        </ErrorBox>
      )}
      <div className={`create-research-actions ${stylex.props(styles.actions).className}`}>
        <Button disabled={busy} onClick={close}>
          {tr('uiCancel')}
        </Button>
        <Button accent disabled={!canSubmit || busy} onClick={() => void submit()}>
          {busy && <Spinner />}
          {busy && kind === 'stock' ? tr('researchCreating') : tr('researchCreate')}
        </Button>
      </div>
    </div>
  );
}

export function openCreateResearchDialog(
  initialKind: ResearchKind,
  onCreated: (result: ResearchCreateResult) => void,
): void {
  openModal({
    title: <LocalizedText message="researchNew" />,
    size: 'sm',
    body: (close) => (
      <CreateResearchDialog initialKind={initialKind} close={close} onCreated={onCreated} />
    ),
  });
}
