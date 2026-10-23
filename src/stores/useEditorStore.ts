import { create } from 'zustand';
import { tauriIpc } from '../lib/tauriIpc';
import { errorMessage } from '../lib/errors';
import { useNoticeStore } from './useNoticeStore';
import { useWorktreeStore } from './useWorktreeStore';
import type { TextFile } from '../types';

export interface EditorDocument extends TextFile {
  id: string;
  root: string;
  path: string;
  savedContent: string;
  saving: boolean;
  error: string | null;
}

interface EditorState {
  documents: EditorDocument[];
  activeDocumentId: string | null;
  workspaceView: 'terminal' | 'editor';
  opening: string[];
  setWorkspaceView: (view: 'terminal' | 'editor') => void;
  activate: (id: string) => void;
  openFile: (root: string, path: string) => Promise<void>;
  updateContent: (id: string, content: string) => void;
  saveFile: (id: string) => Promise<boolean>;
  closeFile: (id: string, discard?: boolean) => boolean;
}

export const fileKey = (root: string, path: string) =>
  `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${path}`.toLowerCase();
export const isDirty = (doc: EditorDocument) => doc.content !== doc.savedContent;
const saves = new Map<string, Promise<boolean>>();
let openSequence = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  workspaceView: 'terminal',
  opening: [],
  setWorkspaceView: (workspaceView) => {
    ++openSequence;
    set({ workspaceView });
  },
  activate: (id) => {
    ++openSequence;
    if (get().documents.some((doc) => doc.id === id)) set({ activeDocumentId: id, workspaceView: 'editor' });
  },
  openFile: async (root, path) => {
    const id = fileKey(root, path);
    const existing = get().documents.find((doc) => doc.id === id);
    if (existing) {
      get().activate(id);
      return;
    }
    if (get().opening.includes(id)) return;
    if (get().documents.length + get().opening.length >= 20) {
      useNoticeStore
        .getState()
        .report('Editor tab limit', 'Close a file before opening another. Up to 20 files can stay open.');
      return;
    }
    const request = ++openSequence;
    set((state) => ({ opening: [...state.opening, id] }));
    try {
      const file = await tauriIpc.readTextFile(root, path);
      set((state) => ({
        documents: [
          ...state.documents,
          { ...file, id, root, path, savedContent: file.content, saving: false, error: null },
        ],
        ...(request === openSequence ? { activeDocumentId: id, workspaceView: 'editor' as const } : {}),
      }));
    } catch (error) {
      useNoticeStore.getState().report(`Unable to open ${path}`, error);
    } finally {
      set((state) => ({ opening: state.opening.filter((key) => key !== id) }));
    }
  },
  updateContent: (id, content) =>
    set((state) => ({
      documents: state.documents.map((doc) => (doc.id === id ? { ...doc, content } : doc)),
    })),
  saveFile: (id) => {
    const pending = saves.get(id);
    if (pending) return pending;
    const doc = get().documents.find((item) => item.id === id);
    if (!doc) return Promise.resolve(false);
    if (!isDirty(doc)) return Promise.resolve(true);
    set((state) => ({
      documents: state.documents.map((item) => (item.id === id ? { ...item, saving: true, error: null } : item)),
    }));
    const promise = (async () => {
      try {
        const saved = await tauriIpc.saveTextFile(doc.root, doc.path, doc.content, doc.revision);
        set((state) => ({
          documents: state.documents.map((item) =>
            item.id === id
              ? {
                  ...item,
                  revision: saved.revision,
                  line_ending: saved.line_ending,
                  has_bom: saved.has_bom,
                  savedContent: doc.content,
                  saving: false,
                  error: null,
                }
              : item
          ),
        }));
        void useWorktreeStore.getState().refreshWorktrees(true, true);
        return true;
      } catch (error) {
        set((state) => ({
          documents: state.documents.map((item) =>
            item.id === id ? { ...item, saving: false, error: errorMessage(error) } : item
          ),
        }));
        return false;
      } finally {
        saves.delete(id);
      }
    })();
    saves.set(id, promise);
    return promise;
  },
  closeFile: (id, discard = false) => {
    const doc = get().documents.find((item) => item.id === id);
    if (!doc || doc.saving || (isDirty(doc) && !discard)) return false;
    set((state) => {
      const index = state.documents.findIndex((item) => item.id === id);
      const documents = state.documents.filter((item) => item.id !== id);
      return {
        documents,
        activeDocumentId:
          state.activeDocumentId === id
            ? (documents[Math.min(index, documents.length - 1)]?.id ?? null)
            : state.activeDocumentId,
        ...(documents.length === 0 ? { workspaceView: 'terminal' as const } : {}),
      };
    });
    return true;
  },
}));
