import { create } from 'zustand';
import { FileDiff } from '../types';
import { tauriIpc } from '../lib/tauriIpc';

interface DiffState {
  isOpen: boolean;
  worktreePath: string | null;
  diffs: FileDiff[];
  selectedFile: FileDiff | null;
  isLoading: boolean;
  commitMessage: string;

  openDiffModal: (path: string) => Promise<void>;
  closeDiffModal: () => void;
  selectFile: (file: FileDiff) => void;
  setCommitMessage: (msg: string) => void;
  commit: () => Promise<string>;
}

export const useDiffStore = create<DiffState>((set, get) => ({
  isOpen: false,
  worktreePath: null,
  diffs: [],
  selectedFile: null,
  isLoading: false,
  commitMessage: '',

  openDiffModal: async (path: string) => {
    set({ isOpen: true, worktreePath: path, isLoading: true });
    try {
      const files = await tauriIpc.getWorktreeDiff(path);
      set({
        diffs: files,
        selectedFile: files[0] || null,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load diffs', err);
      set({ isLoading: false });
    }
  },

  closeDiffModal: () => {
    set({ isOpen: false, worktreePath: null, diffs: [], selectedFile: null });
  },

  selectFile: (file: FileDiff) => {
    set({ selectedFile: file });
  },

  setCommitMessage: (msg: string) => {
    set({ commitMessage: msg });
  },

  commit: async () => {
    const { worktreePath, commitMessage } = get();
    if (!worktreePath || !commitMessage.trim()) {
      throw new Error('Missing worktree path or commit message');
    }
    set({ isLoading: true });
    try {
      const res = await tauriIpc.commitWorktree(worktreePath, commitMessage.trim());
      // Refresh diffs
      const files = await tauriIpc.getWorktreeDiff(worktreePath);
      set({
        diffs: files,
        selectedFile: files[0] || null,
        commitMessage: '',
        isLoading: false,
      });
      return res;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
