// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from '@web/lib/i18n';
import { LocaleBackendSync } from './LocaleBackendSync';

const { putInterfaceLocale } = vi.hoisted(() => ({ putInterfaceLocale: vi.fn() }));
vi.mock('@web/lib/client', () => ({ client: { settings: { putInterfaceLocale } } }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

function Switcher() {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale('zh-CN')}>Chinese</button>;
}

it('serializes language changes behind an earlier pending write', async () => {
  let finish!: () => void;
  putInterfaceLocale.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  putInterfaceLocale.mockResolvedValue({ locale: 'zh-CN' });
  localStorage.setItem('kansoku.locale', 'en-US');
  render(
    <LocaleProvider>
      <LocaleBackendSync />
      <Switcher />
    </LocaleProvider>,
  );
  await waitFor(() => expect(putInterfaceLocale).toHaveBeenCalledWith({ locale: 'en-US' }));
  fireEvent.click(screen.getByRole('button', { name: 'Chinese' }));
  expect(putInterfaceLocale).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await waitFor(() => expect(putInterfaceLocale).toHaveBeenLastCalledWith({ locale: 'zh-CN' }));
  expect(localStorage.getItem('kansoku.locale')).toBe('zh-CN');
});
