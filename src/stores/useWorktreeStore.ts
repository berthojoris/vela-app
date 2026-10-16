import { create } from 'zustand';
import { GitWorktree } from '../types';
import { tauriIpc } from '../lib/tauriIpc';

export function normalizePath(path: string): string {
  if (!path) return '';
  let p = path.trim().replace(/\\/g, '/');
  const msysMatch = p.match(/^\/([a-zA-Z])\/(.*)/);
  if (msysMatch) {
    p = `${msysMatch[1].toUpperCase()}:/${msysMatch[2]}`;
  }
  if (p.length > 3 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p.toLowerCase();
}

interface WorktreeState {
  repoPath: string | null;
  worktrees: GitWorktree[];
  activeWorktreeId: string | null;
  activeSessionCwd: string | null;
  isLoading: boolean;
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

// Ignore asynchronous results from sessions/repositories that are no longer active.
let sessionSyncRequest = 0;
let worktreeRefreshRequest = 0;

// Clean up any legacy repo paths from localStorage to ensure clean startup
try {
  localStorage.removeItem('vela_repo_path');
  localStorage.removeItem('orca_repo_path');
} catch {}

export const useWorktreeStore = create<WorktreeState>((set, get) => ({
  repoPath: null,
  worktrees: [],
  activeWorktreeId: null,
  activeSessionCwd: null,
  isLoading: false,
  error: null,

  initRepo: async () => {
    sessionSyncRequest += 1;
    worktreeRefreshRequest += 1;
    // Ensure clean startup state with no leftover history
    try {
      localStorage.removeItem('vela_repo_path');
      localStorage.removeItem('orca_repo_path');
    } catch {}

    set({
      repoPath: null,
      worktrees: [],
      activeWorktreeId: null,
      activeSessionCwd: null,
      isLoading: false,
      error: null,
    });
  },

  setRepoPath: async (path: string) => {
    const requestId = ++sessionSyncRequest;
    worktreeRefreshRequest += 1;
    const cleanPath = path.trim();
    if (!cleanPath) {
      set({ error: 'Please specify a directory path' });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const root = await tauriIpc.findGitRepo(cleanPath);
      if (requestId !== sessionSyncRequest) return;
      if (root) {
        const list = await tauriIpc.listWorktrees(root);
        if (requestId !== sessionSyncRequest) return;
        set({
          repoPath: root,
          worktrees: list,
          activeWorktreeId: list[0]?.id || null,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          isLoading: false,
          error: `Directory '${cleanPath}' is not inside a Git repository`,
        });
      }
    } catch (err: any) {
      if (requestId !== sessionSyncRequest) return;
      set({
        isLoading: false,
        error: err.toString(),
      });
    }
  },

  refreshWorktrees: async (background = false) => {
    const { repoPath } = get();
    if (!repoPath) return;
    const requestId = ++worktreeRefreshRequest;
    if (!background) {
      set({ isLoading: true });
    }
    const startTime = Date.now();
    try {
      const list = await tauriIpc.listWorktrees(repoPath);
      if (!background) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 300) {
          await new Promise((r) => setTimeout(r, 300 - elapsed));
        }
      }
      if (requestId !== worktreeRefreshRequest || get().repoPath !== repoPath) return;
      set((state) => {
        if (requestId !== worktreeRefreshRequest || state.repoPath !== repoPath) {
          return state;
        }
        const stillValid = list.some((w) => w.id === state.activeWorktreeId);
        const nextActiveId = stillValid ? state.activeWorktreeId : (list[0]?.id || null);

        const isUnchanged =
          state.activeWorktreeId === nextActiveId &&
          state.worktrees.length === list.length &&
          state.worktrees.every(
            (w, i) =>
              w.id === list[i].id &&
              w.path === list[i].path &&
              w.branch === list[i].branch &&
              w.dirty_files_count === list[i].dirty_files_count
          );

        if (isUnchanged && !state.isLoading) {
          return state;
        }

        return {
          worktrees: list,
          activeWorktreeId: nextActiveId,
          isLoading: false,
        };
      });
    } catch (err: any) {
      if (requestId !== worktreeRefreshRequest || get().repoPath !== repoPath) return;
      if (!background) {
        set({ isLoading: false, error: err.toString() });
      } else {
        set({ isLoading: false });
      }
    }
  },

  syncWithSession: async (session?: { cwd?: string; worktree_id?: string | null } | null) => {
    const requestId = ++sessionSyncRequest;
    if (!session) {
      worktreeRefreshRequest += 1;
      const {
        repoPath,
        worktrees,
        activeWorktreeId,
        activeSessionCwd,
        isLoading,
        error,
      } = get();
      if (
        repoPath !== null ||
        worktrees.length > 0 ||
        activeWorktreeId !== null ||
        activeSessionCwd !== null ||
        isLoading ||
        error !== null
      ) {
        set({
          repoPath: null,
          worktrees: [],
          activeWorktreeId: null,
          activeSessionCwd: null,
          isLoading: false,
          error: null,
        });
      }
      return;
    }

    const cwd = session.cwd?.trim() || '';
    const worktreeId = session.worktree_id;
    const { repoPath, worktrees, activeWorktreeId, activeSessionCwd } = get();

    // 1. If session has explicit worktree_id, find it in current worktrees
    if (worktreeId) {
      const matched = worktrees.find((w) => w.id === worktreeId);
      if (matched) {
        if (activeWorktreeId !== matched.id || activeSessionCwd !== cwd) {
          set({ activeWorktreeId: matched.id, activeSessionCwd: cwd });
          get().refreshWorktrees(true);
        }
        return;
      }
    }

    // 2. If cwd matches any worktree in the current repo:
    if (cwd) {
      const normCwd = normalizePath(cwd);
      const matched = worktrees.find((w) => {
        const normWPath = normalizePath(w.path);
        return normCwd === normWPath || normCwd.startsWith(normWPath + '/');
      });

      if (matched) {
        if (activeWorktreeId !== matched.id || activeSessionCwd !== cwd) {
          set({ activeWorktreeId: matched.id, activeSessionCwd: cwd });
          get().refreshWorktrees(true);
        }
        return;
      }
    }

    // 3. If cwd does not match current worktrees, check if cwd belongs to another git repository
    if (cwd) {
      try {
        const detectedRoot = await tauriIpc.findGitRepo(cwd);
        if (requestId !== sessionSyncRequest) return;
        if (detectedRoot) {
          const normDetected = normalizePath(detectedRoot);
          const normCurrentRepo = repoPath ? normalizePath(repoPath) : '';

          if (normDetected !== normCurrentRepo) {
            set({ isLoading: true });
            const list = await tauriIpc.listWorktrees(detectedRoot);
            if (requestId !== sessionSyncRequest) return;
            const normCwd = normalizePath(cwd);
            const matchedWt =
              list.find((w) => {
                const normW = normalizePath(w.path);
                return normCwd === normW || normCwd.startsWith(normW + '/');
              }) || list[0];

            set({
              repoPath: detectedRoot,
              worktrees: list,
              activeWorktreeId: matchedWt?.id || null,
              activeSessionCwd: cwd,
              isLoading: false,
              error: null,
            });
            return;
          } else {
            if (activeSessionCwd !== cwd) {
              set({ activeSessionCwd: cwd });
            }
            get().refreshWorktrees(true);
          }
        } else {
          if (requestId !== sessionSyncRequest) return;
          // cwd is not a git repository
          if (
            repoPath !== null ||
            worktrees.length > 0 ||
            activeWorktreeId !== null ||
            activeSessionCwd !== cwd
          ) {
            set({
              repoPath: null,
              worktrees: [],
              activeWorktreeId: null,
              activeSessionCwd: cwd,
              isLoading: false,
              error: null,
            });
          }
        }
      } catch (e) {
        if (requestId !== sessionSyncRequest) return;
        console.warn('Failed to sync session git repo:', e);
      }
    } else {
      if (
        repoPath !== null ||
        worktrees.length > 0 ||
        activeWorktreeId !== null ||
        activeSessionCwd !== null
      ) {
        set({
          repoPath: null,
          worktrees: [],
          activeWorktreeId: null,
          activeSessionCwd: null,
          isLoading: false,
          error: null,
        });
      }
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

  clearError: () => {
    set({ error: null });
  },
}));
