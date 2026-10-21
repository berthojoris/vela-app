import { create } from 'zustand';
import { FileDiff } from '../types';
import { tauriIpc } from '../lib/tauriIpc';
import { errorMessage } from '../lib/errors';
import { changeKey } from '../lib/gitStatus';
import { normalizePath, useWorktreeStore } from './useWorktreeStore';
import { invalidateChanges } from '../lib/worktreeChangesCache';

async function refreshSidebar(worktreePath: string): Promise<void> {
  invalidateChanges(worktreePath);
  const worktrees = useWorktreeStore.getState();
  if (worktrees.worktrees.some((item) => normalizePath(item.path) === normalizePath(worktreePath))) {
    await worktrees.refreshWorktrees(true, true);
  }
}

interface DiffState {
  isOpen: boolean;
  worktreePath: string | null;
  diffs: FileDiff[];
  selectedFile: FileDiff | null;
  isLoading: boolean;
  isCommitting: boolean;
  isRollingBack: boolean;
  rollingBackFile: string | null;
  error: string | null;
  commitError: string | null;
  rollbackError: string | null;
  commitMessage: string;
  commitResult: string | null;
  openDiffModal: (path: string) => Promise<void>;
  closeDiffModal: () => void;
  selectFile: (file: FileDiff) => void;
  setCommitMessage: (msg: string) => void;
  refreshDiffs: () => Promise<void>;
  commit: () => Promise<string>;
  rollbackFile: (filePath: string) => Promise<void>;
  resetAll: () => Promise<void>;
  clearCommitError: () => void;
  clearRollbackError: () => void;
  clearAllErrors: () => void;
}

let requestSequence = 0;

export const useDiffStore = create<DiffState>((set, get) => ({
  isOpen: false,
  worktreePath: null,
  diffs: [],
  selectedFile: null,
  isLoading: false,
  isCommitting: false,
  isRollingBack: false,
  rollingBackFile: null,
  error: null,
  commitError: null,
  rollbackError: null,
  commitMessage: '',
  commitResult: null,

  openDiffModal: async (path) => {
    // A commit or rollback is not cancellable: keep its target and message visible until it finishes.
    if (get().isCommitting || get().isRollingBack) return;
    ++requestSequence;
    set({
      isOpen: true,
      worktreePath: path,
      diffs: [],
      selectedFile: null,
      isLoading: false,
      isRollingBack: false,
      rollingBackFile: null,
      error: null,
      commitError: null,
      rollbackError: null,
      commitMessage: '',
      commitResult: null,
    });
    await get().refreshDiffs();
  },

  refreshDiffs: async () => {
    const { worktreePath, isOpen, isCommitting, isRollingBack } = get();
    if (!worktreePath || !isOpen || isCommitting || isRollingBack) return;
    const request = ++requestSequence;
    const current = () => request === requestSequence && get().isOpen && get().worktreePath === worktreePath;
    set({ isLoading: true, error: null });
    try {
      const files = await tauriIpc.getWorktreeDiff(worktreePath);
      if (!current()) return;
      const selected = get().selectedFile;
      set({
        diffs: files,
        selectedFile: files.find((file) => selected && changeKey(file) === changeKey(selected)) ?? files[0] ?? null,
        isLoading: false,
      });
    } catch (error) {
      if (current())
        set({
          isLoading: false,
          error: errorMessage(error, 'Unable to inspect changes. Check that the worktree still exists, then refresh.'),
        });
    }
  },

  closeDiffModal: () => {
    if (get().isCommitting || get().isRollingBack) return;
    ++requestSequence;
    set({
      isOpen: false,
      worktreePath: null,
      diffs: [],
      selectedFile: null,
      isLoading: false,
      isRollingBack: false,
      rollingBackFile: null,
      error: null,
      commitError: null,
      rollbackError: null,
      commitMessage: '',
      commitResult: null,
    });
  },
  selectFile: (file) => {
    const selected = get().diffs.find((candidate) => changeKey(candidate) === changeKey(file));
    if (selected) set({ selectedFile: selected });
  },
  setCommitMessage: (commitMessage) => {
    if (!get().isCommitting) set({ commitMessage, commitError: null });
  },
  clearCommitError: () => set({ commitError: null }),
  clearRollbackError: () => set({ rollbackError: null }),
  clearAllErrors: () => set({ error: null, commitError: null, rollbackError: null }),

  commit: async () => {
    const state = get();
    const worktreePath = state.worktreePath;
    const message = state.commitMessage.trim();
    if (state.isCommitting || state.isRollingBack) throw new Error('A Git operation is already running. Please wait.');
    if (!state.isOpen || !worktreePath || state.isLoading || state.error || !state.diffs.length) {
      throw new Error('Refresh and review the current worktree before committing.');
    }
    if (!message) throw new Error('Enter a commit message.');
    ++requestSequence; // Invalidate every earlier diff response before mutating Git.
    set({ isCommitting: true, commitError: null, commitResult: null });
    let result: string;
    try {
      result = await tauriIpc.commitWorktree(worktreePath, message);
    } catch (error) {
      const detail = errorMessage(error, 'Git could not create the commit. Your message has been preserved.');
      set({ isCommitting: false, commitError: detail });
      throw new Error(detail);
    }
    // Refresh failure must never turn an already successful commit into "commit failed".
    set({ isCommitting: false, commitMessage: '', commitResult: result });
    await Promise.all([get().refreshDiffs(), refreshSidebar(worktreePath)]);
    return result;
  },

  rollbackFile: async (filePath: string) => {
    const state = get();
    const worktreePath = state.worktreePath;
    if (state.isCommitting || state.isRollingBack) {
      throw new Error('Another Git operation is already in progress. Please wait.');
    }
    if (!state.isOpen || !worktreePath || state.isLoading) {
      throw new Error('Refresh and review the current worktree before rolling back.');
    }
    const entries = state.diffs.filter((file) => file.path === filePath);
    if (entries.length !== 1 || entries[0].rollback_error) {
      throw new Error(
        entries[0]?.rollback_error || 'This path has changed or is ambiguous. Refresh before rolling back.'
      );
    }
    ++requestSequence;
    set({ isRollingBack: true, rollingBackFile: filePath, rollbackError: null });
    try {
      await tauriIpc.rollbackWorktreeFile(worktreePath, filePath);
    } catch (error) {
      const detail = errorMessage(error, `Git could not rollback ${filePath}.`);
      set({ isRollingBack: false, rollingBackFile: null, rollbackError: detail });
      throw new Error(detail);
    }
    set({ isRollingBack: false, rollingBackFile: null });
    await Promise.all([get().refreshDiffs(), refreshSidebar(worktreePath)]);
  },

  resetAll: async () => {
    const state = get();
    const worktreePath = state.worktreePath;
    if (state.isCommitting || state.isRollingBack) {
      throw new Error('Another Git operation is already in progress. Please wait.');
    }
    if (!state.isOpen || !worktreePath || state.isLoading) {
      throw new Error('Refresh and review the current worktree before resetting.');
    }
    ++requestSequence;
    set({ isRollingBack: true, rollingBackFile: null, rollbackError: null });
    try {
      await tauriIpc.resetWorktree(worktreePath);
    } catch (error) {
      const detail = errorMessage(error, 'Git could not reset changes in this worktree.');
      set({ isRollingBack: false, rollbackError: detail });
      throw new Error(detail);
    }
    set({ isRollingBack: false });
    await Promise.all([get().refreshDiffs(), refreshSidebar(worktreePath)]);
  },
}));
