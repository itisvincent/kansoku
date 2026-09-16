import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import type { ReviewSection } from './ReviewTab';
import { useAnalystRunStatus } from './analystRunsStore';

export interface CockpitReviewState {
  journalEntries: { name: string; date: string }[];
  reloadJournal: () => void;
  reviewSection: ReviewSection;
  setReviewSection: (section: ReviewSection) => void;
  selectedJournal: string | null;
  setSelectedJournal: (name: string | null) => void;
}

export function useCockpitReviewState(sym: string): CockpitReviewState {
  const { data: journal, reload: reloadJournal } = useQuery<{ name: string; date: string }[]>(
    `symbols.journal:${sym}`,
    () => client.symbols.journal({ sym }),
  );
  const [reviewSection, setReviewSection] = useState<ReviewSection>('history');
  const [selectedJournal, setSelectedJournal] = useState<string | null>(null);
  const running = useAnalystRunStatus(sym) !== null;
  const wasRunning = useRef(false);
  useEffect(() => {
    wasRunning.current = false;
    setSelectedJournal(null);
    setReviewSection('history');
  }, [sym]);

  // The shared action can finish while Prediction or Commentary is open.
  useEffect(() => {
    if (wasRunning.current && !running) reloadJournal();
    wasRunning.current = running;
    if (!running) return;
    const timer = window.setInterval(reloadJournal, 5_000);
    return () => window.clearInterval(timer);
  }, [running, reloadJournal]);

  return {
    journalEntries: journal ?? [],
    reloadJournal,
    reviewSection,
    setReviewSection,
    selectedJournal,
    setSelectedJournal,
  };
}
