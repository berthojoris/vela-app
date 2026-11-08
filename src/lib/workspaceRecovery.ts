import {
  captureEditorDocuments,
  fileKey,
  isDirty,
  subscribeEditorContent,
  useEditorStore,
} from '../stores/useEditorStore';
import { useTerminalStore } from '../stores/useTerminalStore';
import { useNoticeStore } from '../stores/useNoticeStore';
import { tauriIpc } from './tauriIpc';
import { readWorkspace, writeWorkspace, type WorkspaceSnapshot } from './workspaceStorage';
import { setWindowClosePreparation } from './windowClosePreparation';

export function captureWorkspace(): WorkspaceSnapshot {
  const terminals = useTerminalStore.getState();
  const editor = useEditorStore.getState();
  return {
    version: 1,
    terminals: terminals.sessions
      .filter((session) => !session.exited)
      .map((session) => ({
        id: session.id,
        title: session.title.slice(0, 1024),
        shell: session.shell,
        cwd: session.cwd,
        wasAgent: session.is_agent,
      })),
    activeSessionId: terminals.activeSessionId,
    primarySessionId: terminals.primarySessionId,
    secondarySessionId: terminals.secondarySessionId,
    splitMode: terminals.splitMode,
    documents: captureEditorDocuments(),
    activeDocumentId: editor.activeDocumentId,
    workspaceView: editor.workspaceView,
    explorerRoot: editor.explorerRoot,
    sidebarMode: editor.sidebarMode,
  };
}

/** Restore text before launching shells. Never replay commands or resume an agent unattended. */
export async function restoreWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  const editorBefore = useEditorStore.getState();
  const documents = [];
  for (const doc of snapshot.documents) {
    try {
      const disk = await tauriIpc.readTextFile(doc.root, doc.path);
      documents.push(
        isDirty(doc)
          ? {
              ...doc,
              id: fileKey(doc.root, doc.path),
              error:
                disk.revision === doc.revision
                  ? null
                  : 'This recovered draft differs from the disk version. Copy your edits before reopening the file to resolve the conflict.',
            }
          : { ...doc, ...disk, id: fileKey(doc.root, doc.path), savedContent: disk.content, dirty: false }
      );
    } catch (error) {
      if (isDirty(doc))
        documents.push({
          ...doc,
          id: fileKey(doc.root, doc.path),
          error: `Recovered draft; the disk file is unavailable. ${String(error)}`,
        });
      else useNoticeStore.getState().report(`Unable to reopen ${doc.path}`, error);
    }
  }
  const currentEditor = useEditorStore.getState();
  const untouched = currentEditor === editorBefore && !currentEditor.documents.length && !currentEditor.opening.length;
  const merged = [...currentEditor.documents];
  for (const doc of documents) {
    if (merged.length + currentEditor.opening.length >= 20) break;
    if (!merged.some((item) => item.id === doc.id) && !currentEditor.opening.includes(doc.id)) merged.push(doc);
  }
  useEditorStore.setState({
    documents: merged,
    ...(untouched
      ? {
          activeDocumentId: merged.find((doc) => doc.id === snapshot.activeDocumentId)?.id ?? merged[0]?.id ?? null,
          workspaceView: merged.length ? snapshot.workspaceView : 'terminal',
          explorerRoot: snapshot.explorerRoot,
          sidebarMode: snapshot.sidebarMode,
        }
      : {}),
  });

  if (!snapshot.terminals.length) return;
  await useTerminalStore.getState().fetchProfiles();
  const profiles = useTerminalStore.getState().profiles.filter((profile) => !profile.is_agent);
  const ids = new Map<string, string>();
  for (const context of snapshot.terminals) {
    if (useTerminalStore.getState().sessions.length >= 32) break;
    const profile =
      profiles.find((item) => item.executable.toLowerCase() === context.shell.toLowerCase()) ?? profiles[0];
    if (!profile) {
      useNoticeStore
        .getState()
        .report(
          'Unable to restore terminals',
          'No installed shell is available. Open a terminal after checking shell profiles.'
        );
      break;
    }
    try {
      const session = await useTerminalStore.getState().createSession({
        shell: profile.executable,
        args: profile.args,
        cwd: context.cwd,
        title: context.wasAgent ? `${context.title} (restored shell)` : context.title,
        isAgent: false,
        agentType: null,
        activate: false,
      });
      ids.set(context.id, session.id);
    } catch (error) {
      useNoticeStore.getState().report(`Unable to restore terminal ${context.title}`, error);
    }
  }
  // A click or a new terminal during recovery wins over the saved layout.
  const state = useTerminalStore.getState();
  if (state.activeSessionId || !ids.size) return;
  const available = (id: string | null) => {
    const mapped = id ? ids.get(id) : null;
    return state.sessions.some((session) => session.id === mapped) ? mapped! : null;
  };
  const fallback = [...ids.values()].find((id) => state.sessions.some((session) => session.id === id)) ?? null;
  const primary = available(snapshot.primarySessionId) ?? fallback;
  const secondary = available(snapshot.secondarySessionId);
  const split = snapshot.splitMode !== 'none' && primary && secondary && primary !== secondary;
  useTerminalStore.setState({
    primarySessionId: primary,
    secondarySessionId: split ? secondary : null,
    activeSessionId: available(snapshot.activeSessionId) ?? primary,
    splitMode: split ? snapshot.splitMode : 'none',
  });
}

