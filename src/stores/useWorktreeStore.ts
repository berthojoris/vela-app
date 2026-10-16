import { create } from 'zustand';
import { GitWorktree } from '../types';
import { tauriIpc } from '../lib/tauriIpc';

interface WorktreeState {
  repoPath: string | null;
  worktrees: GitWorktree[];
  activeWorktreeId: string | null;
  isLoading: boolean;
  error: string | null;

  setRepoPath: (path: string) => Promise<void>;
  refreshWorktrees: () => Promise<void>;
  createWorktree: (branch: string, baseBranch?: string) => Promise<GitWorktree>;
  removeWorktree: (worktreePath: string, force?: boolean) => Promise<void>;
  selectWorktree: (id: string) => void;
}

export const useWorktreeStore = create<WorktreeState>((set, get) => ({
  repoPath: null,
  worktrees: [],
  activeWorktreeId: null,
  isLoading: false,
  error: null,

  setRepoPath: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      const root = await tauriIpc.findGitRepo(path);
      if (root) {
        set({ repoPath: root });
        const list = await tauriIpc.listWorktrees(root);
        set({
          worktrees: list,
          activeWorktreeId: list[0]?.id || null,
          isLoading: false,
        });
      } else {
        set({
          repoPath: null,
          worktrees: [],
          isLoading: false,
          error: 'Directory is not inside a Git repository',
        });
      }
    } catch (err: any) {
      set({
        isLoading: false,
        error: err.toString(),
      });
    }
  },

  refreshWorktrees: async () => {
    const { repoPath } = get();
    if (!repoPath) return;
    set({ isLoading: true });
    try {
      const list = await tauriIpc.listWorktrees(repoPath);
      set({ worktrees: list, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.toString() });
    }
  },

  createWorktree: async (branch: string, baseBranch?: string) => {
    const { repoPath } = get();
    if (!repoPath) throw new Error('No repository selected');
    set({ isLoading: true, error: null });
    try {
      const wt = await tauriIpc.createWorktree(repoPath, branch, baseBranch);
      const list = await tauriIpc.listWorktrees(repoPath);
      set({
        worktrees: list,
        activeWorktreeId: wt.id,
        isLoading: false,
      });
      return wt;
    } catch (err: any) {
      set({ isLoading: false, error: err.toString() });
      throw err;
    }
  },

  removeWorktree: async (worktreePath: string, force: boolean = false) => {
    const { repoPath } = get();
    if (!repoPath) return;
    set({ isLoading: true });
    try {
      await tauriIpc.removeWorktree(repoPath, worktreePath, force);
      const list = await tauriIpc.listWorktrees(repoPath);
      set({ worktrees: list, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.toString() });
    }
  },

  selectWorktree: (id: string) => {
    set({ activeWorktreeId: id });
  },
}));
