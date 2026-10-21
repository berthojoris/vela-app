import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileDiff as FileDiffIcon, Loader2, RefreshCw } from 'lucide-react';
import { ChangedFile, WorktreeChanges } from '../../types';
import { tauriIpc } from '../../lib/tauriIpc';
import { errorMessage } from '../../lib/errors';
import { useDiffStore } from '../../stores/useDiffStore';
import { changeKey } from '../../lib/gitStatus';
import { cacheChanges, getCachedChanges } from '../../lib/worktreeChangesCache';

interface ChangedFilesPanelProps {
  worktreePath: string;
  branch: string;
  /** Changes only after a refresh that actually checked Git status; always reloads the list. */
  refreshKey: unknown;
  /** Mirrors the Git auto-check switch. When false, opening or switching worktrees never runs Git. */
  autoRefresh: boolean;
}

export function describeStatus(status: string): { letter: string; label: string; color: string } {
  const s = status.trim();
  if (s.includes('?')) return { letter: 'U', label: 'Untracked', color: 'text-purple-400' };
  if (s.includes('U') || s === 'AA' || s === 'DD') return { letter: 'C', label: 'Conflict', color: 'text-orca-rose' };
  if (s.includes('D')) return { letter: 'D', label: 'Deleted', color: 'text-orca-rose' };
  if (s.includes('R')) return { letter: 'R', label: 'Renamed', color: 'text-sky-400' };
  if (s.includes('A')) return { letter: 'A', label: 'Added', color: 'text-orca-emerald' };
  return { letter: 'M', label: 'Modified', color: 'text-orca-amber' };
}

function splitPath(path: string): { name: string; dir: string } {
  const trimmed = path.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  return index < 0 ? { name: trimmed, dir: '' } : { name: trimmed.slice(index + 1), dir: trimmed.slice(0, index) };
}

export const ChangedFilesPanel: React.FC<ChangedFilesPanelProps> = ({
  worktreePath,
  branch,
  refreshKey,
  autoRefresh,
}) => {
  const [changes, setChanges] = useState<WorktreeChanges | null>(() => getCachedChanges(worktreePath) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const openDiffModal = useDiffStore((state) => state.openDiffModal);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const result = await tauriIpc.getWorktreeChanges(worktreePath);
      if (id !== request.current) return;
      cacheChanges(worktreePath, result);
      setChanges(result);
      setError(null);
    } catch (err) {
      if (id === request.current) setError(errorMessage(err, 'Unable to read changes for this worktree.'));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [worktreePath]);

  // A different worktree must never show the previous one's files, even briefly.
  useEffect(() => {
    ++request.current;
    setChanges(getCachedChanges(worktreePath) ?? null);
    setError(null);
    setLoading(false);
  }, [worktreePath]);

  // Opening or switching worktrees loads only while the auto-check is ON; a status-checked
  // refresh (manual ↻, or the switch being turned ON) always reloads.
  const lastRefreshKey = useRef(refreshKey);
  useEffect(() => {
    const refreshed = lastRefreshKey.current !== refreshKey;
    lastRefreshKey.current = refreshKey;
    if (refreshed || autoRefresh) void load();
    // autoRefresh is read, not tracked: turning the switch ON already advances refreshKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  // Drop late results after unmount.
  useEffect(
    () => () => {
      ++request.current;
    },
    []
  );

  const openFile = async (file: ChangedFile) => {
    await openDiffModal(worktreePath);
    const diff = useDiffStore.getState();
    const match =
      diff.worktreePath === worktreePath ? diff.diffs.find((d) => changeKey(d) === changeKey(file)) : undefined;
    if (match) diff.selectFile(match);
  };

  const files = changes?.files ?? [];
  const total = changes?.total ?? 0;
  const additions = files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <section
      className="flex-1 min-h-0 flex flex-col border-t border-orca-border"
      aria-label={`Changed files on ${branch}`}
    >
      <div className="h-8 px-3 flex items-center justify-between gap-1.5 shrink-0 border-b border-orca-border/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileDiffIcon className="w-3.5 h-3.5 text-orca-emerald shrink-0" />
          <span className="font-semibold text-white">Changes</span>
          {changes && (
            <span className="text-[10px] font-mono bg-orca-card px-1.5 rounded text-orca-muted border border-orca-border">
              {total}
            </span>
          )}
          {(additions > 0 || deletions > 0) && (
            <span className="text-[10px] font-mono truncate">
              <span className="text-orca-emerald">+{additions}</span>{' '}
              <span className="text-orca-rose">-{deletions}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            void load();
          }}
          disabled={loading}
          className="p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white transition-colors disabled:opacity-40 cursor-pointer shrink-0"
          title="Refresh changed files"
          aria-label="Refresh changed files"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {error ? (
          <div
            role="alert"
            className="p-1.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-[10.5px] leading-tight break-all"
          >
            {error}
          </div>
        ) : !changes && !loading && !autoRefresh ? (
          <div className="flex flex-col items-center justify-center gap-1 py-4 text-orca-muted text-[11px] text-center">
            <span>Git auto check is OFF.</span>
            <span>Click ↻ to read changes.</span>
          </div>
        ) : !changes ? (
          <div className="flex items-center justify-center gap-1.5 py-4 text-orca-muted text-[11px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-orca-accent" />
            <span>Reading changes…</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-4 text-orca-muted text-[11px] text-center">
            <CheckCircle2 className="w-5 h-5 text-orca-emerald/50" />
            <span>No changes — working tree clean</span>
          </div>
        ) : (
          <ul className="space-y-px">
            {files.map((file) => {
              const status = describeStatus(file.status);
              const { name, dir } = splitPath(file.path);
              return (
                <li key={changeKey(file)}>
                  <button
                    type="button"
                    onClick={() => {
                      void openFile(file);
                    }}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-orca-hover text-left transition-colors cursor-pointer"
                    title={`${status.label}: ${file.path}`}
                  >
                    <span
                      className={`w-3 shrink-0 text-center font-mono font-bold text-[10px] ${status.color}`}
                      aria-label={status.label}
                    >
                      {status.letter}
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col leading-tight">
                      <span
                        className={`truncate text-[11px] ${status.letter === 'D' ? 'line-through text-orca-muted' : 'text-orca-text'}`}
                      >
                        {name}
                      </span>
                      {dir && <span className="truncate text-[9.5px] font-mono text-orca-muted">{dir}</span>}
                    </span>
                    {file.status === '??' ? (
                      <span className="shrink-0 text-[9.5px] text-purple-400">new file</span>
                    ) : (
                      (file.additions > 0 || file.deletions > 0) && (
                        <span className="shrink-0 text-[9.5px] font-mono">
                          {file.additions > 0 && <span className="text-orca-emerald">+{file.additions}</span>}
                          {file.additions > 0 && file.deletions > 0 && ' '}
                          {file.deletions > 0 && <span className="text-orca-rose">-{file.deletions}</span>}
                        </span>
                      )
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {changes && total > files.length && (
          <p className="px-1.5 pt-1.5 text-[10px] text-orca-muted">
            Showing {files.length} of {total} files. Use Diff or the terminal to review the rest.
          </p>
        )}
      </div>
    </section>
  );
};
