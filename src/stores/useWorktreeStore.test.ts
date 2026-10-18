import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, worktree } from '../test/helpers';
import { GitWorktree } from '../types';

const ipc = vi.hoisted(() => ({ findGitRepo: vi.fn(), listWorktrees: vi.fn(), createWorktree: vi.fn(), removeWorktree: vi.fn() }));
vi.mock('../lib/tauriIpc', () => ({ tauriIpc: ipc }));
import { useWorktreeStore as store } from './useWorktreeStore';

beforeEach(async () => {
  store.setState(store.getInitialState());
  await store.getState().initRepo();
  Object.values(ipc).forEach((mock) => mock.mockReset());
});

it('rejects a delayed repository sync after switching tabs', async () => {
  const old = deferred<string | null>();
  ipc.findGitRepo.mockReturnValueOnce(old.promise).mockResolvedValueOnce('C:/B');
  ipc.listWorktrees.mockResolvedValue([worktree('B')]);
  const pending = store.getState().syncWithSession({ cwd: 'C:/A' });
  await store.getState().syncWithSession({ cwd: 'C:/B' });
  old.resolve('C:/A');
  await pending;
  expect(store.getState().repoPath).toBe('C:/B');
});
it('does not overwrite another repository after a slow worktree creation', async () => {
  store.setState({ repoPath: 'C:/A', worktrees: [worktree('A')] });
  const old = deferred<GitWorktree>();
  ipc.createWorktree.mockReturnValue(old.promise);
  const pending = store.getState().createWorktree('task');
  ipc.findGitRepo.mockResolvedValue('C:/B');
  ipc.listWorktrees.mockResolvedValue([worktree('B')]);
  await store.getState().syncWithSession({ cwd: 'C:/B' });
  old.resolve(worktree('A-task'));
  await pending;
  expect(store.getState().repoPath).toBe('C:/B');
  expect(store.getState().worktrees.map((item) => item.id)).toEqual(['B']);
  expect(store.getState().isMutating).toBe(false);
});
it('keeps a created worktree when the list refresh fails', async () => {
  store.setState({ repoPath: 'C:/A', worktrees: [worktree('A')] });
  ipc.createWorktree.mockResolvedValue(worktree('task'));
  ipc.listWorktrees.mockRejectedValue('Refresh failed');
  await expect(store.getState().createWorktree('task')).resolves.toMatchObject({ id: 'task' });
  expect(store.getState().worktrees).toHaveLength(2);
  expect(store.getState().error).toContain('created');
});
it('coalesces background refreshes and handles null IPC rejections', async () => {
  store.setState({ repoPath: 'C:/A' });
  const pending = deferred<GitWorktree[]>();
  ipc.listWorktrees.mockReturnValue(pending.promise);
  const a = store.getState().refreshWorktrees(true);
  const b = store.getState().refreshWorktrees(true);
  expect(ipc.listWorktrees).toHaveBeenCalledTimes(1);
  pending.reject(null);
  await Promise.all([a, b]);
  expect(store.getState().isLoading).toBe(false);
  expect(store.getState().error).toContain('Unable to refresh');
});

describe('autoGitStatus setting and tab switching behavior', () => {
  it('defaults autoGitStatus to false (OFF)', () => {
    expect(store.getState().autoGitStatus).toBe(false);
  });

  it('toggles autoGitStatus and triggers refresh when enabled', async () => {
    store.setState({ repoPath: 'C:/A' });
    ipc.listWorktrees.mockResolvedValue([worktree('A')]);
    store.getState().toggleAutoGitStatus();
    expect(store.getState().autoGitStatus).toBe(true);
    expect(ipc.listWorktrees).toHaveBeenCalledWith('C:/A', true);

    ipc.listWorktrees.mockClear();
    store.getState().toggleAutoGitStatus();
    expect(store.getState().autoGitStatus).toBe(false);
    expect(ipc.listWorktrees).not.toHaveBeenCalled();
  });

  it('uses fast-path tab switching without calling listWorktrees when staying in the same worktree and autoGitStatus is OFF', async () => {
    store.setState({
      repoPath: 'C:/A',
      worktrees: [worktree('A', 'C:/A'), worktree('B', 'C:/A/worktree-b')],
      activeWorktreeId: 'A',
      autoGitStatus: false,
    });
    ipc.listWorktrees.mockClear();

    await store.getState().syncWithSession({ cwd: 'C:/A/worktree-b' });
    expect(store.getState().activeWorktreeId).toBe('B');
    expect(store.getState().activeSessionCwd).toBe('C:/A/worktree-b');
    expect(ipc.listWorktrees).not.toHaveBeenCalled();
    expect(ipc.findGitRepo).not.toHaveBeenCalled();
  });

  it('passes checkStatus: false to listWorktrees when loading a new repo with autoGitStatus OFF', async () => {
    store.setState({ repoPath: null, worktrees: [], autoGitStatus: false });
    ipc.findGitRepo.mockResolvedValue('C:/NewRepo');
    ipc.listWorktrees.mockResolvedValue([worktree('NewRepo', 'C:/NewRepo')]);

    await store.getState().syncWithSession({ cwd: 'C:/NewRepo' });
    expect(ipc.listWorktrees).toHaveBeenCalledWith('C:/NewRepo', false);
  });

  it('triggers background refresh on tab switch when autoGitStatus is ON', async () => {
    store.setState({
      repoPath: 'C:/A',
      worktrees: [worktree('A', 'C:/A'), worktree('B', 'C:/A/worktree-b')],
      activeWorktreeId: 'A',
      autoGitStatus: true,
    });
    ipc.listWorktrees.mockClear();
    ipc.listWorktrees.mockResolvedValue([worktree('A', 'C:/A'), worktree('B', 'C:/A/worktree-b')]);

    await store.getState().syncWithSession({ cwd: 'C:/A/worktree-b' });
    expect(store.getState().activeWorktreeId).toBe('B');
    expect(ipc.listWorktrees).toHaveBeenCalledWith('C:/A', true);
  });
});
