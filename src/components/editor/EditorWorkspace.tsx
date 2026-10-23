import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { FileCode2, Loader2, Save, X } from 'lucide-react';
import { isDirty, useEditorStore } from '../../stores/useEditorStore';
import { tauriIpc } from '../../lib/tauriIpc';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { FileIcon } from './FileIcon';
import { UnsavedDialog } from './UnsavedDialog';
const CodeEditor = lazy(() => import('./CodeEditor').then((module) => ({ default: module.CodeEditor })));

export function EditorWorkspace() {
  const { documents, activeDocumentId, workspaceView, activate, saveFile, closeFile } = useEditorStore();
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const allowClose = useRef(false);
  const busyRef = useRef(false);
  const active = documents.find((doc) => doc.id === activeDocumentId);
  const shown = workspaceView === 'editor';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useEditorStore.getState();
      const key = event.key.toLowerCase();
      if (
        state.workspaceView !== 'editor' ||
        !(event.ctrlKey || event.metaKey) ||
        !['s', 'w'].includes(key) ||
        event.altKey
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (document.querySelector('[aria-modal="true"]')) return;
      if (state.activeDocumentId) {
        if (key === 's') void state.saveFile(state.activeDocumentId);
        else if (!state.closeFile(state.activeDocumentId)) {
          setCloseTarget(state.activeDocumentId);
          setCloseError(null);
        }
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !('__TAURI_INTERNALS__' in window) &&
        useEditorStore.getState().documents.some((doc) => isDirty(doc) || doc.saving)
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const interceptClose = (event: { preventDefault: () => void }) => {
      if (!allowClose.current && useEditorStore.getState().documents.some((doc) => isDirty(doc) || doc.saving)) {
        event.preventDefault();
        setCloseTarget('window');
        setCloseError(null);
      }
    };
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void tauriIpc
      .onWindowCloseRequested(interceptClose)
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => useNoticeStore.getState().report('Unable to protect unsaved files on window close', error));
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  const finishClose = async (discard: boolean) => {
    if (!closeTarget || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setCloseError(null);
    try {
      const state = useEditorStore.getState();
      const targets =
        closeTarget === 'window' ? state.documents : state.documents.filter((doc) => doc.id === closeTarget);
      if (targets.some((doc) => doc.saving)) {
        setCloseError('A file is still saving. Wait for it to finish, then try again.');
        return;
      }
      if (!discard) {
        for (const doc of targets) {
          if (!(await state.saveFile(doc.id))) {
            setCloseError(
              useEditorStore.getState().documents.find((item) => item.id === doc.id)?.error ||
                'Unable to save. Your edits are kept.'
            );
            return;
          }
        }
        const remaining = useEditorStore
          .getState()
          .documents.filter((doc) => closeTarget === 'window' || doc.id === closeTarget);
        if (remaining.some(isDirty)) {
          setCloseError('The text changed while saving. Save again to include the latest edits.');
          return;
        }
      }
      if (closeTarget === 'window') {
        allowClose.current = true;
        try {
          await tauriIpc.closeWindow();
        } catch (error) {
          allowClose.current = false;
          throw error;
        }
      } else {
        closeFile(closeTarget, discard);
      }
      setCloseTarget(null);
    } catch (error) {
      setCloseError(String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <section aria-label="File editor" className={shown ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
        <div className="h-9 flex border-b border-orca-border bg-orca-darker shrink-0">
          <div role="tablist" aria-label="Open files" className="flex-1 min-w-0 flex overflow-x-auto">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`shrink-0 max-w-64 border-r border-orca-border flex items-center border-t ${doc.id === activeDocumentId ? 'border-t-orca-accent bg-orca-darkest' : 'border-t-transparent text-orca-muted hover:bg-orca-hover'}`}
              >
                <button
                  role="tab"
                  aria-selected={doc.id === activeDocumentId}
                  title={`${doc.root}/${doc.path}`}
                  onClick={() => activate(doc.id)}
                  className="min-w-0 h-full px-3 flex items-center gap-2 text-xs"
                >
                  <FileIcon name={doc.path.split('/').pop()!} className="w-3.5 h-3.5" />
                  <span className="truncate">{doc.path.split('/').pop()}</span>
                  {isDirty(doc) && (
                    <span aria-label="Unsaved changes" className="w-1.5 h-1.5 rounded-full bg-orca-text shrink-0" />
                  )}
                </button>
                <button
                  aria-label={`Close ${doc.path}`}
                  title={`Close ${doc.path}`}
                  disabled={doc.saving}
                  onClick={() => {
                    if (!closeFile(doc.id)) {
                      setCloseTarget(doc.id);
                      setCloseError(null);
                    }
                  }}
                  className="mr-1 p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white disabled:opacity-40"
                >
                  {doc.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </div>
        {active ? (
          <>
            <div className="h-9 shrink-0 flex items-center gap-2 px-4 border-b border-orca-border text-[11px]">
              <span title={`${active.root}/${active.path}`} className="truncate text-orca-muted">
                {active.root.replace(/\\/g, '/').split('/').filter(Boolean).pop()} /{' '}
                <span className="text-orca-text">{active.path.split('/').join(' / ')}</span>
              </span>
              <span role="status" className={`ml-auto shrink-0 ${active.error ? 'text-orca-rose' : 'text-orca-muted'}`}>
                {active.saving ? 'Saving…' : active.error ? 'Not saved' : isDirty(active) ? 'Unsaved' : 'Saved'}
              </span>
              <button
                title="Save file (Ctrl+S)"
                aria-label="Save file"
                disabled={!isDirty(active) || active.saving}
                onClick={() => void saveFile(active.id)}
                className="p-1 rounded text-orca-muted hover:text-white hover:bg-orca-hover disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
            </div>
            {active.error && (
              <div
                role="alert"
                className="px-4 py-2 text-xs border-b border-orca-rose/30 bg-orca-rose/10 text-orca-rose select-text"
              >
                {active.error}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-orca-muted text-xs">
            <FileCode2 className="w-9 h-9 text-orca-muted" />
            <p>Double-click a file in Explorer to start editing.</p>
          </div>
        )}
        <Suspense
          fallback={
            <div role="status" className="p-4 text-xs text-orca-muted">
              Loading editor…
            </div>
          }
        >
          {documents.map((doc) => (
            <CodeEditor key={doc.id} document={doc} active={shown && doc.id === activeDocumentId} />
          ))}
        </Suspense>
      </section>
      {closeTarget && (
        <UnsavedDialog
          name={
            closeTarget === 'window'
              ? 'your open files'
              : documents.find((doc) => doc.id === closeTarget)?.path || 'this file'
          }
          busy={busy || documents.some((doc) => (closeTarget === 'window' || doc.id === closeTarget) && doc.saving)}
          error={closeError}
          onCancel={() => setCloseTarget(null)}
          onDiscard={() => void finishClose(true)}
          onSave={() => void finishClose(false)}
        />
      )}
    </>
  );
}
