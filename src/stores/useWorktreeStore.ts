import { create } from 'zustand';
import { GitWorktree } from '../types';
import { tauriIpc } from '../lib/tauriIpc';
import { errorMessage } from '../lib/errors';

export function normalizePath(path: string): string {
  let result = path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/([a-z])\//i, (_, drive: string) => `${drive.toUpperCase()}:/`);
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
  autoGitStatus: boolean;
  /** Advances only after a refresh that actually checked Git status (manual, forced, or auto ON). */
  statusRevision: number;
  initRepo: () => Promise<void>;
  setRepoPath: (path: string) => Promise<void>;
  setAutoGitStatus: (enabled: boolean) => void;
  toggleAutoGitStatus: () => void;
  refreshWorktrees: (background?: boolean, forceStatus?: boolean) => Promise<void>;
  syncWithSession: (session?: { cwd?: string; worktree_id?: string | null } | null) => Promise<void>;
  createWorktree: (branch: string, baseBranch?: string) => Promise<GitWorktree>;
  removeWorktree: (worktreePath: string, force?: boolean) => Promise<void>;
  selectWorktree: (id: string) => void;
  clearError: () => void;
}

let syncSequence = 0;
let refreshSequence = 0;
let pendingRefresh: { repo: string; promise: Promise<void> } | null = null;

// Remembers repository detection and worktree listings per directory so switching tabs
// back to a visited directory applies the panel instantly: no spinner, no Git IPC.
const repoRootCache = new Map<string, string>();
const worktreeListCache = new Map<string, GitWorktree[]>();

function cacheWorktreeList(repoPath: string, list: GitWorktree[]): void {
  if (worktreeListCache.size > 32) worktreeListCache.clear();
  worktreeListCache.set(normalizePath(repoPath), list);
}

function loadAutoGitStatus(): boolean {
  try {
    return localStorage.getItem('vela_auto_git_status') === 'true';
  } catch {
    return false;
  }
}

function saveAutoGitStatus(enabled: boolean): void {
  try {
    localStorage.setItem('vela_auto_git_status', String(enabled));
  } catch {}
}

try {
  localStorage.removeItem('vela_repo_path');
  localStorage.removeItem('orca_repo_path');
} catch {
  /* Private browsing can disable storage. */
}

