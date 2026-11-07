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
  dirty?: boolean;
  saving: boolean;
  error: string | null;
}

export interface EditorSnapshotHandle {
  readRecoverySnapshot?: () => { content: string; savedContent: string };
  readSnapshot: () => {
    content: string;
    /** Marks the snapshot as saved in the live editor and returns whether newer edits exist. */
    commitSave: () => boolean;
  };
}

interface EditorState {
  documents: EditorDocument[];
  activeDocumentId: string | null;
  workspaceView: 'terminal' | 'editor';
  opening: string[];
  explorerRoot: string | null;
  sidebarMode: 'git' | 'files';
  setExplorerRoot: (root: string | null) => void;
  setSidebarMode: (mode: 'git' | 'files') => void;
  setWorkspaceView: (view: 'terminal' | 'editor') => void;
  activate: (id: string) => void;
  openFile: (root: string, path: string) => Promise<void>;
  updateContent: (id: string, content: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
  registerEditor: (id: string, handle: EditorSnapshotHandle) => () => void;
  saveFile: (id: string) => Promise<boolean>;
  closeFile: (id: string, discard?: boolean) => boolean;
}

export const fileKey = (root: string, path: string) =>
  `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${path}`.toLowerCase();
export const isDirty = (doc: EditorDocument) => doc.dirty ?? doc.content !== doc.savedContent;
const saves = new Map<string, Promise<boolean>>();
const editors = new Map<string, EditorSnapshotHandle>();
const contentListeners = new Set<() => void>();
export const notifyEditorContentChanged = () => contentListeners.forEach((listener) => listener());
export function subscribeEditorContent(listener: () => void): () => void {
  contentListeners.add(listener);
  return () => contentListeners.delete(listener);
}

export function captureEditorDocuments(): EditorDocument[] {
  return useEditorStore.getState().documents.map((doc) => {
    // Clean files are reopened from disk; only drafts need a text backup.
    const snapshot = isDirty(doc) ? (editors.get(doc.id)?.readRecoverySnapshot?.() ?? doc) : null;
    return {
      ...doc,
      content: snapshot?.content ?? '',
      savedContent: snapshot?.savedContent ?? '',
      saving: false,
      error: null,
    };
  });
}
let openSequence = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  workspaceView: 'terminal',
  opening: [],
  explorerRoot: null,
  sidebarMode: 'git',
  setExplorerRoot: (explorerRoot) => set({ explorerRoot }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setWorkspaceView: (workspaceView) => {
    // An empty editor has nothing to show; stay on the terminal instead.
    if (workspaceView === 'editor' && get().documents.length === 0) return;
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
          { ...file, id, root, path, savedContent: file.content, dirty: false, saving: false, error: null },
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
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, content, dirty: content !== doc.savedContent } : doc
      ),
    })),
  setDirty: (id, dirty) =>
    set((state) => {
      const doc = state.documents.find((item) => item.id === id);
      if (!doc || isDirty(doc) === dirty) return state;
      return {
        documents: state.documents.map((item) => (item.id === id ? { ...item, dirty } : item)),
      };
    }),
  registerEditor: (id, handle) => {
    editors.set(id, handle);
    // CodeMirror owns the document rope while mounted; release duplicate store strings.
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, content: '', savedContent: '', dirty: isDirty(doc) } : doc
      ),
    }));
    return () => {
      if (editors.get(id) !== handle) return;
      const snapshot = handle.readRecoverySnapshot?.();
      editors.delete(id);
      if (snapshot)
        set((state) => ({
          documents: state.documents.map((doc) => (doc.id === id ? { ...doc, ...snapshot } : doc)),
        }));
    };
  },
  saveFile: (id) => {
    const pending = saves.get(id);
    if (pending) return pending;
    const doc = get().documents.find((item) => item.id === id);
    if (!doc) return Promise.resolve(false);
    if (!isDirty(doc)) return Promise.resolve(true);
    const liveSnapshot = editors.get(id)?.readSnapshot();
    const contentToSave = liveSnapshot ? liveSnapshot.content : doc.content;
    set((state) => ({
      documents: state.documents.map((item) => (item.id === id ? { ...item, saving: true, error: null } : item)),
    }));
    const promise = (async () => {
      try {
        const saved = await tauriIpc.saveTextFile(doc.root, doc.path, contentToSave, doc.revision);
        const stillDirty = liveSnapshot ? liveSnapshot.commitSave() : undefined;
        set((state) => ({
          documents: state.documents.map((item) => {
            if (item.id !== id) return item;
            const hasLiveEditor = editors.has(id);
            const nextSavedContent = hasLiveEditor ? '' : contentToSave;
            const nextContent = hasLiveEditor ? '' : item.content;
            return {
              ...item,
              revision: saved.revision,
              line_ending: saved.line_ending,
              has_bom: saved.has_bom,
              content: nextContent,
              savedContent: nextSavedContent,
              dirty: stillDirty ?? nextContent !== nextSavedContent,
              saving: false,
              error: null,
            };
          }),
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
    editors.delete(id);
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
