import type { AgentEvent } from '@earendil-works/pi-agent-core';

const PREVIEW_CHARS = 160;

export type LogLine = (line: string) => void;

/** Deep-dive runs go to the app log (main.log on desktop) so a failed run can be explained. */
export const defaultLogLine: LogLine = (line) => console.info(line);

function preview(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat;
}

function describeArgs(toolName: string, args: unknown): string {
  const record = (args ?? {}) as Record<string, unknown>;
  if (toolName === 'bash') return preview(record.command);
  if (toolName === 'write_note') {
    const content = typeof record.content === 'string' ? record.content : '';
    return `${content.length} chars, ${record.final === false ? 'draft' : 'final'}`;
  }
  return preview(args);
}

function resultText(result: unknown): string {
  const content = (result as { content?: { type?: string; text?: string }[] } | undefined)?.content;
  return Array.isArray(content) ? content.map((part) => part.text ?? '').join(' ') : preview(result);
}

/** Turns agent events into one log line per tool call and per model failure. */
export function createRunLogger(symbol: string, log: LogLine = defaultLogLine) {
  const prefix = `[deep-dive] ${symbol}`;
  let turn = 0;
  return {
    onEvent(event: AgentEvent): void {
      try {
        if (event.type === 'turn_start') {
          turn += 1;
        } else if (event.type === 'tool_execution_start') {
          log(`${prefix} turn ${turn} → ${event.toolName}: ${describeArgs(event.toolName, event.args)}`);
        } else if (event.type === 'tool_execution_end') {
          const status = event.isError ? 'ERROR' : 'ok';
          log(`${prefix} turn ${turn} ← ${event.toolName} ${status}: ${preview(resultText(event.result))}`);
        } else if (event.type === 'turn_end') {
          const message = event.message as { errorMessage?: string; stopReason?: string } | undefined;
          if (message?.errorMessage) {
            log(`${prefix} turn ${turn} model ${message.stopReason ?? 'error'}: ${preview(message.errorMessage)}`);
          }
        }
      } catch {
        // Logging must never break a run.
      }
    },
    line(text: string): void {
      log(`${prefix} ${text}`);
    },
  };
}
