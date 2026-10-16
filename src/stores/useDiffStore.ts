import { create } from 'zustand';
import { FileDiff } from '../types';
import { tauriIpc } from '../lib/tauriIpc';

interface DiffState {
  isOpen: boolean;
  worktreePath: string | null;
  diffs: FileDiff[];
  selectedFile: FileDiff | null;
  isLoading: boolean;
  isCommitting: boolean;
  error: string | null;
  commitError: string | null;
  commitMessage: string;

  openDiffModal: (path: string) => Promise<void>;
  closeDiffModal: () => void;
  selectFile: (file: FileDiff) => void;
  setCommitMessage: (msg: string) => void;
  refreshDiffs: () => Promise<void>;
  commit: () => Promise<string>;
  clearCommitError: () => void;
  clearAllErrors: () => void;
}

export const useDiffStore = create<DiffState>((set, get) => ({
  isOpen: false,
  worktreePath: null,
  diffs: [],
  selectedFile: null,
  isLoading: false,
  isCommitting: false,
  error: null,
  commitError: null,
  commitMessage: '',

  openDiffModal: async (path: string) => {
    set({
      isOpen: true,
      worktreePath: path,
      isLoading: true,
      error: null,
      commitError: null,
      diffs: [],
      selectedFile: null,
    });

    try {
      const files = await tauriIpc.getWorktreeDiff(path);
      set({
        diffs: files,
        selectedFile: files.length > 0 ? files[0] : null,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : err?.message || 'Failed to inspect worktree changes.';
      console.error('Failed to load diffs:', errMsg);
      set({
        isLoading: false,
        error: errMsg,
        diffs: [],
        selectedFile: null,
      });
    }
  },

  refreshDiffs: async () => {
    const { worktreePath, selectedFile } = get();
    if (!worktreePath) return;

    set({ isLoading: true, error: null });
    try {
      const files = await tauriIpc.getWorktreeDiff(worktreePath);
      const stillSelected = selectedFile
        ? files.find((f) => f.path === selectedFile.path)
        : null;

      set({
        diffs: files,
        selectedFile: stillSelected || (files.length > 0 ? files[0] : null),
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : err?.message || 'Failed to refresh diffs.';
      console.error('Failed to refresh diffs:', errMsg);
      set({
        isLoading: false,
        error: errMsg,
      });
    }
  },

  closeDiffModal: () => {
    set({
      isOpen: false,
      worktreePath: null,
      diffs: [],
      selectedFile: null,
      isLoading: false,
      isCommitting: false,
      error: null,
      commitError: null,
      commitMessage: '',
    });
  },

  selectFile: (file: FileDiff) => {
    set({ selectedFile: file });
  },

  setCommitMessage: (msg: string) => {
    set({ commitMessage: msg, commitError: null });
  },

  clearCommitError: () => {
    set({ commitError: null });
  },

  clearAllErrors: () => {
    set({ error: null, commitError: null });
  },

  commit: async () => {
    const { worktreePath, commitMessage } = get();
    const cleanMsg = commitMessage.trim();

    if (!worktreePath) {
      const msg = 'No active worktree path selected.';
      set({ commitError: msg });
      throw new Error(msg);
    }
    if (!cleanMsg) {
      const msg = 'Commit message cannot be empty.';
      set({ commitError: msg });
      throw new Error(msg);
    }

    set({ isCommitting: true, commitError: null });
    try {
      const res = await tauriIpc.commitWorktree(worktreePath, cleanMsg);

      // Refresh diffs after successful commit
      const files = await tauriIpc.getWorktreeDiff(worktreePath);
      set({
        diffs: files,
        selectedFile: files.length > 0 ? files[0] : null,
        commitMessage: '',
        isCommitting: false,
        commitError: null,
      });
      return res;
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : err?.message || 'Git commit failed.';
      console.error('Failed to commit worktree:', errMsg);
      set({
        isCommitting: false,
        commitError: errMsg,
      });
      throw new Error(errMsg);
    }
  },
}));
