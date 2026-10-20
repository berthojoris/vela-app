import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, worktree } from '../test/helpers';
import { GitWorktree } from '../types';

const ipc = vi.hoisted(() => ({
  findGitRepo: vi.fn(),
  listWorktrees: vi.fn(),
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));
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

  it('clears isLoading when a fast-path tab switch supersedes a slow repository sync', async () => {
    store.setState({
      repoPath: 'C:/A',
      worktrees: [worktree('A', 'C:/A')],
      activeWorktreeId: 'A',
      autoGitStatus: false,
    });
    const stale = deferred<string | null>();
    ipc.findGitRepo.mockReturnValueOnce(stale.promise);
    const pending = store.getState().syncWithSession({ cwd: 'C:/B' });
    // With autoGitStatus OFF the slow sync resolves quietly and never flashes the spinner.
    expect(store.getState().isLoading).toBe(false);

    await store.getState().syncWithSession({ cwd: 'C:/A' });
    expect(store.getState().activeWorktreeId).toBe('A');
    expect(store.getState().isLoading).toBe(false);

    stale.resolve('C:/B');
    await pending;
    expect(store.getState().repoPath).toBe('C:/A');
    expect(store.getState().worktrees.map((item) => item.id)).toEqual(['A']);
    expect(ipc.listWorktrees).not.toHaveBeenCalled();
  });

  it('revisits a known repository without any Git IPC or spinner even when autoGitStatus is OFF', async () => {
    store.setState({ repoPath: null, worktrees: [], autoGitStatus: false });
    ipc.findGitRepo.mockResolvedValueOnce('C:/RepoA').mockResolvedValueOnce('C:/RepoB');
    ipc.listWorktrees
      .mockResolvedValueOnce([worktree('A', 'C:/RepoA')])
      .mockResolvedValueOnce([worktree('B', 'C:/RepoB')]);

    await store.getState().syncWithSession({ cwd: 'C:/RepoA' });
    await store.getState().syncWithSession({ cwd: 'C:/RepoB' });
    expect(store.getState().repoPath).toBe('C:/RepoB');

    ipc.findGitRepo.mockClear();
    ipc.listWorktrees.mockClear();
    await store.getState().syncWithSession({ cwd: 'C:/RepoA' });
    expect(ipc.findGitRepo).not.toHaveBeenCalled();
    expect(ipc.listWorktrees).not.toHaveBeenCalled();
    expect(store.getState().isLoading).toBe(false);
    expect(store.getState().repoPath).toBe('C:/RepoA');
    expect(store.getState().activeWorktreeId).toBe('A');

    await store.getState().syncWithSession({ cwd: 'C:/RepoB' });
    expect(ipc.findGitRepo).not.toHaveBeenCalled();
    expect(ipc.listWorktrees).not.toHaveBeenCalled();
    expect(store.getState().repoPath).toBe('C:/RepoB');
    expect(store.getState().activeWorktreeId).toBe('B');
  });

  it('never flashes the spinner while resolving an unknown directory with autoGitStatus OFF', async () => {
    store.setState({ repoPath: null, worktrees: [], autoGitStatus: false });
    const gate = deferred<string | null>();
    ipc.findGitRepo.mockReturnValueOnce(gate.promise);
    ipc.listWorktrees.mockResolvedValue([worktree('Late', 'C:/Late')]);

    const pending = store.getState().syncWithSession({ cwd: 'C:/Late' });
    expect(store.getState().isLoading).toBe(false);
    gate.resolve('C:/Late');
    await pending;
    expect(store.getState().repoPath).toBe('C:/Late');
    expect(store.getState().isLoading).toBe(false);
  });

  it('applies a cached repository instantly and background-refreshes it when autoGitStatus is ON', async () => {
    store.setState({ repoPath: null, worktrees: [], autoGitStatus: true });
    ipc.findGitRepo.mockResolvedValueOnce('C:/RepoC');
    ipc.listWorktrees.mockResolvedValueOnce([worktree('C', 'C:/RepoC')]);
    await store.getState().syncWithSession({ cwd: 'C:/RepoC' });

    ipc.findGitRepo.mockResolvedValueOnce(null);
    await store.getState().syncWithSession({ cwd: 'C:/plain' });
    expect(store.getState().repoPath).toBe(null);

    ipc.findGitRepo.mockClear();
    ipc.listWorktrees.mockClear();
    ipc.listWorktrees.mockResolvedValue([worktree('C', 'C:/RepoC')]);
    await store.getState().syncWithSession({ cwd: 'C:/RepoC' });
    expect(ipc.findGitRepo).not.toHaveBeenCalled();
    expect(ipc.listWorktrees).toHaveBeenCalledWith('C:/RepoC', true);
    expect(store.getState().repoPath).toBe('C:/RepoC');
    expect(store.getState().activeWorktreeId).toBe('C');
  });

  it('keeps app-side worktree mutations visible in later cross-repo tab switches', async () => {
    store.setState({
      repoPath: 'C:/RepoA',
      worktrees: [worktree('A', 'C:/RepoA')],
      activeWorktreeId: 'A',
      autoGitStatus: false,
    });
    ipc.createWorktree.mockResolvedValue(worktree('task', 'C:/RepoA/task'));
    ipc.listWorktrees.mockResolvedValue([worktree('A', 'C:/RepoA'), worktree('task', 'C:/RepoA/task')]);
    await store.getState().createWorktree('task');

    ipc.findGitRepo.mockResolvedValueOnce('C:/RepoB');
    ipc.listWorktrees.mockResolvedValueOnce([worktree('B', 'C:/RepoB')]);
    await store.getState().syncWithSession({ cwd: 'C:/RepoB' });

    ipc.findGitRepo.mockClear();
    ipc.findGitRepo.mockResolvedValue('C:/RepoA');
    ipc.listWorktrees.mockClear();
    await store.getState().syncWithSession({ cwd: 'C:/RepoA/task' });
    expect(ipc.listWorktrees).not.toHaveBeenCalled();
    expect(store.getState().repoPath).toBe('C:/RepoA');
    expect(store.getState().worktrees.map((item) => item.id)).toContain('task');
    expect(store.getState().activeWorktreeId).toBe('task');
  });
});

it('advances statusRevision only for refreshes that actually check Git status', async () => {
  store.setState({ repoPath: 'C:/A', worktrees: [worktree('A', 'C:/A')], autoGitStatus: false });
  ipc.listWorktrees.mockResolvedValue([worktree('A', 'C:/A')]);
  const before = store.getState().statusRevision;

  await store.getState().refreshWorktrees(true);
  expect(ipc.listWorktrees).toHaveBeenLastCalledWith('C:/A', false);
  expect(store.getState().statusRevision).toBe(before);

  await store.getState().refreshWorktrees(false, true);
  expect(ipc.listWorktrees).toHaveBeenLastCalledWith('C:/A', true);
  expect(store.getState().statusRevision).toBe(before + 1);
});
