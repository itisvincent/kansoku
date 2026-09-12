import { chineseTranslator, type Translator } from '@web/lib/i18n';
import { normalizeSymbol } from '../../lib/symbol';

export interface PaletteCommand {
  id: string;
  title: string;
  hint?: string;
  keywords: string[];
  route?: string;
  kind?: 'trainer';
}

const MAX_COMMANDS = 12;

function STATIC_COMMANDS(tr: Translator = chineseTranslator): PaletteCommand[] {
  return [
    { id: 'nav:home', title: tr('uiHome'), keywords: ['home'], route: '/' },
    {
      id: 'nav:research',
      title: tr('paletteResearch'),
      keywords: ['research', 'stocks', 'journal', '研究', '日志', '笔记'],
      route: '/research?view=journal',
    },
    {
      id: 'nav:chat',
      title: tr('paletteChat'),
      keywords: ['chat', 'ai', 'assistant', '对话', '助手'],
      route: '/chat',
    },
    {
      id: 'nav:canvases',
      title: tr('paletteCanvas'),
      keywords: ['canvas', 'canvases', tr('researchCanvas'), '面板'],
      route: '/research?view=canvases',
    },
    {
      id: 'nav:settings',
      title: tr('paletteSettings'),
      keywords: ['settings', 'config'],
      route: '/settings/ai',
    },
    {
      id: 'nav:logs',
      title: tr('paletteLogs'),
      keywords: ['logs', 'log', '日志', 'debug'],
      route: '/logs',
    },
  ];
}

function TRAINER_COMMAND(tr: Translator = chineseTranslator): PaletteCommand {
  return {
    id: 'action:trainer',
    title: tr('paletteTraining'),
    keywords: ['trainer', 'blind', 'replay', '训练', '盲盘', '复盘'],
    kind: 'trainer',
  };
}

function symbolCommand(sym: string, tr: Translator = chineseTranslator): PaletteCommand {
  const short = sym.replace(/\.US$/, '');
  return {
    id: `symbol:${sym}`,
    title: tr('paletteGoSymbol', { value1: short }),
    hint: sym,
    keywords: [sym, short],
    route: `/symbol/${encodeURIComponent(sym)}`,
  };
}

export function buildPaletteCommands(
  query: string,
  symbols: string[],
  showTrainer = false,
  tr: Translator = chineseTranslator,
): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const symbolCommands: PaletteCommand[] = [];
  for (const sym of symbols) {
    if (seen.has(sym)) continue;
    seen.add(sym);
    symbolCommands.push(symbolCommand(sym, tr));
  }

  const matches = (cmd: PaletteCommand) =>
    !q ||
    cmd.title.toLowerCase().includes(q) ||
    cmd.keywords.some((k) => k.toLowerCase().includes(q));
  const staticCommands = showTrainer
    ? [...STATIC_COMMANDS(tr), TRAINER_COMMAND(tr)]
    : STATIC_COMMANDS(tr);
  const out = [...symbolCommands, ...staticCommands].filter(matches);

  const direct = q ? normalizeSymbol(query) : null;
  if (direct && !seen.has(direct)) out.unshift(symbolCommand(direct, tr));

  return out.slice(0, MAX_COMMANDS);
}
