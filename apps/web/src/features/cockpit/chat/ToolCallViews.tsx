import { useLocale } from '@web/lib/i18n';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { StepRow } from './StepRow.js';
import { presentToolCall } from './toolSummary.js';
import type { PresentedTool } from './presentTranscript.js';

const styles = stylex.create({
  detailLabel: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginBottom: '2px',
  },
  detailPre: {
    margin: 0,
    padding: '7px 9px',
    maxHeight: '200px',
    overflow: 'auto',
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.lg,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
});

function ToolDetail({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className={`chat-step-detail-label ${stylex.props(styles.detailLabel).className}`}>
        {label}
      </div>
      <pre className={stylex.props(styles.detailPre).className}>{body}</pre>
    </div>
  );
}

export function ToolRow({ tool }: { tool: PresentedTool }) {
  const { t: i18n, locale } = useLocale();
  const presentation = presentToolCall(tool.label, tool.input, locale);
  const detail =
    tool.input || tool.output ? (
      <>
        {tool.input ? <ToolDetail label={i18n('chatRequest')} body={tool.input} /> : null}
        {tool.output ? <ToolDetail label={i18n('chatResponse')} body={tool.output} /> : null}
      </>
    ) : null;

  return (
    <StepRow
      foldId={`tool:${tool.id}`}
      className="chat-tool"
      title={presentation.title}
      chips={presentation.items}
      gist={presentation.meta}
      monoGist
      detail={detail}
      running={tool.running}
    />
  );
}