let initialization: Promise<void> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let maxTimer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> | undefined;
let pendingSnapshot: WorkspaceSnapshot | undefined;
let enabled = false;

/** Flush is awaited by the native close command; writes are ordered and atomic in IndexedDB. */
export function flushWorkspaceRecovery(): Promise<void> {
  clearTimeout(timer);
  clearTimeout(maxTimer);
  timer = maxTimer = undefined;
  if (!enabled) return writing ?? Promise.resolve();
  pendingSnapshot = captureWorkspace();
  writing ??= (async () => {
    try {
      while (pendingSnapshot) {
        const snapshot = pendingSnapshot;
        pendingSnapshot = undefined;
        try {
          await writeWorkspace(snapshot);
        } catch (error) {
          useNoticeStore.getState().report('Workspace recovery could not be saved', error);
        }
      }
    } finally {
      writing = undefined;
    }
  })();
  return writing;
}

function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(() => void flushWorkspaceRecovery(), 500);
  maxTimer ??= setTimeout(() => void flushWorkspaceRecovery(), 5000);
}

export function initializeWorkspaceRecovery(): Promise<void> {
  if (initialization) return initialization;
  setWindowClosePreparation(async () => {
    await initialization;
    await flushWorkspaceRecovery();
  });
  initialization = (async () => {
    let loaded = false;
    try {
      const snapshot = await readWorkspace();
      if (snapshot) await restoreWorkspace(snapshot);
      loaded = true;
    } catch (error) {
      useNoticeStore.getState().report('Workspace recovery is unavailable', error);
    }
    enabled = true;
    useTerminalStore.subscribe((state, prev) => {
      if (
        state.sessions !== prev.sessions ||
        state.activeSessionId !== prev.activeSessionId ||
        state.primarySessionId !== prev.primarySessionId ||
        state.secondarySessionId !== prev.secondarySessionId ||
        state.splitMode !== prev.splitMode
      ) {
        scheduleSave();
      }
    });
    useEditorStore.subscribe((state, prev) => {
      if (
        state.documents !== prev.documents ||
        state.activeDocumentId !== prev.activeDocumentId ||
        state.workspaceView !== prev.workspaceView ||
        state.explorerRoot !== prev.explorerRoot ||
        state.sidebarMode !== prev.sidebarMode
      ) {
        scheduleSave();
      }
    });
    subscribeEditorContent(scheduleSave);
    window.addEventListener('pagehide', () => void flushWorkspaceRecovery());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void flushWorkspaceRecovery();
    });
    if (loaded) scheduleSave();
  })();
  return initialization;
}
