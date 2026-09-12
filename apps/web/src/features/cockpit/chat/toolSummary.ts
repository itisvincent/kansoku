import { translate, type Locale } from '@web/lib/i18n';

const MAX_SUMMARY_LENGTH = 80;
const MAX_VISIBLE_ITEMS = 4;

export interface ToolPresentation {
  title: string;
  items: string[];
  meta?: string;
}

type ToolInput = Record<string, unknown>;

function truncate(value: string): string {
  if (value.length <= MAX_SUMMARY_LENGTH) return value;
  return `${value.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
}

function parseToolInput(input?: string): ToolInput | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ToolInput)
      : null;
  } catch {
    return null;
  }
}

function stringValue(input: ToolInput | null, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(input: ToolInput | null, key: string): number | undefined {
  const value = input?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toolKey(label: string): string {
  return label.toLowerCase().replaceAll(/[^\da-z]+/g, '');
}

function commandTokens(command: string): string[] {
  return (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((token) =>
    token.replaceAll(/^["']|["']$/g, ''),
  );
}

function isMarketSymbol(token: string): boolean {
  return /^\$?[\da-z][\d.a-z-]*\.(?:us|hk|sh|sz)$/i.test(token);
}

function displaySymbol(symbol: string): string {
  const normalized = symbol.replace(/^\$/, '').toUpperCase();
  return `$${normalized}`;
}

function visibleItems(items: string[]): string[] {
  if (items.length <= MAX_VISIBLE_ITEMS) return items;
  return [...items.slice(0, MAX_VISIBLE_ITEMS), `+${items.length - MAX_VISIBLE_ITEMS}`];
}

function presentBash(
  input: ToolInput | null,
  rawInput: string | undefined,
  locale: Locale,
): ToolPresentation {
  const i18n = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
    translate(locale, key, params);
  const command = stringValue(input, 'command');
  if (!command) {
    return {
      title: i18n('chatToolCommand'),
      items: [],
      meta: summarizeToolInput(rawInput),
    };
  }

  const tokens = commandTokens(command);
  const longbridgeIndex = tokens.findIndex((token) => /(?:^|\/)longbridge$/.test(token));
  if (longbridgeIndex >= 0 && tokens[longbridgeIndex + 1] === 'quote') {
    const symbols = tokens.slice(longbridgeIndex + 2).filter(isMarketSymbol);
    if (symbols.length > 0) {
      return {
        title: i18n('chatToolQuotes'),
        items: visibleItems(symbols.map(displaySymbol)),
        meta: i18n('chatToolQuotesMeta', { count: symbols.length }),
      };
    }
  }

  return {
    title: i18n('chatToolCommand'),
    items: [],
    meta: truncate(command),
  };
}

function patchedPaths(patch?: string): string[] {
  if (!patch) return [];
  return [...patch.matchAll(/^\*{3} Update File: (.+)$/gm)].map((m) => m[1].trim());
}

export function summarizeToolInput(input?: string): string {
  if (!input) return '';
  const firstLine = input.split('\n')[0]?.trim() ?? '';
  return truncate(firstLine);
}

export function presentToolCall(
  label: string,
  input?: string,
  locale: Locale = 'zh-CN',
): ToolPresentation {
  const i18n = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
    translate(locale, key, params);
  const parsed = parseToolInput(input);
  const key = toolKey(label);

  if (key === 'bash') return presentBash(parsed, input, locale);

  if (key === 'fetchkline') {
    const symbol = stringValue(parsed, 'symbol');
    const period = stringValue(parsed, 'period');
    const count = numberValue(parsed, 'count');
    return {
      title: i18n('chatToolCandles'),
      items: symbol ? [displaySymbol(symbol)] : [],
      meta: [period, count === undefined ? undefined : i18n('chatToolCandleCount', { count })]
        .filter(Boolean)
        .join(' · '),
    };
  }

  if (key === 'fetchnews') {
    const symbol = stringValue(parsed, 'symbol');
    return {
      title: i18n('chatToolNews'),
      items: symbol ? [displaySymbol(symbol)] : [],
      meta: i18n('chatToolNewsMeta'),
    };
  }

  if (key === 'readdatapack') {
    const symbol = stringValue(parsed, 'symbol');
    return {
      title: i18n('chatToolData'),
      items: symbol ? [displaySymbol(symbol)] : [],
      meta: i18n('chatToolDataMeta'),
    };
  }

  if (key === 'readskill') {
    const name = stringValue(parsed, 'name');
    return { title: i18n('chatToolSkill'), items: name ? [name] : [] };
  }

  if (key === 'savecanvas') {
    const slug = stringValue(parsed, 'slug');
    const title = stringValue(parsed, 'title');
    return {
      title: i18n('chatToolSaveCanvas'),
      items: title ? [title] : [],
      meta: slug,
    };
  }

  if (key === 'readcanvas') {
    const slug = stringValue(parsed, 'slug');
    return { title: i18n('chatToolReadCanvas'), items: [], meta: slug };
  }

  if (key === 'applypatch') {
    const paths = patchedPaths(stringValue(parsed, 'patch'));
    return {
      title: i18n('chatToolPatchCanvas'),
      items: [],
      meta: paths.length ? truncate(paths.join(', ')) : undefined,
    };
  }

  if (key === 'listcanvases') {
    return { title: i18n('chatToolListCanvases'), items: [] };
  }

  if (key === 'readfile' || key === 'readresearchdocument') {
    const path = stringValue(parsed, 'path');
    return {
      title: key === 'readfile' ? i18n('chatToolReadFile') : i18n('chatToolReadResearch'),
      items: [],
      meta: path ? truncate(path) : summarizeToolInput(input),
    };
  }

  if (key === 'searchresearchlibrary' || key === 'searchresearchdocuments') {
    const query = stringValue(parsed, 'query') ?? stringValue(parsed, 'pattern');
    return {
      title: i18n('chatToolSearchResearch'),
      items: [],
      meta: query ? truncate(query) : summarizeToolInput(input),
    };
  }

  const semanticValue =
    stringValue(parsed, 'symbol') ??
    stringValue(parsed, 'path') ??
    stringValue(parsed, 'query') ??
    stringValue(parsed, 'name');
  return {
    title: label || i18n('chatToolCall'),
    items: [],
    meta: semanticValue ? truncate(semanticValue) : summarizeToolInput(input),
  };
}

export function toolRowKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}
