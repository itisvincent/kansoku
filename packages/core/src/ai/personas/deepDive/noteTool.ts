import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { textResult } from '../../agents/dataTools.js';

/** Notes shorter than this are stubs; replacing them wholesale loses nothing. */
const SUBSTANTIAL_NOTE_CHARS = 400;
/**
 * A new version under this share of the old length almost certainly dropped earlier
 * sections, which TD-NOTES-01 forbids (notes grow incrementally).
 */
const MIN_KEPT_SHARE = 0.6;

const noteSchema = Type.Object({
  content: Type.String({
    description:
      'The complete Markdown for stocks/{SYMBOL}.md after your update. Keep existing sections and dated history; add or revise, do not drop.',
  }),
  final: Type.Optional(
    Type.Boolean({
      description:
        'false saves a mid-run draft and the run continues; omit or true for the finished note, which ends the run.',
    }),
  ),
});

export interface NoteToolHooks {
  /** Absolute path of the one note this run may write. */
  notePath: string;
  onWritten: (final: boolean) => void;
}

async function readExisting(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Write to a sibling temp file, then rename, so a crash never leaves half a note. */
async function writeAtomic(path: string, content: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${process.pid}-${Date.now()}.note.tmp`);
  await fs.writeFile(temp, content, 'utf8');
  try {
    await fs.rename(temp, path);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

export function buildWriteNoteTool(hooks: NoteToolHooks): AgentTool<typeof noteSchema> {
  return {
    name: 'write_note',
    label: 'Write Note',
    description:
      'Save the research note for this stock (stocks/{SYMBOL}.md). This is the only way to persist the deep dive; the run fails without a final save. Read the existing note first and pass the full updated Markdown. Use final:false for a draft partway through.',
    parameters: noteSchema,
    execute: async (_id, params) => {
      const content = params.content.trim();
      if (!content) return textResult('write_note rejected: content is empty.');
      const existing = await readExisting(hooks.notePath);
      if (
        existing &&
        existing.trim().length >= SUBSTANTIAL_NOTE_CHARS &&
        content.length < existing.trim().length * MIN_KEPT_SHARE
      ) {
        return textResult(
          `write_note rejected: the new note (${content.length} chars) drops most of the existing note (${existing.trim().length} chars). Notes grow incrementally (TD-NOTES-01): keep earlier sections and dated history, mark outdated parts as superseded instead of deleting them, then call write_note again.`,
        );
      }
      await writeAtomic(hooks.notePath, `${content}\n`);
      const final = params.final !== false;
      hooks.onWritten(final);
      return final
        ? textResult(`saved ${content.length} chars to the stock note`, true)
        : textResult(
            `draft saved (${content.length} chars). Continue the remaining lenses, then call write_note again with the complete note and final:true.`,
          );
    },
  };
}
