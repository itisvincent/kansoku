// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let capabilities: { features?: Record<string, string> } = { features: { 'deep-dive': 'active' } };
const note = vi.fn();
const deepDiveStatus = vi.fn();
const deepDive = vi.fn();

vi.mock('@web/features/edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));
vi.mock('@web/lib/client', () => ({
  client: {
    symbols: {
      note: (...args: unknown[]) => note(...args),
      deepDiveStatus: (...args: unknown[]) => deepDiveStatus(...args),
      deepDive: (...args: unknown[]) => deepDive(...args),
    },
  },
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } =
  await import('@web/features/edition/licenseModalStore');
const { NoteTab } = await import('./NoteTab');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  capabilities = { features: { 'deep-dive': 'active' } };
  resetLicenseModalStoreForTests();
  note.mockReset();
  deepDiveStatus.mockReset();
  deepDive.mockReset();
});

describe('NoteTab deep-dive license gate', () => {
  it('opens the license modal instead of starting deep-dive when pro but unlicensed', async () => {
    capabilities = { features: { 'deep-dive': 'locked' } };
    const confirmSpy = vi.spyOn(window, 'confirm');
    note.mockResolvedValue({ markdown: null });
    deepDiveStatus.mockResolvedValue({ running: false });

    render(<NoteTab symbol="MRVL.US" />);
    const button = await screen.findByRole('button', { name: /跑一次深度分析/ });
    fireEvent.click(button);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deepDive).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('starts deep-dive normally when licensed', async () => {
    capabilities = { features: { 'deep-dive': 'active' } };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    note.mockResolvedValue({ markdown: null });
    deepDiveStatus.mockResolvedValue({ running: false });
    deepDive.mockResolvedValue({});

    render(<NoteTab symbol="MRVL.US" />);
    const button = await screen.findByRole('button', { name: /跑一次深度分析/ });
    fireEvent.click(button);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(deepDive).toHaveBeenCalledWith({ sym: 'MRVL.US' }));
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('hides the deep-dive button for a community build (pro:false) but keeps the note surface', async () => {
    capabilities = { features: { 'deep-dive': 'absent' } };
    note.mockResolvedValue({ markdown: null });
    deepDiveStatus.mockResolvedValue({ running: false });

    render(<NoteTab symbol="MRVL.US" />);

    expect(await screen.findByText(/还没有 MRVL.US 的研究笔记/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /深度分析/ })).toBeNull();
    expect(deepDive).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('hides the deep-dive button while capabilities are still loading (pro:null)', async () => {
    capabilities = { features: undefined };
    note.mockResolvedValue({ markdown: null });
    deepDiveStatus.mockResolvedValue({ running: false });

    render(<NoteTab symbol="MRVL.US" />);

    expect(await screen.findByText(/还没有 MRVL.US 的研究笔记/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /深度分析/ })).toBeNull();
  });
});

describe('NoteTab open-core deep dive', () => {
  function setupStart(result: unknown) {
    capabilities = { features: { 'deep-dive': 'active' } };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    note.mockResolvedValue({ markdown: null });
    deepDiveStatus.mockResolvedValue({ running: false });
    deepDive.mockResolvedValue(result);
    render(<NoteTab symbol="MU.US" />);
  }

  it('shows the running state once the core engine starts', async () => {
    setupStart({ started: true });
    fireEvent.click(await screen.findByRole('button', { name: /跑一次深度分析/ }));
    await waitFor(() => expect(deepDive).toHaveBeenCalledWith({ sym: 'MU.US' }));
    expect(await screen.findByRole('button', { name: /分析中/ })).toBeTruthy();
  });

  it('reports busy when a refusal comes back as a plain body', async () => {
    setupStart({ started: false, reason: 'busy' });
    fireEvent.click(await screen.findByRole('button', { name: /跑一次深度分析/ }));
    await waitFor(() => expect(deepDive).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /分析中/ })).toBeNull();
  });

  it('asks for a model when the engine is disabled', async () => {
    setupStart({ started: false, reason: 'disabled' });
    const button = await screen.findByRole('button', { name: /跑一次深度分析/ });
    fireEvent.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  });
});
