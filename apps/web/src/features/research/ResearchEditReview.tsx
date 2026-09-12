import { LocalizedText, chineseTranslator, type Translator } from '@web/lib/i18n';
import { useLocale } from '@web/lib/i18n';
import { useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type {
  ResearchDocument,
  ResearchEditOperation,
  ResearchEditProposal,
} from '@kansoku/core/contract/index';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Checkbox, openModal, Spinner } from '@web/ui';
import { colors, fontSizes, fonts, radii, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  summary: {
    alignItems: 'center',
    columnGap: '10px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    rowGap: '7px',
  },
  summaryText: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    margin: 0,
    textWrap: 'pretty',
  },
  summaryPath: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.lg,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    gridColumn: '1 / -1',
    overflowWrap: 'anywhere',
    padding: '6px 8px',
  },
  status: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.full,
    color: colors.textSecondary,
    display: 'inline-flex',
    fontSize: fontSizes.xs,
    minHeight: '24px',
    padding: '0 8px',
    whiteSpace: 'nowrap',
  },
  statusPending: {
    backgroundColor: 'rgba(255, 176, 0, 0.1)',
    color: colors.accent,
  },
  statusApplied: {
    backgroundColor: 'rgba(38, 166, 154, 0.1)',
    color: colors.up,
  },
  statusRejected: {
    backgroundColor: 'rgba(239, 83, 80, 0.1)',
    color: colors.down,
  },
  operations: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  operation: {
    backgroundColor: 'rgba(255, 255, 255, 0.018)',
    borderRadius: radii.lg,
    boxShadow: `0 0 0 1px ${colors.border}`,
    opacity: 0.58,
    padding: '8px',
    transitionDuration: '150ms',
    transitionProperty: 'opacity, box-shadow',
    transitionTimingFunction: 'ease-out',
  },
  operationSelected: {
    boxShadow: '0 0 0 1px rgba(255, 176, 0, 0.24)',
    opacity: 1,
  },
  operationLabel: {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    gap: '8px',
    minHeight: sizes.controlHeight,
  },
  operationTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: 600,
  },
  pair: {
    'display': 'grid',
    'gap': '8px',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 760px)': {
      gridTemplateColumns: '1fr',
    },
  },
  code: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.lg,
    minWidth: 0,
    padding: '8px',
  },
  codeRemoved: {
    backgroundColor: 'rgba(239, 83, 80, 0.07)',
  },
  codeAdded: {
    backgroundColor: 'rgba(38, 166, 154, 0.07)',
  },
  codeLabel: {
    color: colors.textMuted,
    display: 'block',
    fontSize: fontSizes.xs,
    marginBottom: '5px',
  },
  codeText: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    lineHeight: 1.55,
    margin: 0,
    maxHeight: '260px',
    overflow: 'auto',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    paddingTop: '2px',
  },
  action: {
    'alignItems': 'center',
    'display': 'inline-flex',
    'justifyContent': 'center',
    'transitionDuration': '150ms',
    'transitionProperty': 'scale, border-color, background-color',
    'transitionTimingFunction': 'ease-out',
    ':active:not([disabled])': {
      transform: 'scale(0.96)',
    },
  },
  error: {
    color: colors.down,
    fontSize: fontSizes.xs,
    lineHeight: 1.45,
    padding: '8px 10px',
    textWrap: 'pretty',
  },
  undoConfirm: {
    borderColor: colors.down,
    color: colors.down,
  },
});

export function STATUS_LABEL(
  tr: Translator = chineseTranslator,
): Record<ResearchEditProposal['status'], string> {
  return {
    pending: tr('researchPending'),
    applied: tr('researchApplied'),
    rejected: tr('researchRejected'),
    undone: tr('researchReverted'),
    stale: tr('researchInvalid'),
  };
}

function operationLabel(
  operation: ResearchEditOperation,
  tr: Translator = chineseTranslator,
): string {
  if (operation.type === 'replace') return tr('researchReplace');
  if (operation.type === 'insert_after') return tr('researchInsert');
  return tr('researchAppend');
}

