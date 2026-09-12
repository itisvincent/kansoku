import { chineseTranslator, type Translator } from '@web/lib/i18n';
import type {
  ResearchDocumentMeta,
  ResearchDocumentType,
  ResearchKind,
} from '@kansoku/core/contract/index';

export type ResearchView = 'stocks' | 'journal' | 'canvases';

export function parseResearchView(value: string | null): ResearchView {
  if (value === 'stocks') return 'stocks';
  if (value === 'canvases') return 'canvases';
  return 'journal';
}

export function kindForView(view: ResearchView): ResearchKind {
  if (view === 'stocks') return 'stock';
  if (view === 'canvases') return 'canvas';
  return 'journal';
}

export function viewForKind(kind: ResearchKind): ResearchView {
  if (kind === 'stock') return 'stocks';
  if (kind === 'canvas') return 'canvases';
  return 'journal';
}

export function researchTypeLabel(
  type: ResearchDocumentType,
  tr: Translator = chineseTranslator,
): string {
  const TYPE_LABELS: Record<ResearchDocumentType, string> = {
    stock: tr('researchStocks'),
    intraday: tr('researchIntraday'),
    recap: tr('researchRecap'),
    flow: tr('researchFlow'),
    lessons: tr('researchLessons'),
    decision: tr('researchDecisions'),
    archive: tr('researchArchive'),
    journal: tr('researchJournal'),
    canvas: tr('researchCanvas'),
  };

  return TYPE_LABELS[type];
}

export function researchListTitle(meta: ResearchDocumentMeta): string {
  const date = meta.date;
  if (!date) return meta.title;

  const escapedDate = date.replaceAll('-', '\\-');
  const withoutLeadingDate = meta.title.replace(new RegExp(`^${escapedDate}(?:T|\\s)+`), '');
  const withoutTrailingDate = withoutLeadingDate.replace(
    new RegExp(`\\s*[—–-]\\s*${escapedDate}$`),
    '',
  );
  const compactTime = withoutTrailingDate.replace(/^(\d{2}:\d{2})(?::\d{2})?Z?\b/, '$1');
  return compactTime.trim() || meta.title;
}

export function researchListSecondary(
  meta: ResearchDocumentMeta,
  tr: Translator = chineseTranslator,
): string {
  return [researchTypeLabel(meta.type, tr), meta.symbols.join(' · ')].filter(Boolean).join(' · ');
}

export function researchRoute(view: ResearchView, path?: string): string {
  const params = new URLSearchParams({ view });
  if (path) params.set('path', path);
  return `/research?${params.toString()}`;
}

export function relatedDocuments(
  selected: ResearchDocumentMeta,
  all: ResearchDocumentMeta[],
): ResearchDocumentMeta[] {
  const symbols = new Set(selected.symbols);
  if (symbols.size === 0) return [];
  return all
    .filter(
      (document) =>
        document.path !== selected.path && document.symbols.some((symbol) => symbols.has(symbol)),
    )
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'stock' ? -1 : 1;
      return (b.date ?? b.mtime).localeCompare(a.date ?? a.mtime);
    });
}
