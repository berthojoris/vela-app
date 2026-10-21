import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, file, worktree } from '../test/helpers';
import { FileDiff } from '../types';

const ipc = vi.hoisted(() => ({
  getWorktreeDiff: vi.fn(),
  commitWorktree: vi.fn(),
  rollbackWorktreeFile: vi.fn(),
  resetWorktree: vi.fn(),
  listWorktrees: vi.fn(),
}));
vi.mock('../lib/tauriIpc', () => ({ tauriIpc: ipc }));
import { useDiffStore as store } from './useDiffStore';
import { useWorktreeStore } from './useWorktreeStore';
import { cacheChanges, getCachedChanges } from '../lib/worktreeChangesCache';

beforeEach(() => {
  store.setState(store.getInitialState());
  store.getState().closeDiffModal();
  ipc.getWorktreeDiff.mockReset();
  ipc.commitWorktree.mockReset();
  ipc.rollbackWorktreeFile.mockReset();
  ipc.resetWorktree.mockReset();
  ipc.listWorktrees.mockReset();
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
});

describe('diff target isolation', () => {
  it('ignores a slow response from a closed repository', async () => {
    const old = deferred<FileDiff[]>();
    ipc.getWorktreeDiff.mockReturnValueOnce(old.promise).mockResolvedValueOnce([file('B.ts')]);
    const request = store.getState().openDiffModal('C:/A');
    store.getState().closeDiffModal();
    await store.getState().openDiffModal('C:/B');
    old.resolve([file('A.ts')]);
    await request;
    expect(store.getState().worktreePath).toBe('C:/B');
    expect(store.getState().selectedFile?.path).toBe('B.ts');
  });
  it('ignores stale errors and late responses after close', async () => {
    const old = deferred<FileDiff[]>();
    ipc.getWorktreeDiff.mockReturnValueOnce(old.promise);
    const request = store.getState().openDiffModal('C:/A');
    store.getState().closeDiffModal();
    old.reject('old failure');
    await request;
    expect(store.getState().error).toBeNull();
    expect(store.getState().diffs).toEqual([]);
  });
  it('latest refresh wins even within the same repository', async () => {
    ipc.getWorktreeDiff.mockResolvedValueOnce([file('initial')]);
    await store.getState().openDiffModal('C:/A');
    const old = deferred<FileDiff[]>();
    ipc.getWorktreeDiff.mockReturnValueOnce(old.promise).mockResolvedValueOnce([file('latest')]);
    const pending = store.getState().refreshDiffs();
    await store.getState().refreshDiffs();
    old.resolve([file('stale')]);
    await pending;
    expect(store.getState().selectedFile?.path).toBe('latest');
  });
});

describe('commit lifecycle', () => {
  beforeEach(async () => {
    ipc.getWorktreeDiff.mockResolvedValue([file('A.ts')]);
    await store.getState().openDiffModal('C:/A');
    store.getState().setCommitMessage('fix: reviewed change');
  });
  it('rejects double commits and keeps the target fixed while committing', async () => {
    const pending = deferred<string>();
    ipc.commitWorktree.mockReturnValue(pending.promise);
    const commit = store.getState().commit();
    await expect(store.getState().commit()).rejects.toThrow('already running');
    store.getState().closeDiffModal();
    await store.getState().openDiffModal('C:/B');
    store.getState().setCommitMessage('incorrect target');
    expect(store.getState().worktreePath).toBe('C:/A');
    expect(store.getState().commitMessage).toBe('fix: reviewed change');
    pending.resolve('Created abc');
    await commit;
    expect(ipc.commitWorktree).toHaveBeenCalledTimes(1);
    expect(ipc.commitWorktree).toHaveBeenCalledWith('C:/A', 'fix: reviewed change');
  });
  it('does not call a successful commit a failure when refresh fails', async () => {
    ipc.commitWorktree.mockResolvedValue('Created abc');
    ipc.getWorktreeDiff.mockRejectedValueOnce('permission denied');
    await expect(store.getState().commit()).resolves.toBe('Created abc');
    expect(store.getState().commitError).toBeNull();
    expect(store.getState().commitResult).toBe('Created abc');
    expect(store.getState().error).toBe('permission denied');
    expect(store.getState().commitMessage).toBe('');
  });
  it('preserves the message and unlocks the form after commit failure', async () => {
    ipc.commitWorktree.mockRejectedValue('Git user identity is missing');
    await expect(store.getState().commit()).rejects.toThrow('Git user identity');
    expect(store.getState().isCommitting).toBe(false);
    expect(store.getState().commitMessage).toBe('fix: reviewed change');
  });
  it('refreshes worktree status after commit even with auto-check OFF', async () => {
    useWorktreeStore.setState({
      repoPath: 'C:/A',
      worktrees: [{ ...worktree('A'), dirty_files_count: 1 }],
      autoGitStatus: false,
    });
    const before = useWorktreeStore.getState().statusRevision;
    ipc.commitWorktree.mockResolvedValue('Created abc');
    ipc.listWorktrees.mockResolvedValue([worktree('A')]);
    await store.getState().commit();
    expect(ipc.listWorktrees).toHaveBeenCalledWith('C:/A', true);
    expect(useWorktreeStore.getState().statusRevision).toBe(before + 1);
    expect(useWorktreeStore.getState().worktrees[0].dirty_files_count).toBe(0);
  });
  it('does not report a successful commit as failed if sidebar refresh fails', async () => {
    useWorktreeStore.setState({ repoPath: 'C:/A', worktrees: [worktree('A')] });
    ipc.commitWorktree.mockResolvedValue('Created abc');
    ipc.listWorktrees.mockRejectedValue('status unavailable');
    await expect(store.getState().commit()).resolves.toBe('Created abc');
    expect(store.getState().commitError).toBeNull();
    expect(useWorktreeStore.getState().error).toContain('status unavailable');
  });
  it('invalidates the committed target cache even if the active repository changed', async () => {
    cacheChanges('C:/A', { total: 1, files: [file('A.ts')] });
    useWorktreeStore.setState({ repoPath: 'C:/B', worktrees: [worktree('B')] });
    ipc.commitWorktree.mockResolvedValue('Created abc');
    await store.getState().commit();
    expect(getCachedChanges('C:/A')).toBeUndefined();
    expect(ipc.listWorktrees).not.toHaveBeenCalled();
  });
});