function OperationPreview({
  operation,
  index,
  selected,
  disabled,
  onToggle,
}: {
  operation: ResearchEditOperation;
  index: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t: tr } = useLocale();
  return (
    <section
      className={`research-edit-operation${selected ? ' selected' : ''} ${stylex.props(styles.operation, selected && styles.operationSelected).className}`}
    >
      <header>
        <label className={stylex.props(styles.operationLabel).className}>
          <Checkbox checked={selected} disabled={disabled} onCheckedChange={onToggle} />
          <span className={stylex.props(styles.operationTitle).className}>
            {tr('researchChange')}
            {index + 1} · {operationLabel(operation, tr)}
          </span>
        </label>
      </header>
      {operation.type === 'replace' ? (
        <div className={`research-edit-pair ${stylex.props(styles.pair).className}`}>
          <div
            className={`research-edit-code research-edit-code--removed ${stylex.props(styles.code, styles.codeRemoved).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>
              {tr('researchOriginal')}
            </span>
            <pre className={stylex.props(styles.codeText).className}>{operation.oldText}</pre>
          </div>
          <div
            className={`research-edit-code research-edit-code--added ${stylex.props(styles.code, styles.codeAdded).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>{tr('researchAfter')}</span>
            <pre className={stylex.props(styles.codeText).className}>
              {operation.newText || tr('researchDeleted')}
            </pre>
          </div>
        </div>
      ) : operation.type === 'insert_after' ? (
        <div className={`research-edit-pair ${stylex.props(styles.pair).className}`}>
          <div
            className={`research-edit-code research-edit-code--context ${stylex.props(styles.code).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>{tr('researchLocate')}</span>
            <pre className={stylex.props(styles.codeText).className}>{operation.anchor}</pre>
          </div>
          <div
            className={`research-edit-code research-edit-code--added ${stylex.props(styles.code, styles.codeAdded).className}`}
          >
            <span className={stylex.props(styles.codeLabel).className}>
              {tr('researchInsertAfter')}
            </span>
            <pre className={stylex.props(styles.codeText).className}>{operation.content}</pre>
          </div>
        </div>
      ) : (
        <div
          className={`research-edit-code research-edit-code--added ${stylex.props(styles.code, styles.codeAdded).className}`}
        >
          <span className={stylex.props(styles.codeLabel).className}>
            {tr('researchAppendEnd')}
          </span>
          <pre className={stylex.props(styles.codeText).className}>{operation.content}</pre>
        </div>
      )}
    </section>
  );
}

function ResearchEditReview({
  proposal,
  close,
  onChanged,
}: {
  proposal: ResearchEditProposal;
  close: () => void;
  onChanged: (document?: ResearchDocument) => void;
}) {
  const { t: tr } = useLocale();
  const editable = proposal.status === 'pending';
  const [selected, setSelected] = useState<number[]>(
    () => proposal.appliedOperationIndexes ?? proposal.operations.map((_, index) => index),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const toggle = (index: number) => {
    if (!editable) return;
    setSelected((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index].sort((a, b) => a - b),
    );
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await client.research.applyEdit({
        id: proposal.id,
        path: proposal.path,
        operationIndexes: selected,
      });
      onChanged(result.document);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.research.rejectEdit({ id: proposal.id, path: proposal.path });
      onChanged();
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!confirmUndo) {
      setConfirmUndo(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await client.research.undoEdit({ id: proposal.id, path: proposal.path });
      onChanged(result.document);
      close();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <div className={`research-edit-review ${stylex.props(styles.root).className}`}>
      <div className={`research-edit-review-summary ${stylex.props(styles.summary).className}`}>
        <span
          className={`research-edit-status research-edit-status--${proposal.status} ${stylex.props(styles.status, proposal.status === 'pending' ? styles.statusPending : proposal.status === 'applied' ? styles.statusApplied : proposal.status === 'rejected' || proposal.status === 'stale' ? styles.statusRejected : null).className}`}
        >
          {STATUS_LABEL(tr)[proposal.status]}
        </span>
        <p className={stylex.props(styles.summaryText).className}>{proposal.summary}</p>
        <code className={stylex.props(styles.summaryPath).className}>{proposal.path}</code>
      </div>
      <div className={`research-edit-operations ${stylex.props(styles.operations).className}`}>
        {proposal.operations.map((operation, index) => (
          <OperationPreview
            key={`${proposal.id}:${index}`}
            operation={operation}
            index={index}
            selected={selected.includes(index)}
            disabled={!editable || busy}
            onToggle={() => toggle(index)}
          />
        ))}
      </div>
      {error ? (
        <div
          className={`research-assistant-error ${stylex.props(styles.error).className}`}
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <footer className={`research-edit-review-actions ${stylex.props(styles.actions).className}`}>
        {editable ? (
          <>
            <Button
              className={stylex.props(styles.action).className}
              disabled={busy}
              onClick={() => void reject()}
            >
              <X size={14} />
              {tr('researchRejectAll')}
            </Button>
            <Button
              accent
              className={stylex.props(styles.action).className}
              disabled={busy || selected.length === 0}
              onClick={() => void apply()}
            >
              {busy ? <Spinner /> : <Check size={14} />}
              {tr('researchApply')}
              {selected.length}
              {tr('researchChangesSuffix')}
            </Button>
          </>
        ) : proposal.status === 'applied' ? (
          <Button
            className={`${confirmUndo ? 'research-edit-undo-confirm ' : ''}${stylex.props(styles.action, confirmUndo && styles.undoConfirm).className}`}
            disabled={busy}
            onClick={() => void undo()}
          >
            {busy ? <Spinner /> : <Undo2 size={14} />}
            {confirmUndo ? tr('researchRevertConfirm') : tr('researchRevert')}
          </Button>
        ) : (
          <Button className={stylex.props(styles.action).className} onClick={close}>
            {tr('uiClose')}
          </Button>
        )}
      </footer>
    </div>
  );
}

export function openEditReview(
  proposal: ResearchEditProposal,
  onChanged: (document?: ResearchDocument) => void,
): void {
  openModal({
    title: <LocalizedText message="researchReviewEdits" />,
    body: (close) => <ResearchEditReview proposal={proposal} close={close} onChanged={onChanged} />,
  });
}
