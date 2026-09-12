// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from '@web/lib/i18n';
import { useExplainSymbol } from './useExplainSymbol';
import { localizeStatusMessage } from './statusMessages';

const explain = vi.hoisted(() => vi.fn());
vi.mock('@web/lib/client', () => ({ client: { symbols: { explain } } }));

afterEach(() => {
  cleanup();
  localStorage.removeItem('kansoku.locale');
  explain.mockReset();
});

it('changes language during a pending request without restarting it and translates the resulting hint', async () => {
  localStorage.setItem('kansoku.locale', 'en-US');
  let resolve!: (value: unknown) => void;
  explain.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result } = renderHook(() => ({ controller: useExplainSymbol('MU.US'), ...useLocale() }), {
    wrapper: LocaleProvider,
  });
  let request!: Promise<void>;
  act(() => {
    request = result.current.controller.explain();
  });
  act(() => {
    result.current.setLocale('zh-CN');
  });
  expect(result.current.controller.pending).toBe(true);
  expect(explain).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({ ok: false, reason: 'busy' });
    await request;
  });
  expect(result.current.controller.hint).toBe('解读正在进行中，请稍候');
  act(() => {
    result.current.setLocale('en-US');
  });
  expect(result.current.controller.hint).toBe('Interpretation is in progress. Please wait.');
  expect(explain).toHaveBeenCalledTimes(1);
});

it('preserves provider error details in either language', () => {
  const detail = '上游 429: quota exceeded';
  expect(localizeStatusMessage(detail, 'en-US')).toBe(detail);
  expect(localizeStatusMessage(detail, 'zh-CN')).toBe(detail);
});
