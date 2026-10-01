import { useEffect, useMemo, useState } from 'react';
import type { CockpitComment } from '@kansoku/shared/types';

export interface AiUnreadBadgeState {
  unread: number;
  latestAlert: CockpitComment | null;
}

const isAlert = (c: CockpitComment) => c.level === 'warn' || c.level === 'alert';
const timeOf = (c: CockpitComment) => {
  const t = Date.parse(c.ts);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Counts warn/alert comments that arrived after the user last looked. "Looked" is a
 * time, not a count: `commentsLoaded` turns true a render before the day's comments are
 * merged in, so a count taken then was 0 and every old alert showed as unread.
 */
export function useAiUnreadBadge(
  sym: string,
  comments: CockpitComment[],
  commentsLoaded: boolean,
  activeTab: string,
): AiUnreadBadgeState {
  const [readAt, setReadAt] = useState<number | null>(null);
  useEffect(() => {
    setReadAt(null);
  }, [sym]);
  useEffect(() => {
    // Everything that existed when the comments loaded counts as already seen.
    if (commentsLoaded && readAt === null) setReadAt(Date.now());
  }, [commentsLoaded, readAt]);

  const latestAlert = useMemo(() => {
    for (let i = comments.length - 1; i >= 0; i--) {
      if (isAlert(comments[i])) return comments[i];
    }
    return null;
  }, [comments]);

  const latestAlertAt = latestAlert ? timeOf(latestAlert) : 0;
  useEffect(() => {
    if (activeTab === 'ai') setReadAt((prev) => Math.max(prev ?? 0, Date.now(), latestAlertAt));
  }, [activeTab, latestAlertAt]);

  const unread = useMemo(() => {
    if (activeTab === 'ai' || readAt === null) return 0;
    return comments.reduce((n, c) => (isAlert(c) && timeOf(c) > readAt ? n + 1 : n), 0);
  }, [activeTab, readAt, comments]);

  return { unread, latestAlert };
}
