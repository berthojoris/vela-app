import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { worktree } from '../../test/helpers';
import { WorktreeSidebar } from './WorktreeSidebar';

const ipc = vi.hoisted(() => ({ listWorktrees: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
beforeEach(() => useWorktreeStore.setState(useWorktreeStore.getInitialState()));
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
