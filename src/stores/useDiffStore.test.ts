import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, file } from '../test/helpers';
import { FileDiff } from '../types';

const ipc = vi.hoisted(() => ({ getWorktreeDiff: vi.fn(), commitWorktree: vi.fn() }));
vi.mock('../lib/tauriIpc', () => ({ tauriIpc: ipc }));
import { useDiffStore as store } from './useDiffStore';

beforeEach(() => {
  store.setState(store.getInitialState());
  store.getState().closeDiffModal();
  ipc.getWorktreeDiff.mockReset();
  ipc.commitWorktree.mockReset();
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
});
