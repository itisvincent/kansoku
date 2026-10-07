import { useCallback, useEffect, useState } from 'react';

const openers = new Set<(query: string) => void>();

/** Opens the command palette with `query` already typed (a chart page's type-to-search). */
export function openPalette(query = ''): void {
  for (const open of openers) open(query);
}

export function usePalette(): { open: boolean; close: () => void; query: string } {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuery('');
        setOpen((v) => !v);
      }
    };
    const openWith = (text: string) => {
      setQuery(text);
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    openers.add(openWith);
    return () => {
      window.removeEventListener('keydown', onKey);
      openers.delete(openWith);
    };
  }, []);

  return { open, close, query };
}
