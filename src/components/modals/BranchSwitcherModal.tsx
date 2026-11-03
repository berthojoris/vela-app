import React, { useEffect, useRef, useState } from 'react';
import { GitBranch, Loader2, Search, X } from 'lucide-react';
import { GitBranch as GitBranchInfo } from '../../types';
import { tauriIpc } from '../../lib/tauriIpc';
import { errorMessage } from '../../lib/errors';
import { useDialog } from '../../lib/useDialog';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useDiffStore } from '../../stores/useDiffStore';

interface BranchSwitcherModalProps {
  /** Target worktree; `null` closes the modal. */
  worktree: { path: string; branch: string } | null;
  onClose: () => void;
}

/**
 * Lists the repository's local branches and switches the given worktree to the selected one.
 *
 * Branches already checked out in a worktree are disabled because Git refuses a second
 * checkout of the same branch. When the target worktree has uncommitted changes, the user
 * first picks how to handle them: stash, switch and re-apply (the Git best practice), or
 * review and commit the changes first in the diff view.
 */
export const BranchSwitcherModal: React.FC<BranchSwitcherModalProps> = ({ worktree, onClose }) => {
  const isOpen = worktree !== null;
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [pending, setPending] = useState<{ branch: string; dirtyCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const wasOpenRef = useRef(false);
  const requestRef = useRef(0);
  const dialogRef = useDialog(isOpen, onClose, busy);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setBranches([]);
      setLoadError(null);
      setFilter('');
      setPending(null);
      setError(null);
      setBusy(false);
      busyRef.current = false;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!worktree) return;
    const request = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    tauriIpc
      .listBranches(worktree.path)
      .then((list) => {
        if (request === requestRef.current) setBranches(list);
      })
      .catch((err) => {
        if (request === requestRef.current) setLoadError(errorMessage(err, 'Unable to list branches.'));
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  }, [worktree]);

  if (!worktree) return null;

  // runSwitch owns the busy guard release; doSwitch and handlePick only acquire it.
  const runSwitch = async (branch: string, stashChanges: boolean) => {
    setError(null);
    try {
      await useWorktreeStore.getState().switchBranch(worktree.path, branch, stashChanges);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const doSwitch = (branch: string, stashChanges: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    void runSwitch(branch, stashChanges);
  };

  const handlePick = async (branch: GitBranchInfo) => {
    if (busyRef.current || branch.is_current || branch.checked_out_at) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const changes = await tauriIpc.getWorktreeChanges(worktree.path);
      if (changes.total > 0) {
        // Never switch past uncommitted work silently: ask how to handle it first.
        setPending({ branch: branch.name, dirtyCount: changes.total });
        busyRef.current = false;
        setBusy(false);
      } else {
        setPending(null);
        await runSwitch(branch.name, false);
      }
    } catch (err) {
      setError(errorMessage(err, 'Unable to check for uncommitted changes.'));
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleCommitFirst = () => {
    useDiffStore.getState().openDiffModal(worktree.path);
    onClose();
  };

  const visible = branches.filter((branch) => branch.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 text-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-switcher-title"
        aria-busy={busy}
        className="w-full max-w-md max-h-[90vh] flex flex-col bg-orca-darker border border-orca-border rounded-xl"
      >
        <header className="p-4 flex items-center justify-between gap-3 shrink-0">
          <h2 id="branch-switcher-title" className="font-semibold flex items-center gap-2 min-w-0">
            <GitBranch className="w-4 h-4 shrink-0" />
            <span className="truncate">Switch branch in {worktree.path.split('/').pop() || worktree.path}</span>
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close branch switcher"
            className="p-2 rounded hover:bg-orca-hover shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {pending ? (
          <div className="p-4 pt-0 space-y-4">
            <p className="text-orca-muted break-words">
              <span className="text-orca-amber font-medium">{pending.dirtyCount} uncommitted change(s)</span> on{' '}
              <span className="font-mono text-white">{worktree.branch}</span>. Handle them before switching to{' '}
              <span className="font-mono text-white">{pending.branch}</span>:
            </p>
            {error && (
              <p
                role="alert"
                className="p-3 rounded-md border border-orca-rose/40 whitespace-pre-wrap break-words select-text"
              >
                {error}
              </p>
            )}
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void doSwitch(pending.branch, true)}
                className="w-full px-3 py-2 rounded-md bg-orca-accent hover:bg-orca-accentHover disabled:opacity-40 font-semibold text-left"
              >
                {busy ? 'Working…' : 'Stash, switch & re-apply (recommended)'}
                <span className="block text-[11px] font-normal text-white/80">
                  git stash push --include-untracked, switch, then stash pop. Nothing is dropped.
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleCommitFirst}
                className="w-full px-3 py-2 rounded-md border border-orca-border hover:bg-orca-hover text-left"
              >
                Review & commit first
                <span className="block text-[11px] text-orca-muted">
                  Open the diff view to commit the changes, then switch branches afterwards.
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setError(null);
                }}
                className="w-full px-3 py-2 rounded-md border border-orca-border hover:bg-orca-hover text-orca-muted hover:text-white"
              >
                Back to branch list
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 pt-0 flex flex-col gap-3 min-h-0">
            <div className="relative shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-orca-muted pointer-events-none" />
              <input
                data-autofocus
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter branches…"
                aria-label="Filter branches"
                className="w-full p-2 pl-8 rounded-md border border-orca-border bg-orca-darkest font-mono"
              />
            </div>
            {error && (
              <p
                role="alert"
                className="p-3 rounded-md border border-orca-rose/40 whitespace-pre-wrap break-words select-text shrink-0"
              >
                {error}
              </p>
            )}
            <div className="overflow-y-auto min-h-0 max-h-[50vh] space-y-1" role="listbox" aria-label="Branches">
              {loading ? (
                <div className="p-4 flex items-center justify-center gap-2 text-orca-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading branches…
                </div>
              ) : loadError ? (
                <p
                  role="alert"
                  className="p-3 rounded-md border border-orca-rose/40 whitespace-pre-wrap break-words select-text"
                >
                  {loadError}
                </p>
              ) : visible.length === 0 ? (
                <p className="p-4 text-center text-orca-muted">
                  {branches.length === 0 ? 'No local branches found.' : 'No branches match this filter.'}
                </p>
              ) : (
                visible.map((branch) => {
                  const disabled = busy || branch.is_current || branch.checked_out_at !== null;
                  return (
                    <button
                      key={branch.name}
                      type="button"
                      role="option"
                      aria-selected={branch.is_current}
                      disabled={disabled}
                      onClick={() => void handlePick(branch)}
                      title={
                        branch.checked_out_at && !branch.is_current
                          ? `Checked out at ${branch.checked_out_at}`
                          : undefined
                      }
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                        branch.is_current
                          ? 'border-orca-accent/40 bg-orca-card'
                          : 'border-orca-border bg-orca-darkest/60 hover:bg-orca-hover disabled:hover:bg-orca-darkest/60'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <GitBranch
                        className={`w-3.5 h-3.5 shrink-0 ${branch.is_current ? 'text-orca-accent' : 'text-orca-muted'}`}
                      />
                      <span className="font-mono text-[12px] text-white truncate flex-1">{branch.name}</span>
                      {branch.is_current ? (
                        <span className="text-[9px] font-mono uppercase bg-orca-accent/10 border border-orca-accent/30 text-orca-accent px-1 rounded shrink-0">
                          current
                        </span>
                      ) : branch.checked_out_at ? (
                        <span className="text-[9px] font-mono uppercase bg-orca-amber/10 border border-orca-amber/30 text-orca-amber px-1 rounded shrink-0">
                          in use
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
            {busy && (
              <p className="text-orca-muted flex items-center gap-2 shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking changes…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
