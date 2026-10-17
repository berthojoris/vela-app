import { create } from 'zustand';
import { GitWorktree } from '../types';
import { tauriIpc } from '../lib/tauriIpc';
import { errorMessage } from '../lib/errors';

export function normalizePath(path: string): string {
  let result = path.trim().replace(/\\/g, '/').replace(/^\/([a-z])\//i, (_, drive: string) => `${drive.toUpperCase()}:/`);
  if (result.length > 3) result = result.replace(/\/+$/, '');
  return result.toLowerCase();
}

interface WorktreeState {
  repoPath: string | null;
  worktrees: GitWorktree[];
  activeWorktreeId: string | null;
  activeSessionCwd: string | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  initRepo: () => Promise<void>;
  setRepoPath: (path: string) => Promise<void>;
  refreshWorktrees: (background?: boolean) => Promise<void>;
  syncWithSession: (session?: { cwd?: string; worktree_id?: string | null } | null) => Promise<void>;
  createWorktree: (branch: string, baseBranch?: string) => Promise<GitWorktree>;
  removeWorktree: (worktreePath: string, force?: boolean) => Promise<void>;
  selectWorktree: (id: string) => void;
  clearError: () => void;
}

let syncSequence = 0;
let refreshSequence = 0;
let pendingRefresh: { repo: string; promise: Promise<void> } | null = null;

try { localStorage.removeItem('vela_repo_path'); localStorage.removeItem('orca_repo_path'); } catch { /* Private browsing can disable storage. */ }

export const useWorktreeStore = create<WorktreeState>((set, get) => ({
  repoPath: null, worktrees: [], activeWorktreeId: null, activeSessionCwd: null,
  isLoading: false, isMutating: false, error: null,

  initRepo: async () => {
    ++syncSequence; ++refreshSequence; pendingRefresh = null;
    set({ repoPath: null, worktrees: [], activeWorktreeId: null, activeSessionCwd: null, isLoading: false, error: null });
  },
  setRepoPath: async (path) => { await get().syncWithSession({ cwd: path }); },

  syncWithSession: async (session) => {
    const request = ++syncSequence;
    ++refreshSequence;
    pendingRefresh = null;
    const cwd = session?.cwd?.trim() || null;
    if (!cwd) {
      set({ repoPath: null, worktrees: [], activeWorktreeId: null, activeSessionCwd: null, isLoading: false, error: null });
      return;
    }
    // Never leave the previous repository actionable while a new directory is being resolved.
    const previous = get();
    set({ repoPath: null, worktrees: [], activeWorktreeId: null, activeSessionCwd: cwd, isLoading: true, error: null });
    try {
      const root = await tauriIpc.findGitRepo(cwd);
      if (request !== syncSequence) return;
      if (!root) { set({ isLoading: false }); return; }
      const sameRepo = previous.worktrees.some((worktree) => normalizePath(worktree.path) === normalizePath(root));
      const list = sameRepo ? previous.worktrees : await tauriIpc.listWorktrees(root);
      if (request !== syncSequence) return;
      // Longest prefix wins for nested worktrees; findGitRepo above detects nested repositories too.
      const matched = [...list].sort((a, b) => b.path.length - a.path.length).find((worktree) => {
        const path = normalizePath(worktree.path);
        return normalizePath(cwd) === path || normalizePath(cwd).startsWith(`${path}/`);
      });
      set({ repoPath: sameRepo ? previous.repoPath || root : root, worktrees: list, activeWorktreeId: matched?.id ?? list[0]?.id ?? null, isLoading: false });
      if (sameRepo) void get().refreshWorktrees(true);
    } catch (error) {
      if (request === syncSequence) set({ isLoading: false, error: errorMessage(error, 'Unable to detect this repository. Check Git installation and directory permissions.') });
    }
  },

  refreshWorktrees: async (background = false) => {
    const { repoPath, isMutating } = get();
    if (!repoPath || isMutating) return;
    if (pendingRefresh?.repo === repoPath) return pendingRefresh.promise;
    const request = ++refreshSequence;
    if (!background) set({ isLoading: true });
    const operation = (async () => {
      try {
        const list = await tauriIpc.listWorktrees(repoPath);
        if (request !== refreshSequence || get().repoPath !== repoPath) return;
        const active = list.some((worktree) => worktree.id === get().activeWorktreeId) ? get().activeWorktreeId : list[0]?.id ?? null;
        set({ worktrees: list, activeWorktreeId: active, isLoading: false, error: null });
      } catch (error) {
        if (request === refreshSequence && get().repoPath === repoPath) set({ isLoading: false, error: errorMessage(error, 'Unable to refresh worktrees. Check directory access, then refresh again.') });
      }
    })();
    const record = { repo: repoPath, promise: operation };
    pendingRefresh = record;
    try { await operation; } finally { if (pendingRefresh === record) pendingRefresh = null; }
  },

  createWorktree: async (branch, baseBranch) => {
    const { repoPath, isMutating } = get();
    if (!repoPath) throw new Error('No repository selected. Open a terminal inside a Git repository.');
    if (isMutating) throw new Error('Another worktree operation is running. Please wait.');
    const context = syncSequence;
    ++refreshSequence; pendingRefresh = null;
    set({ isMutating: true, error: null });
    try {
      const worktree = await tauriIpc.createWorktree(repoPath, branch, baseBranch);
      // Creation succeeded; a failed list refresh is not a failed creation and must not invite duplicate creation.
      if (context === syncSequence && get().repoPath === repoPath) {
        set((state) => ({ worktrees: [...state.worktrees.filter((item) => item.id !== worktree.id), worktree], activeWorktreeId: worktree.id }));
        try {
          const list = await tauriIpc.listWorktrees(repoPath);
          if (context === syncSequence && get().repoPath === repoPath) set({ worktrees: list });
        } catch (error) {
          if (context === syncSequence) set({ error: `Worktree created, but refresh failed: ${errorMessage(error)}` });
        }
      }
      return worktree;
    } catch (error) {
      if (context === syncSequence) set({ error: errorMessage(error) });
      throw error;
    } finally { set({ isMutating: false }); }
  },

  removeWorktree: async (worktreePath, force = false) => {
    const { repoPath, isMutating } = get();
    if (!repoPath || isMutating) throw new Error('A repository must be selected and other worktree operations must finish first.');
    const context = syncSequence;
    ++refreshSequence; pendingRefresh = null;
    set({ isMutating: true, error: null });
    try {
      await tauriIpc.removeWorktree(repoPath, worktreePath, force);
      if (context === syncSequence && get().repoPath === repoPath) {
        const list = get().worktrees.filter((item) => normalizePath(item.path) !== normalizePath(worktreePath));
        set({ worktrees: list, activeWorktreeId: list.some((item) => item.id === get().activeWorktreeId) ? get().activeWorktreeId : list[0]?.id ?? null });
      }
    } catch (error) {
      if (context === syncSequence) set({ error: errorMessage(error) });
      throw error;
    } finally { set({ isMutating: false }); }
  },
  selectWorktree: (id) => { if (get().worktrees.some((worktree) => worktree.id === id)) set({ activeWorktreeId: id }); },
  clearError: () => set({ error: null }),
}));