it('selects duplicate paths by status and preserves that identity after refresh', async () => {
  const entries = [
    { ...file('a.txt'), status: 'D' },
    { ...file('a.txt'), status: '??' },
  ];
  ipc.getWorktreeDiff.mockResolvedValue(entries);
  await store.getState().openDiffModal('C:/A');
  store.getState().selectFile(entries[1]);
  expect(store.getState().selectedFile?.status).toBe('??');
  await store.getState().refreshDiffs();
  expect(store.getState().selectedFile?.status).toBe('??');
  await expect(store.getState().rollbackFile('a.txt')).rejects.toThrow('ambiguous');
  expect(ipc.rollbackWorktreeFile).not.toHaveBeenCalled();
});

describe('rollback and reset lifecycle', () => {
  beforeEach(async () => {
    ipc.getWorktreeDiff.mockResolvedValue([file('A.ts'), file('B.ts')]);
    await store.getState().openDiffModal('C:/A');
  });

  it('rolls back a single file and refreshes diffs', async () => {
    ipc.rollbackWorktreeFile.mockResolvedValue(undefined);
    ipc.getWorktreeDiff.mockResolvedValueOnce([file('B.ts')]);
    await store.getState().rollbackFile('A.ts');
    expect(ipc.rollbackWorktreeFile).toHaveBeenCalledWith('C:/A', 'A.ts');
    expect(store.getState().diffs.length).toBe(1);
    expect(store.getState().diffs[0].path).toBe('B.ts');
  });

  it('resets all changes and refreshes diffs', async () => {
    ipc.resetWorktree.mockResolvedValue(undefined);
    ipc.getWorktreeDiff.mockResolvedValueOnce([]);
    await store.getState().resetAll();
    expect(ipc.resetWorktree).toHaveBeenCalledWith('C:/A');
    expect(store.getState().diffs).toEqual([]);
    expect(store.getState().selectedFile).toBeNull();
  });

  it('rejects concurrent rollback operations', async () => {
    const pending = deferred<void>();
    ipc.rollbackWorktreeFile.mockReturnValue(pending.promise);
    const rollback = store.getState().rollbackFile('A.ts');
    await expect(store.getState().rollbackFile('B.ts')).rejects.toThrow('already in progress');
    await expect(store.getState().resetAll()).rejects.toThrow('already in progress');
    pending.resolve();
    await rollback;
  });

  it('sets rollbackError on rollback failure', async () => {
    ipc.rollbackWorktreeFile.mockRejectedValue('file locked by process');
    await expect(store.getState().rollbackFile('A.ts')).rejects.toThrow('file locked by process');
    expect(store.getState().isRollingBack).toBe(false);
    expect(store.getState().rollbackError).toContain('file locked by process');
  });
});