export const useWorktreeStore = create<WorktreeState>((set, get) => ({
  repoPath: null,
  worktrees: [],
  activeWorktreeId: null,
  activeSessionCwd: null,
  isLoading: false,
  isMutating: false,
  error: null,
  autoGitStatus: loadAutoGitStatus(),
  statusRevision: 0,

  setAutoGitStatus: (enabled) => {
    saveAutoGitStatus(enabled);
    set({ autoGitStatus: enabled });
    if (enabled) {
      void get().refreshWorktrees(true, true);
    }
  },

  toggleAutoGitStatus: () => {
    const next = !get().autoGitStatus;
    saveAutoGitStatus(next);
    set({ autoGitStatus: next });
    if (next) {
      void get().refreshWorktrees(true, true);
    }
  },

  initRepo: async () => {
    ++syncSequence;
    ++refreshSequence;
    pendingRefresh = null;
    repoRootCache.clear();
    worktreeListCache.clear();
    set({
      repoPath: null,
      worktrees: [],
      activeWorktreeId: null,
      activeSessionCwd: null,
      isLoading: false,
      error: null,
    });
  },
  setRepoPath: async (path) => {
    await get().syncWithSession({ cwd: path });
  },

  syncWithSession: async (session) => {
    const request = ++syncSequence;
    ++refreshSequence;
    pendingRefresh = null;
    const cwd = session?.cwd?.trim() || null;
    if (!cwd) {
      set({
        repoPath: null,
        worktrees: [],
        activeWorktreeId: null,
        activeSessionCwd: null,
        isLoading: false,
        error: null,
      });
      return;
    }
    const previous = get();
    const normCwd = normalizePath(cwd);

    // Fast path: if the cwd is already within the active repository/worktrees, do not flash or reload!
    if (previous.repoPath && previous.worktrees.length > 0) {
      const matched = [...previous.worktrees]
        .sort((a, b) => b.path.length - a.path.length)
        .find((worktree) => {
          const path = normalizePath(worktree.path);
          return normCwd === path || normCwd.startsWith(`${path}/`);
        });
      if (matched) {
        // Clearing isLoading matters when this fast path supersedes an in-flight slow repo sync:
        // the stale sync bails on its sequence guard and would otherwise leave the spinner stuck.
        set({ activeSessionCwd: cwd, activeWorktreeId: matched.id, isLoading: false });
        if (previous.autoGitStatus) {
          void get().refreshWorktrees(true);
        }
        return;
      }
    }

    // Cached results let the panel swap instantly; with autoGitStatus OFF the sync
    // never flashes the spinner, it just resolves quietly.
    const knownRoot = repoRootCache.get(normCwd);
    const knownList = knownRoot ? worktreeListCache.get(normalizePath(knownRoot)) : undefined;
    const instant =
      !!knownRoot &&
      (previous.worktrees.some((worktree) => normalizePath(worktree.path) === normalizePath(knownRoot)) || !!knownList);
    set({ activeSessionCwd: cwd, isLoading: !instant && get().autoGitStatus, error: null });
    try {
      const root = knownRoot ?? (await tauriIpc.findGitRepo(cwd));
      if (root) {
        if (repoRootCache.size > 64) repoRootCache.clear();
        repoRootCache.set(normCwd, root);
      }
      if (request !== syncSequence) return;
      if (!root) {
        set({ repoPath: null, worktrees: [], activeWorktreeId: null, isLoading: false });
        return;
      }
      const sameRepo = previous.worktrees.some((worktree) => normalizePath(worktree.path) === normalizePath(root));
      let list = sameRepo ? previous.worktrees : worktreeListCache.get(normalizePath(root));
      let fetched = false;
      if (!list) {
        list = await tauriIpc.listWorktrees(root, get().autoGitStatus);
        cacheWorktreeList(root, list);
        fetched = true;
      }
      if (request !== syncSequence) return;
      // Longest prefix wins for nested worktrees; findGitRepo above detects nested repositories too.
      const matched = [...list]
        .sort((a, b) => b.path.length - a.path.length)
        .find((worktree) => {
          const path = normalizePath(worktree.path);
          return normCwd === path || normCwd.startsWith(`${path}/`);
        });
      set({
        repoPath: sameRepo ? previous.repoPath || root : root,
        worktrees: list,
        activeWorktreeId: matched?.id ?? list[0]?.id ?? null,
        isLoading: false,
      });
      // When the list came from cache or memory, freshen it in the background so the toggle's ON behavior is unchanged.
      if (get().autoGitStatus && !fetched) {
        void get().refreshWorktrees(true);
      }
    } catch (error) {
      // Detection or listing failed: forget the cached root so the next switch re-checks Git.
      repoRootCache.delete(normCwd);
      if (request === syncSequence) {
        set({
          isLoading: false,
          error: errorMessage(
            error,
            'Unable to detect this repository. Check Git installation and directory permissions.'
          ),
        });
      }
    }
  },

  refreshWorktrees: async (background = false, forceStatus = false) => {
    const { repoPath, isMutating, autoGitStatus } = get();
    if (!repoPath || isMutating) return;
    if (pendingRefresh?.repo === repoPath) return pendingRefresh.promise;
    const request = ++refreshSequence;
    if (!background) set({ isLoading: true });
    const shouldCheckStatus = forceStatus || autoGitStatus || !background;
    const operation = (async () => {
      try {
        const list = await tauriIpc.listWorktrees(repoPath, shouldCheckStatus);
        if (request !== refreshSequence || get().repoPath !== repoPath) return;
        const active = list.some((worktree) => worktree.id === get().activeWorktreeId)
          ? get().activeWorktreeId
          : (list[0]?.id ?? null);
        cacheWorktreeList(repoPath, list);
        set({
          worktrees: list,
          activeWorktreeId: active,
          isLoading: false,
          error: null,
          ...(shouldCheckStatus ? { statusRevision: get().statusRevision + 1 } : {}),
        });
      } catch (error) {
        if (request === refreshSequence && get().repoPath === repoPath) {
          set({
            isLoading: false,
            error: errorMessage(error, 'Unable to refresh worktrees. Check directory access, then refresh again.'),
          });
        }
      }
    })();
    const record = { repo: repoPath, promise: operation };
    pendingRefresh = record;
    try {
      await operation;
    } finally {
      if (pendingRefresh === record) pendingRefresh = null;
    }
  },

  createWorktree: async (branch, baseBranch) => {
    const { repoPath, isMutating } = get();
    if (!repoPath) throw new Error('No repository selected. Open a terminal inside a Git repository.');
    if (isMutating) throw new Error('Another worktree operation is running. Please wait.');
    const context = syncSequence;
    ++refreshSequence;
    pendingRefresh = null;
    set({ isMutating: true, error: null });
    try {
      const worktree = await tauriIpc.createWorktree(repoPath, branch, baseBranch);
      // Creation succeeded; a failed list refresh is not a failed creation and must not invite duplicate creation.
      if (context === syncSequence && get().repoPath === repoPath) {
        const merged = [...get().worktrees.filter((item) => item.id !== worktree.id), worktree];
        cacheWorktreeList(repoPath, merged);
        set({ worktrees: merged, activeWorktreeId: worktree.id });
        try {
          const list = await tauriIpc.listWorktrees(repoPath);
          if (context === syncSequence && get().repoPath === repoPath) {
            cacheWorktreeList(repoPath, list);
            set({ worktrees: list });
          }
        } catch (error) {
          if (context === syncSequence) set({ error: `Worktree created, but refresh failed: ${errorMessage(error)}` });
        }
      }
      return worktree;
    } catch (error) {
      if (context === syncSequence) set({ error: errorMessage(error) });
      throw error;
    } finally {
      set({ isMutating: false });
    }
  },

  removeWorktree: async (worktreePath, force = false) => {
    const { repoPath, isMutating } = get();
    if (!repoPath || isMutating)
      throw new Error('A repository must be selected and other worktree operations must finish first.');
    const context = syncSequence;
    ++refreshSequence;
    pendingRefresh = null;
    set({ isMutating: true, error: null });
    try {
      await tauriIpc.removeWorktree(repoPath, worktreePath, force);
      if (context === syncSequence && get().repoPath === repoPath) {
        const list = get().worktrees.filter((item) => normalizePath(item.path) !== normalizePath(worktreePath));
        cacheWorktreeList(repoPath, list);
        set({
          worktrees: list,
          activeWorktreeId: list.some((item) => item.id === get().activeWorktreeId)
            ? get().activeWorktreeId
            : (list[0]?.id ?? null),
        });
      }
    } catch (error) {
      if (context === syncSequence) set({ error: errorMessage(error) });
      throw error;
    } finally {
      set({ isMutating: false });
    }
  },
  selectWorktree: (id) => {
    if (get().worktrees.some((worktree) => worktree.id === id)) set({ activeWorktreeId: id });
  },
  clearError: () => set({ error: null }),
}));
