import { useLocale } from '@web/lib/i18n';
import { localizeStatusMessage } from './statusMessages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { trackFeatureUsed } from '@web/lib/analytics';
import { ApiError, errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';

export const bareSymbol = (value: string) => value.toUpperCase().replace(/\.US$/, '');

const STATUS_POLL_MS = 10_000;

export function useDeepDive(symbol: string, onNoteReady: () => void) {
  const { locale, t } = useLocale();
  const [pending, setPending] = useState(false);
  const [running, setRunning] = useState(false);
  const [runningSymbol, setRunningSymbol] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const seenFinishedAtRef = useRef<string | null>(null);
  const [initialStatusChecked, setInitialStatusChecked] = useState(false);
  // Set when this view starts a run; the first status read must not overwrite that state,
  // and only the view that started a run reports it as completed.
  const startedHereRef = useRef(false);

  useEffect(() => {
    let active = true;
    // The cockpit stays mounted across symbols: drop the previous symbol's messages.
    startedHereRef.current = false;
    setRunning(false);
    setRunningSymbol(null);
    setStartedAt(null);
    setInlineMessage(null);
    setSuccessNote(null);
    setInitialStatusChecked(false);
    client.symbols
      .deepDiveStatus({ sym: symbol })
      .then((status) => {
        if (!active || startedHereRef.current) return;
        if (status.running) {
          setRunning(true);
          setRunningSymbol(status.symbol ?? null);
          setStartedAt(status.startedAt ?? null);
        }
        const last = status.lastResult;
        if (last) {
          seenFinishedAtRef.current = last.finishedAt;
          // A failure is kept across restarts; show why the last run on this stock stopped.
          if (!status.running && !last.ok && bareSymbol(last.symbol) === bareSymbol(symbol)) {
            const when = new Date(last.finishedAt).toLocaleString(locale);
            setInlineMessage(
              t('cockpitDeepLastFailed', { when, error: last.error ?? t('cockpitDeepFailed') }),
            );
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setInitialStatusChecked(true);
      });
    return () => {
      active = false;
    };
  }, [symbol]);

  useEffect(() => {
    if (!running) return;
    let active = true;

    const poll = async () => {
      try {
        const status = await client.symbols.deepDiveStatus({ sym: symbol });
        if (!active) return;
        if (status.running) {
          setRunning(true);
          setRunningSymbol(status.symbol ?? null);
          setStartedAt(status.startedAt ?? null);
          return;
        }
        setRunning(false);
        setRunningSymbol(null);
        setStartedAt(null);
        const result = status.lastResult;
        // Paired with the `started` event, so the two counts show how many deep runs are
        // abandoned or die mid-flight. Only the view that started the run reports it.
        if (startedHereRef.current && result?.ok) {
          trackFeatureUsed('deep_research', { stage: 'completed' });
        }
        startedHereRef.current = false;
        if (
          result &&
          bareSymbol(result.symbol) === bareSymbol(symbol) &&
          result.finishedAt !== seenFinishedAtRef.current
        ) {
          seenFinishedAtRef.current = result.finishedAt;
          if (result.ok) {
            setSuccessNote(
              result.dirtyWarning ? 'local:cockpitDeepDirty' : 'local:cockpitDeepComplete',
            );
            onNoteReady();
          } else {
            setInlineMessage(result.error ?? 'local:cockpitDeepFailed');
          }
        }
      } catch {
        if (!active) return;
      }
    };

    const timer = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [running, symbol, onNoteReady]);

  const start = useCallback(async () => {
    startedHereRef.current = true;
    setInlineMessage(null);
    setSuccessNote(null);
    setPending(true);
    try {
      const result = await client.symbols.deepDive({ sym: symbol });
      // Desktop IPC hands a refusal back as a plain body instead of a 409/503 status.
      if (result && result.started === false) {
        startedHereRef.current = false;
        if (result.reason === 'busy') {
          setInlineMessage('local:cockpitDeepBusy');
        } else {
          setDisabled(true);
          setInlineMessage('local:cockpitDeepUnconfigured');
        }
        return;
      }
      trackFeatureUsed('deep_research', { stage: 'started' });
      setRunning(true);
      setRunningSymbol(symbol);
      setStartedAt(new Date().toISOString());
    } catch (error) {
      startedHereRef.current = false;
      if (error instanceof ApiError && error.status === 409) {
        setInlineMessage('local:cockpitDeepBusy');
      } else if (error instanceof ApiError && error.status === 503) {
        setDisabled(true);
        setInlineMessage('local:cockpitDeepUnconfigured');
      } else {
        setInlineMessage(errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }, [symbol]);

  return {
    pending,
    running,
    runningSymbol,
    startedAt,
    disabled,
    inlineMessage: localizeStatusMessage(inlineMessage, locale),
    successNote: localizeStatusMessage(successNote, locale),
    start,
    initialStatusChecked,
  };
}
