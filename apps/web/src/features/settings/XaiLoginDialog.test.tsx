// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@web/lib/i18n';
import { XaiLoginDialog } from './XaiLoginDialog';

const api = vi.hoisted(() => ({
  startXaiLogin: vi.fn(),
  pollXaiLogin: vi.fn(),
  cancelXaiLogin: vi.fn(),
}));
vi.mock('@web/lib/client', () => ({ client: { settings: api } }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

it('shows the English browser login and cancels its own session on close', async () => {
  localStorage.setItem('kansoku.locale', 'en-US');
  api.startXaiLogin.mockResolvedValue({
    sessionId: 'test-login',
    status: 'pending',
    userCode: 'ABCD',
    verificationUri: 'https://auth.x.ai/activate',
  });
  api.cancelXaiLogin.mockResolvedValue({ cancelled: true });
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const view = render(
    <LocaleProvider>
      <XaiLoginDialog closeModal={() => {}} onConnected={() => {}} />
    </LocaleProvider>,
  );
  expect(await screen.findByText('ABCD')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open xAI sign-in' }));
  expect(open).toHaveBeenCalledWith('https://auth.x.ai/activate', '_blank', 'noopener,noreferrer');
  view.unmount();
  expect(api.cancelXaiLogin).toHaveBeenCalledWith({ sessionId: 'test-login' });
});

it('refreshes settings and closes only after a completed login', async () => {
  api.startXaiLogin.mockResolvedValue({ sessionId: 'test-login', status: 'connected' });
  api.cancelXaiLogin.mockResolvedValue({ cancelled: true });
  const onConnected = vi.fn();
  const closeModal = vi.fn();
  render(<XaiLoginDialog closeModal={closeModal} onConnected={onConnected} />);
  await waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
  expect(closeModal).toHaveBeenCalledOnce();
});

it('keeps the active login when the modal parent renders again', async () => {
  api.startXaiLogin.mockResolvedValue({
    sessionId: 'test-login',
    status: 'pending',
    userCode: 'ABCD',
    verificationUri: 'https://accounts.x.ai/device',
  });
  api.cancelXaiLogin.mockResolvedValue({ cancelled: true });
  const view = render(<XaiLoginDialog closeModal={() => {}} onConnected={() => {}} />);
  await screen.findByText('ABCD');
  view.rerender(<XaiLoginDialog closeModal={() => {}} onConnected={() => {}} />);
  expect(api.startXaiLogin).toHaveBeenCalledOnce();
  expect(api.cancelXaiLogin).not.toHaveBeenCalled();
});
