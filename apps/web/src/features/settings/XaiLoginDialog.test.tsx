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

it('replaces the failed browser attempt and offers manual entry without the stale code in its URL', async () => {
  api.startXaiLogin
    .mockResolvedValueOnce({
      sessionId: 'old-login',
      status: 'pending',
      userCode: 'OLD-CODE',
      verificationUri: 'https://accounts.x.ai/oauth2/device?user_code=OLD-CODE',
    })
    .mockResolvedValueOnce({
      sessionId: 'new-login',
      status: 'pending',
      userCode: 'NEW-CODE',
      verificationUri: 'https://accounts.x.ai/oauth2/device?user_code=NEW-CODE',
    });
  api.cancelXaiLogin.mockResolvedValue({ cancelled: true });
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const connected = vi.fn();
  render(
    <LocaleProvider>
      <XaiLoginDialog closeModal={() => {}} onConnected={connected} />
    </LocaleProvider>,
  );
  await screen.findByText('OLD-CODE');
  fireEvent.click(screen.getByRole('button', { name: 'Get a new code' }));
  await screen.findByText('NEW-CODE');
  expect(screen.queryByText('OLD-CODE')).toBeNull();
  expect(api.cancelXaiLogin).toHaveBeenCalledWith({ sessionId: 'old-login' });
  fireEvent.click(screen.getByRole('button', { name: 'Enter code manually' }));
  expect(open).toHaveBeenCalledWith(
    'https://accounts.x.ai/oauth2/device',
    '_blank',
    'noopener,noreferrer',
  );
  expect(connected).not.toHaveBeenCalled();
});

it('can retry after a device request fails', async () => {
  api.startXaiLogin.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({
    sessionId: 'retried-login',
    status: 'pending',
    userCode: 'RETRY-CODE',
    verificationUri: 'https://accounts.x.ai/oauth2/device?user_code=RETRY-CODE',
  });
  api.cancelXaiLogin.mockResolvedValue({ cancelled: true });
  render(
    <LocaleProvider>
      <XaiLoginDialog closeModal={() => {}} onConnected={() => {}} />
    </LocaleProvider>,
  );
  expect((await screen.findByRole('alert')).textContent).toContain('Network unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Get a new code' }));
  await screen.findByText('RETRY-CODE');
  expect(screen.queryByRole('alert')).toBeNull();
});
