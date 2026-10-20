import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { deferred } from '../../test/helpers';
import { WorktreeChanges } from '../../types';
const ipc = vi.hoisted(() => ({ getWorktreeChanges: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
import { ChangedFilesPanel, describeStatus } from './ChangedFilesPanel';

beforeEach(() => {
  ipc.getWorktreeChanges.mockReset();
});
it('lists changed files with their directory and line counts', async () => {
  ipc.getWorktreeChanges.mockResolvedValue({
    total: 2,
    files: [
      { path: 'src/components/App.tsx', status: 'M', additions: 4, deletions: 2 },
      { path: 'notes.md', status: '??', additions: 0, deletions: 0 },
    ],
  });
  render(<ChangedFilesPanel worktreePath="C:/repo" branch="main" refreshKey={1} autoRefresh />);
  expect(await screen.findByText('App.tsx')).toBeTruthy();
  expect(screen.getByText('src/components')).toBeTruthy();
  expect(screen.getByText('notes.md')).toBeTruthy();
  // Header total and the file row both show the counts.
  expect(screen.getAllByText('+4')).toHaveLength(2);
  expect(screen.getAllByText('-2')).toHaveLength(2);
  expect(ipc.getWorktreeChanges).toHaveBeenCalledWith('C:/repo');
});
it('never shows a previous worktree result after switching worktrees', async () => {
  const stale = deferred<WorktreeChanges>();
  ipc.getWorktreeChanges.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ total: 0, files: [] });
  const { rerender } = render(<ChangedFilesPanel worktreePath="C:/a" branch="a" refreshKey={1} autoRefresh />);
  rerender(<ChangedFilesPanel worktreePath="C:/b" branch="b" refreshKey={1} autoRefresh />);
  expect(await screen.findByText(/working tree clean/)).toBeTruthy();
  await act(async () => {
    stale.resolve({ total: 1, files: [{ path: 'old.txt', status: 'M', additions: 1, deletions: 0 }] });
    await stale.promise;
  });
  expect(screen.queryByText('old.txt')).toBeNull();
});
it('does not read changes on mount or worktree switch while the auto check is OFF', async () => {
  ipc.getWorktreeChanges.mockResolvedValue({
    total: 1,
    files: [{ path: 'cached.txt', status: 'M', additions: 1, deletions: 0 }],
  });
  const { rerender } = render(
    <ChangedFilesPanel worktreePath="C:/off-a" branch="a" refreshKey={1} autoRefresh={false} />
  );
  expect(screen.getByText(/auto check is OFF/)).toBeTruthy();
  rerender(<ChangedFilesPanel worktreePath="C:/off-b" branch="b" refreshKey={1} autoRefresh={false} />);
  expect(ipc.getWorktreeChanges).not.toHaveBeenCalled();

  // A status-checked refresh (manual ↻ in the header) still reloads.
  rerender(<ChangedFilesPanel worktreePath="C:/off-b" branch="b" refreshKey={2} autoRefresh={false} />);
  expect(await screen.findByText('cached.txt')).toBeTruthy();
  expect(ipc.getWorktreeChanges).toHaveBeenCalledTimes(1);

  // Switching away and back shows the last result without running Git again.
  rerender(<ChangedFilesPanel worktreePath="C:/off-a" branch="a" refreshKey={2} autoRefresh={false} />);
  expect(screen.queryByText('cached.txt')).toBeNull();
  rerender(<ChangedFilesPanel worktreePath="C:/off-b" branch="b" refreshKey={2} autoRefresh={false} />);
  expect(screen.getByText('cached.txt')).toBeTruthy();
  expect(ipc.getWorktreeChanges).toHaveBeenCalledTimes(1);
});
it('maps porcelain status codes to single-letter badges', () => {
  expect(describeStatus('??').letter).toBe('U');
  expect(describeStatus('UU').letter).toBe('C');
  expect(describeStatus('AM').letter).toBe('A');
  expect(describeStatus('R').letter).toBe('R');
  expect(describeStatus(' D').letter).toBe('D');
  expect(describeStatus('MM').letter).toBe('M');
});
