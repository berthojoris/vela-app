import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderTree, Loader2, RefreshCw } from 'lucide-react';
import { tauriIpc } from '../../lib/tauriIpc';
import { errorMessage } from '../../lib/errors';
import { fileKey, isDirty, useEditorStore } from '../../stores/useEditorStore';
import { FileIcon } from '../editor/FileIcon';
import type { DirectoryListing } from '../../types';
import { useShallow } from 'zustand/react/shallow';

interface FolderState {
  listing?: DirectoryListing;
  loading: boolean;
  error?: string;
}

export function FileExplorer({ root, enabled = true }: { root: string | null; enabled?: boolean }) {
  const [folders, setFolders] = useState<Record<string, FolderState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [selected, setSelected] = useState<string | null>(null);
  const requests = useRef(new Map<string, object>());
  const mounted = useRef(false);
  const dirtyIds = useEditorStore(useShallow((s) => s.documents.filter(isDirty).map((doc) => doc.id)));
  const activeId = useEditorStore((s) => s.activeDocumentId);
  const opening = useEditorStore((s) => s.opening);

  const load = async (path: string) => {
    if (!root) return;
    const token = {};
    requests.current.set(path, token);
    setFolders((old) => ({ ...old, [path]: { ...old[path], loading: true, error: undefined } }));
    try {
      const listing = await tauriIpc.listDirectory(root, path);
      if (mounted.current && requests.current.get(path) === token) {
        setFolders((old) => ({ ...old, [path]: { listing, loading: false } }));
      }
    } catch (error) {
      if (mounted.current && requests.current.get(path) === token) {
        setFolders((old) => ({ ...old, [path]: { ...old[path], loading: false, error: errorMessage(error) } }));
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    const pending = requests.current;
    return () => {
      mounted.current = false;
      pending.clear();
    };
  }, []);
  useEffect(() => {
    if (enabled && !folders['']) void load('');
    // The parent keys this component by root, so folder state never crosses roots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const toggle = (path: string) => {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!expanded.has(path) && !folders[path]?.listing && !folders[path]?.loading) void load(path);
  };

  const renderFolder = (path: string, depth: number): React.ReactNode => {
    const state = folders[path];
    return (
      <>
        {state?.loading && (
          <li role="none">
            <div role="status" className="px-4 py-2 text-orca-muted flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading folder…
            </div>
          </li>
        )}
        {state?.error && (
          <li role="none">
            <div role="alert" className="px-3 py-2 text-orca-rose break-words">
              {state.error}
              <button onClick={() => void load(path)} className="block mt-1 text-orca-text underline">
                Retry
              </button>
            </div>
          </li>
        )}
        {state?.listing?.entries.map((entry) => {
          const open = expanded.has(entry.path);
          const id = fileKey(root!, entry.path);
          const active = activeId === id;
          const dirty = dirtyIds.includes(id);
          return (
            <li key={entry.path} role="none">
              <button
                type="button"
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={entry.is_dir ? open : undefined}
                aria-selected={active || selected === entry.path}
                title={`${entry.path}${dirty ? ' (unsaved)' : ''}`}
                className={`w-full h-7 pr-3 flex items-center gap-1.5 text-left border-y border-transparent hover:bg-orca-hover focus-visible:-outline-offset-2 ${active ? 'bg-orca-accent/15 text-white' : selected === entry.path ? 'bg-orca-hover text-white' : 'text-orca-text'}`}
                style={{ paddingLeft: 10 + depth * 14 }}
                onClick={() => {
                  setSelected(entry.path);
                  if (entry.is_dir) toggle(entry.path);
                }}
                onDoubleClick={() => {
                  if (!entry.is_dir) void useEditorStore.getState().openFile(root!, entry.path);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !entry.is_dir) {
                    event.preventDefault();
                    void useEditorStore.getState().openFile(root!, entry.path);
                  }
                  if (entry.is_dir && ((event.key === 'ArrowRight' && !open) || (event.key === 'ArrowLeft' && open))) {
                    event.preventDefault();
                    toggle(entry.path);
                  }
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const items = Array.from(
                      event.currentTarget
                        .closest('[role="tree"]')!
                        .querySelectorAll<HTMLButtonElement>('[role="treeitem"]')
                    );
                    items[items.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
                  }
                }}
              >
                {entry.is_dir ? (
                  open ? (
                    <ChevronDown className="w-3 h-3 shrink-0 text-orca-muted" />
                  ) : (
                    <ChevronRight className="w-3 h-3 shrink-0 text-orca-muted" />
                  )
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                {entry.is_dir ? (
                  open ? (
                    <FolderOpen className="w-4 h-4 shrink-0 text-orca-accent" strokeWidth={1.6} />
                  ) : (
                    <Folder className="w-4 h-4 shrink-0 text-orca-accent" strokeWidth={1.6} />
                  )
                ) : (
                  <FileIcon name={entry.name} />
                )}
                <span className="truncate">{entry.name}</span>
                {opening.includes(id) && <Loader2 className="ml-auto w-3 h-3 shrink-0 animate-spin" />}
                {dirty && (
                  <span
                    aria-label="Unsaved changes"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-orca-text shrink-0"
                  />
                )}
              </button>
              {entry.is_dir && open && <ul role="group">{renderFolder(entry.path, depth + 1)}</ul>}
            </li>
          );
        })}
        {state?.listing?.entries.length === 0 && !state.loading && (
          <li role="none" className="py-2 text-orca-muted" style={{ paddingLeft: 30 + depth * 14 }}>
            Empty folder
          </li>
        )}
        {state?.listing?.truncated && (
          <li role="none" className="px-3 py-2 text-orca-amber">
            Showing the first 5,000 entries.
          </li>
        )}
      </>
    );
  };

  return (
    <section aria-label="File Explorer" className="flex-1 min-h-0 flex flex-col">
      <div className="h-9 px-3 border-b border-orca-border flex items-center gap-2 shrink-0">
        <FolderTree className="w-3.5 h-3.5 text-orca-accent" />
        <h2 className="font-semibold text-white">Explorer</h2>
        <button
          title="Refresh files"
          aria-label="Refresh files"
          disabled={!root || folders['']?.loading}
          onClick={() => {
            for (const path of expanded) void load(path);
          }}
          className="ml-auto p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white disabled:opacity-40"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {root ? (
        <>
          <button
            title={root}
            onClick={() => toggle('')}
            className="h-9 px-3 flex items-center gap-1.5 bg-orca-card/30 border-b border-orca-border text-white shrink-0 text-left"
          >
            {expanded.has('') ? (
              <ChevronDown className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 shrink-0" />
            )}
            <span className="font-semibold truncate">
              {root.replace(/\\/g, '/').split('/').filter(Boolean).pop() || root}
            </span>
          </button>
          <div className="flex-1 min-h-0 overflow-auto py-1">
            <ul role="tree" aria-label="Files and folders">
              {expanded.has('') && renderFolder('', 0)}
            </ul>
          </div>
          <p className="px-3 py-2 border-t border-orca-border text-[10px] text-orca-muted">
            Double-click to edit · Ctrl+S to save
          </p>
        </>
      ) : (
        <div className="p-5 text-orca-muted leading-relaxed">
          Open a terminal or click Open Files to choose a folder.
        </div>
      )}
    </section>
  );
}
