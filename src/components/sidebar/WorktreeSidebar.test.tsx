import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { worktree } from '../../test/helpers';
import { WorktreeSidebar } from './WorktreeSidebar';
import { useTerminalStore } from '../../stores/useTerminalStore';

const ipc = vi.hoisted(() => ({ listWorktrees: vi.fn(), listDirectory: vi.fn(), selectDirectory: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
beforeEach(() => {
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useTerminalStore.setState(useTerminalStore.getInitialState());
  ipc.listDirectory
    .mockReset()
    .mockResolvedValue({ entries: [{ name: 'README.md', path: 'README.md', is_dir: false }], truncated: false });
  ipc.selectDirectory.mockReset();
});
it('shows status errors without hiding worktrees and retries on manual refresh', async () => {
  useWorktreeStore.setState({
    repoPath: 'C:/A',
    worktrees: [
      { ...worktree('A'), dirty_files_count: null, status_error: 'broken gitfile' },
      { ...worktree('B'), dirty_files_count: null },
    ],
  });
  ipc.listWorktrees.mockResolvedValue([worktree('A'), worktree('B')]);
  render(<WorktreeSidebar onOpenCreateModal={() => {}} />);
  expect(screen.getByTitle('broken gitfile').textContent).toBe('status unavailable');
  expect(screen.getByText('not checked')).toBeTruthy();
  expect(screen.queryByText('clean')).toBeNull();
  fireEvent.click(screen.getByTitle('Refresh Worktrees (Manual Check)'));
  await waitFor(() => expect(screen.getAllByText('clean')).toHaveLength(2));
});

it('places Open Files above Open Dir and switches back to Git without altering selection', async () => {
  useWorktreeStore.setState({
    activeSessionCwd: 'C:/A',
    repoPath: 'C:/A',
    worktrees: [worktree('A')],
    activeWorktreeId: null,
  });
  render(<WorktreeSidebar onOpenCreateModal={() => {}} />);
  const openFiles = screen.getByRole('button', { name: 'Open Files' });
  const openDir = screen.getByRole('button', { name: 'Open Dir' });
  expect(openFiles.compareDocumentPosition(openDir) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(ipc.listDirectory).not.toHaveBeenCalled();
  fireEvent.click(openFiles);
  await screen.findByRole('treeitem', { name: 'README.md' });
  expect(ipc.listDirectory).toHaveBeenCalledWith('C:/A', '');
  fireEvent.click(screen.getByRole('button', { name: 'Git' }));
  expect(screen.getByRole('button', { name: 'Git' }).getAttribute('aria-pressed')).toBe('true');
  expect(useWorktreeStore.getState().repoPath).toBe('C:/A');
});

it('can choose a folder without an active terminal and leaves Git mode unchanged on cancel', async () => {
  ipc.selectDirectory.mockResolvedValueOnce(null).mockResolvedValueOnce('C:/chosen');
  render(<WorktreeSidebar onOpenCreateModal={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Files' }));
  await waitFor(() => expect(ipc.selectDirectory).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Git' }).getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open Files' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Open Files' }));
  await screen.findByRole('treeitem', { name: 'README.md' });
  expect(ipc.listDirectory).toHaveBeenCalledWith('C:/chosen', '');
});
