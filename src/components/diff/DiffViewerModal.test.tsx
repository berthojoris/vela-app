import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { deferred, file } from '../../test/helpers';
import { useDiffStore } from '../../stores/useDiffStore';
import { DiffViewerModal } from './DiffViewerModal';

const ipc = vi.hoisted(() => ({
  getWorktreeDiff: vi.fn(),
  resetWorktree: vi.fn(),
  rollbackWorktreeFile: vi.fn(),
}));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));

beforeEach(() => {
  Object.values(ipc).forEach((mock) => mock.mockReset());
  const changed = file('a.txt');
  useDiffStore.setState({
    ...useDiffStore.getInitialState(),
    isOpen: true,
    worktreePath: 'C:/diff-test',
    diffs: [changed],
    selectedFile: changed,
  });
  ipc.getWorktreeDiff.mockResolvedValue([]);
});

it('starts on the review heading rather than a destructive action', async () => {
  render(<DiffViewerModal />);
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Visual Diff & Review' }))
  );
});

it.each(['Reset All', 'Rollback'])('Escape closes only the %s confirmation first', async (action) => {
  render(<DiffViewerModal />);
  fireEvent.click(screen.getByRole('button', { name: action }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Batal' })));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(useDiffStore.getState().isOpen).toBe(true);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(useDiffStore.getState().isOpen).toBe(false);
});

it('does not dismiss a confirmation or its parent while resetting', async () => {
  const pending = deferred<void>();
  ipc.resetWorktree.mockReturnValue(pending.promise);
  render(<DiffViewerModal />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset All' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset Semua Perubahan' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(useDiffStore.getState().isOpen).toBe(true);
  await act(async () => {
    pending.resolve();
    await pending.promise;
  });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('distinguishes duplicate paths and disables ambiguous rollback', () => {
  const entries = [
    { ...file('a.txt'), status: 'D', diff_content: '-original', rollback_error: 'Ambiguous path' },
    { ...file('a.txt'), status: '??', diff_content: '+local', rollback_error: 'Ambiguous path' },
  ];
  useDiffStore.setState({ diffs: entries, selectedFile: entries[0] });
  render(<DiffViewerModal />);
  fireEvent.click(screen.getByTitle('Status: ??'));
  expect(useDiffStore.getState().selectedFile?.status).toBe('??');
  expect(screen.getByText('+local').closest('.select-text')).toBeTruthy();
  expect(screen.getAllByTitle('Ambiguous path').every((element) => (element as HTMLButtonElement).disabled)).toBe(true);
});

it('preserves addition and rename status when combined with modification', () => {
  useDiffStore.setState({
    diffs: [
      { ...file('added.txt'), status: 'AM' },
      { ...file('renamed.txt'), status: 'RM' },
    ],
  });
  render(<DiffViewerModal />);
  expect(screen.getByTitle('Status: AM').textContent).toBe('ADD');
  expect(screen.getByTitle('Status: RM').textContent).toBe('REN');
});
