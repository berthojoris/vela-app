import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderTree, Loader2, RefreshCw } from 'lucide-react';
import { tauriIpc } from '../../lib/tauriIpc';
import { errorMessage } from '../../lib/errors';
import { fileKey, isDirty, useEditorStore } from '../../stores/useEditorStore';
import { FileIcon } from '../editor/FileIcon';
import type { FileEntry } from '../../types';
import { explorerReducer } from '../../lib/explorerCache';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { useShallow } from 'zustand/react/shallow';

const ROW_HEIGHT = 28;
const OVERSCAN = 8;
const MAX_DEPTH = 48;

type ExplorerRow =
  | { kind: 'entry'; entry: FileEntry; depth: number; position: number; size: number }
  | { kind: 'message'; path: string; depth: number; text: string; error?: boolean; loading?: boolean };

export function FileExplorer({ root, enabled = true }: { root: string | null; enabled?: boolean }) {
  const [{ folders, expanded }, dispatch] = useReducer(explorerReducer, { folders: {}, expanded: new Set(['']) });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const scroller = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const requests = useRef(new Map<string, object>());
  const mounted = useRef(false);
  const dirtyIds = useEditorStore(useShallow((s) => s.documents.filter(isDirty).map((doc) => doc.id)));
  const activeId = useEditorStore((s) => s.activeDocumentId);
  const opening = useEditorStore((s) => s.opening);
  const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);
  const openingSet = useMemo(() => new Set(opening), [opening]);
  const scrollFrame = useRef(0);

  const load = async (path: string) => {
    if (!root || requests.current.has(path)) return;
    // Slow network folders must not create an unbounded blocking-worker queue.
    if (requests.current.size >= 4) {
      dispatch({ type: 'error', path, error: 'Other folders are still loading. Retry when they finish.' });
      return;
    }
    const token = {};
    requests.current.set(path, token);
    dispatch({ type: 'loading', path });
    try {
      const listing = await tauriIpc.listDirectory(root, path);
      if (mounted.current && requests.current.get(path) === token) {
        dispatch({ type: 'loaded', path, listing });
      }
    } catch (error) {
      if (mounted.current && requests.current.get(path) === token) {
        dispatch({ type: 'error', path, error: errorMessage(error) });
      }
    } finally {
      if (requests.current.get(path) === token) requests.current.delete(path);
    }
  };
  useEffect(() => {
    mounted.current = true;
    const pending = requests.current;
    return () => {
      mounted.current = false;
      cancelAnimationFrame(scrollFrame.current);
      pending.clear();
    };
  }, []);
  useEffect(() => {
    if (enabled && !folders['']) void load('');
    // The parent keys this component by root, so folder state never crosses roots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const toggle = (path: string) => {
    const openingFolder = !expanded.has(path);
    if (openingFolder && path.split('/').length >= MAX_DEPTH) {
      useNoticeStore.getState().report('Explorer', 'This folder is too deeply nested. Open it as a separate root.');
      return;
    }
    dispatch({ type: 'toggle', path });
    if (!openingFolder) {
      // Keep request slots until they settle to bound backend concurrency.
      return;
    }
    if (!folders[path]?.listing && !folders[path]?.loading) void load(path);
  };

  const rows = useMemo(() => {
    const result: ExplorerRow[] = [];
    const visit = (path: string, depth: number) => {
      if (depth >= MAX_DEPTH) return;
      const state = folders[path];
      if (!state) return;
      if (state.loading) result.push({ kind: 'message', path, depth, text: 'Loading folder...', loading: true });
      if (state.error) result.push({ kind: 'message', path, depth, text: state.error, error: true });
      state.listing?.entries.forEach((entry, position, entries) => {
        result.push({ kind: 'entry', entry, depth, position: position + 1, size: entries.length });
        if (entry.is_dir && expanded.has(entry.path)) visit(entry.path, depth + 1);
      });
      if (state.listing?.entries.length === 0 && !state.loading)
        result.push({ kind: 'message', path, depth, text: 'Empty folder' });
      if (state.listing?.truncated)
        result.push({ kind: 'message', path, depth, text: 'Showing the first 5,000 entries.' });
    };
    if (expanded.has('')) visit('', 0);
    return result;
  }, [folders, expanded]);
  const maxScroll = Math.max(0, rows.length * ROW_HEIGHT - viewportHeight);
  const start = Math.max(0, Math.floor(Math.min(scrollTop, maxScroll) / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, start + Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2);
  useLayoutEffect(() => {
    if (!scroller.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewportHeight(scroller.current?.clientHeight || 560));
    observer.observe(scroller.current);
    return () => observer.disconnect();
  }, [root]);
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const item = scroller.current?.querySelector<HTMLButtonElement>(`[data-row-index="${pendingFocus.current}"]`);
    if (item) {
      item.focus();
      pendingFocus.current = null;
    }
  }, [start, end, rows]);

  const renderRow = (row: ExplorerRow, index: number) => {
    if (row.kind === 'message')
      return (
        <li
          key={`${row.path}:${row.text}`}
          role="none"
          className="h-7 px-3 text-orca-muted flex items-center gap-2"
          style={{ paddingLeft: 10 + row.depth * 14 }}
        >
          {row.loading && <Loader2 className="w-3 h-3 shrink-0 animate-spin" />}
          <span role={row.error ? 'alert' : row.loading ? 'status' : undefined} className="truncate" title={row.text}>
            {row.text}
          </span>
          {row.error && (
            <button onClick={() => void load(row.path)} className="underline shrink-0">
              Retry
            </button>
          )}
        </li>
      );
    const { entry, depth } = row;
    const open = expanded.has(entry.path);
    const id = fileKey(root!, entry.path);
    const active = activeId === id;
    const dirty = dirtySet.has(id);
    return (
      <li key={entry.path} role="none" className="h-7">
        <button
          data-row-index={index}
          type="button"
          role="treeitem"
          aria-level={depth + 1}
          aria-posinset={row.position}
          aria-setsize={row.size}
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
              const step = event.key === 'ArrowDown' ? 1 : -1;
              let next = index + step;
              while (next >= 0 && next < rows.length && rows[next].kind !== 'entry') next += step;
              if (next >= 0 && next < rows.length) {
                pendingFocus.current = next;
                const viewport = scroller.current!;
                const height = viewport.clientHeight || viewportHeight;
                if (next * ROW_HEIGHT < viewport.scrollTop) viewport.scrollTop = next * ROW_HEIGHT;
                else if ((next + 1) * ROW_HEIGHT > viewport.scrollTop + height)
                  viewport.scrollTop = (next + 1) * ROW_HEIGHT - height;
                setScrollTop(viewport.scrollTop);
                const item = viewport.querySelector<HTMLButtonElement>(`[data-row-index="${next}"]`);
                if (item) {
                  item.focus();
                  pendingFocus.current = null;
                }
              }
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
          {openingSet.has(id) && <Loader2 className="ml-auto w-3 h-3 shrink-0 animate-spin" />}
          {dirty && (
            <span aria-label="Unsaved changes" className="ml-auto w-1.5 h-1.5 rounded-full bg-orca-text shrink-0" />
          )}
        </button>
      </li>
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
            // Refresh sequentially so a large expanded tree cannot flood IPC.
            void (async () => {
              for (const path of expanded) {
                if (!mounted.current) break;
                await load(path);
              }
            })();
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
          <div
            ref={scroller}
            onScroll={(event) => {
              const nextTop = event.currentTarget.scrollTop;
              cancelAnimationFrame(scrollFrame.current);
              scrollFrame.current = requestAnimationFrame(() => setScrollTop(nextTop));
            }}
            className="flex-1 min-h-0 overflow-auto py-1"
          >
            <ul role="tree" aria-label="Files and folders">
              <li role="none" aria-hidden="true" style={{ height: start * ROW_HEIGHT }} />
              {rows.slice(start, end).map((row, offset) => renderRow(row, start + offset))}
              <li role="none" aria-hidden="true" style={{ height: Math.max(0, rows.length - end) * ROW_HEIGHT }} />
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
