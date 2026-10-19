import React, { useRef, useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Terminal,
  FileCode2,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FolderGit2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useDiffStore } from '../../stores/useDiffStore';
import { ChangedFilesPanel } from './ChangedFilesPanel';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { errorMessage } from '../../lib/errors';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { tauriIpc } from '../../lib/tauriIpc';

interface WorktreeSidebarProps {
  onOpenCreateModal: () => void;
}

export const WorktreeSidebar: React.FC<WorktreeSidebarProps> = ({ onOpenCreateModal }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [removal, setRemoval] = useState<{ path: string; branch: string; repo: string | null } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [openingDirectory, setOpeningDirectory] = useState(false);
  const removingRef = useRef(false);

  const {
    repoPath,
    worktrees,
    activeWorktreeId,
    activeSessionCwd,
    isLoading,
    isMutating,
    error,
    autoGitStatus,
    toggleAutoGitStatus,
    refreshWorktrees,
    removeWorktree,
    selectWorktree,
    clearError,
  } = useWorktreeStore();

  const { sessions, activeSessionId, setActiveSession } = useTerminalStore();
  const { openDiffModal } = useDiffStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const currentCwd = activeSession?.cwd || activeSessionCwd;
  const activeWorktree = repoPath ? worktrees.find((wt) => wt.id === activeWorktreeId) : undefined;

  const handleOpenDirectory = async () => {
    if (!currentCwd || openingDirectory) return;
    setOpeningDirectory(true);
    try {
      await tauriIpc.openDirectoryInExplorer(currentCwd);
    } catch (error) {
      useNoticeStore.getState().report('Unable to open the active directory', error);
    } finally {
      setOpeningDirectory(false);
    }
  };

  const handleSelectWorktreeCard = (wt: { id: string; path: string }) => {
    selectWorktree(wt.id);
    const norm = (p: string) => p.trim().replace(/\\/g, '/').toLowerCase();
    const targetPath = norm(wt.path);
    const existing = sessions.find(
      (s) => !s.exited && (s.worktree_id === wt.id || norm(s.cwd) === targetPath)
    );
    if (existing) {
      setActiveSession(existing.id);
    }
  };

  const confirmRemoval = async () => {
    if (!removal || removingRef.current) return;
    const norm = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (removal.repo !== useWorktreeStore.getState().repoPath) { setRemoveError('The active repository changed. Cancel and select the worktree again.'); return; }
    if (useTerminalStore.getState().sessions.some((session) => !session.exited && (norm(session.cwd) === norm(removal.path) || norm(session.cwd).startsWith(`${norm(removal.path)}/`)))) {
      setRemoveError('Close the terminals running in this worktree before removing it.');
      return;
    }
    removingRef.current = true;
    setRemoving(true);
    setRemoveError(null);
    try { await removeWorktree(removal.path); setRemoval(null); }
    catch (error) { setRemoveError(errorMessage(error)); }
    finally { removingRef.current = false; setRemoving(false); }
  };

  if (isCollapsed) {
    return (
      <aside className="w-10 bg-orca-darker border-r border-orca-border flex flex-col items-center py-2 select-none shrink-0">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded hover:bg-orca-hover text-orca-muted hover:text-white mb-2 transition-colors cursor-pointer"
          title="Expand Worktrees Sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {currentCwd && (
          <button
            type="button"
            onClick={() => { void handleOpenDirectory(); }}
            disabled={openingDirectory}
            className="p-1.5 rounded hover:bg-orca-hover text-orca-muted hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            title={`Open active directory in File Explorer: ${currentCwd}`}
            aria-label="Open active directory in File Explorer"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        )}
        {repoPath && (
          <button
            onClick={onOpenCreateModal}
            className="p-1.5 rounded bg-orca-accent/20 border border-orca-accent/40 text-orca-accent hover:bg-orca-accent hover:text-white transition-colors cursor-pointer"
            title="New Git Worktree"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </aside>
    );
  }

  return (
    <><aside className="w-64 bg-orca-darker border-r border-orca-border flex flex-col select-none shrink-0 h-full text-xs">
      {/* Header */}
      <div className="h-9 px-3 border-b border-orca-border flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-white">
          <GitBranch className="w-3.5 h-3.5 text-orca-accent" />
          <span>Git Worktrees</span>
          {repoPath && worktrees.length > 0 && (
            <span className="text-[10px] font-mono bg-orca-card px-1.5 rounded text-orca-muted border border-orca-border">
              {worktrees.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Switch ON/OFF for Git Status Auto-Reload */}
          <button
            type="button"
            role="switch"
            aria-checked={autoGitStatus}
            onClick={toggleAutoGitStatus}
            className={`h-5 px-1.5 rounded flex items-center gap-1 border transition-all cursor-pointer select-none text-[10px] ${
              autoGitStatus
                ? 'bg-orca-accent/15 border-orca-accent/40 text-orca-accent hover:bg-orca-accent/25'
                : 'bg-orca-darkest/70 border-orca-border text-orca-muted hover:text-white hover:border-orca-borderLight'
            }`}
            title={
              autoGitStatus
                ? 'Git Status Check: ON (Status git diperiksa otomatis saat berpindah tab & periodik)'
                : 'Git Status Check: OFF (Pemeriksaan git status nonaktif agar berpindah tab lebih cepat. Klik untuk mengaktifkan)'
            }
          >
            <span className="text-[9px] font-sans font-medium text-orca-muted">Git</span>
            <span
              className={`w-4.5 h-2.5 rounded-full flex items-center px-0.5 transition-colors ${
                autoGitStatus ? 'bg-orca-accent justify-end' : 'bg-orca-border justify-start'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  autoGitStatus ? 'bg-white' : 'bg-orca-muted'
                }`}
              />
            </span>
            <span
              className={`text-[9px] font-mono font-bold ${
                autoGitStatus ? 'text-orca-accent' : 'text-orca-muted'
              }`}
            >
              {autoGitStatus ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={() => refreshWorktrees(false, true)}
            disabled={isLoading || isMutating || !repoPath}
            className="p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
            title="Refresh Worktrees (Manual Check)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white transition-colors cursor-pointer"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Tab Project / Repo Header */}
      <div className="p-2 border-b border-orca-border bg-orca-card/30">
        {repoPath ? (
          <div className="flex items-center justify-between bg-orca-darkest/70 p-1.5 rounded border border-orca-border">
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderGit2 className="w-3.5 h-3.5 text-orca-accent shrink-0" />
              <span className="truncate font-mono text-[11px] text-white font-medium" title={repoPath}>
                {repoPath.split('/').pop() || repoPath}
              </span>
            </div>
            <span className="text-[9px] font-mono text-orca-emerald bg-orca-emerald/10 border border-orca-emerald/30 px-1 rounded shrink-0">
              Active Tab
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-orca-darkest/70 p-1.5 rounded border border-orca-border">
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderOpen className="w-3.5 h-3.5 text-orca-muted shrink-0" />
              <span
                className="truncate font-mono text-[11px] text-orca-muted"
                title={currentCwd || 'No Directory'}
              >
                {currentCwd ? currentCwd.split('/').pop() || currentCwd : 'No Directory'}
              </span>
            </div>
            <span className="text-[9px] font-mono text-orca-muted bg-orca-card px-1 rounded shrink-0 border border-orca-border">
              No Git
            </span>
          </div>
        )}

        {error && (
          <div className="mt-2 p-1.5 bg-red-950/40 border border-red-800/60 rounded text-red-300 text-[10.5px] flex items-start justify-between gap-1.5 leading-tight">
            <div className="flex items-start gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <span className="break-all">{error}</span>
            </div>
            <button
              onClick={() => clearError()}
              className="text-red-400 hover:text-white shrink-0 cursor-pointer text-[12px] leading-none px-1"
              title="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Worktrees Content Area */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {/* Loading Overlay Spinner */}
        {isLoading && (
          <div className="absolute inset-0 bg-orca-darker/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-20 animate-in fade-in duration-150">
            <div className="px-3.5 py-2 rounded-lg bg-orca-card border border-orca-border flex items-center gap-2 text-white shadow-sm">
              <Loader2 className="w-4 h-4 text-orca-accent animate-spin" />
              <span className="text-[11px] font-medium tracking-tight">Refreshing worktrees...</span>
            </div>
          </div>
        )}

        <div className={`${activeWorktree ? 'shrink-0 max-h-[45%]' : 'flex-1'} overflow-y-auto p-2 space-y-1.5`}>
          {repoPath ? (
            worktrees.length > 0 ? (
              worktrees.map((wt) => {
                const isSelected = wt.id === activeWorktreeId;

                return (
                  <div
                    key={wt.id}
                    onClick={() => handleSelectWorktreeCard(wt)}
                    className={`p-2 rounded-lg border transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-orca-card border-orca-accent/40 shadow-sm'
                        : 'bg-orca-card/40 border-orca-border hover:bg-orca-card hover:border-orca-borderLight'
                    }`}
                  >
                    {/* Branch Name & Badge */}
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <GitBranch
                          className={`w-3.5 h-3.5 shrink-0 ${
                            wt.is_main ? 'text-orca-accent' : 'text-orca-emerald'
                          }`}
                        />
                        <span className="font-semibold text-white truncate text-[11px]">
                          {wt.branch}
                        </span>
                      </div>

                      {wt.is_main && (
                        <span className="text-[9px] font-mono uppercase bg-orca-accent/10 border border-orca-accent/30 text-orca-accent px-1 rounded">
                          main
                        </span>
                      )}
                    </div>

                    {/* Status & Path Details */}
                    <div className="flex items-center justify-between text-[10px] text-orca-muted mb-2 font-mono">
                      <span className="truncate max-w-[140px]" title={wt.path}>
                        {wt.name}
                      </span>

                      {wt.dirty_files_count > 0 ? (
                        <span className="text-orca-amber bg-orca-amber/10 px-1 rounded font-medium">
                          {wt.dirty_files_count} dirty
                        </span>
                      ) : (
                        <span
                          className="text-orca-muted"
                          title={!autoGitStatus ? 'Git Auto Check: OFF (Klik ↻ Refresh untuk cek status terbaru)' : undefined}
                        >
                          clean
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 pt-1.5 border-t border-orca-border/50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDiffModal(wt.path);
                        }}
                        className="flex-1 h-6 px-2 rounded bg-orca-hover hover:bg-orca-border text-orca-text hover:text-white flex items-center justify-center gap-1 text-[10px] transition-colors cursor-pointer"
                        title="View Diffs & Commit"
                      >
                        <FileCode2 className="w-3 h-3 text-orca-emerald" />
                        <span>Diff</span>
                      </button>

                      {!wt.is_main && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRemoveError(null);
                            setRemoval({ path: wt.path, branch: wt.branch, repo: repoPath });
                          }}
                          className="h-6 w-6 rounded bg-orca-hover hover:bg-orca-rose/20 text-orca-muted hover:text-orca-rose flex items-center justify-center transition-colors cursor-pointer"
                          title="Remove Worktree"
                          disabled={isMutating}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-orca-muted text-[11px]">
                No worktrees found. Click below to add an isolated worktree for your agent.
              </div>
            )
          ) : activeSession ? (
            <div className="h-full flex flex-col items-center justify-center p-4 text-center select-none text-orca-muted">
              <FolderGit2 className="w-8 h-8 text-orca-muted/30 mb-2" />
              <span className="text-white text-xs font-semibold mb-1">Not a Git Repository</span>
              <p className="text-[11px] max-w-[190px] leading-relaxed">
                The active tab is running in a folder that is not inside a Git repository.
              </p>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-4 text-center select-none text-orca-muted">
              <Terminal className="w-8 h-8 text-orca-muted/30 mb-2" />
              <span className="text-white text-xs font-semibold mb-1">No Active Terminal</span>
              <p className="text-[11px] max-w-[190px] leading-relaxed">
                Open a terminal tab to view and manage its Git worktrees.
              </p>
            </div>
          )}
        </div>

        {activeWorktree && (
          <ChangedFilesPanel
            worktreePath={activeWorktree.path}
            branch={activeWorktree.branch}
            refreshKey={worktrees}
          />
        )}
      </div>

      {/* Footer actions */}
      {(currentCwd || repoPath) && (
        <div className="p-2 border-t border-orca-border space-y-1.5">
          {currentCwd && (
            <button
              type="button"
              onClick={() => { void handleOpenDirectory(); }}
              disabled={openingDirectory}
              className="w-full h-7 rounded border border-orca-border bg-orca-darkest/70 hover:bg-orca-hover text-orca-text hover:text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              title={`Open active directory in File Explorer: ${currentCwd}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{openingDirectory ? 'Opening…' : 'Open Dir'}</span>
            </button>
          )}
          {repoPath && (
          <button
            onClick={onOpenCreateModal}
            disabled={isMutating || isLoading}
            className="w-full h-8 rounded-md bg-orca-accent hover:bg-orca-accentHover text-white font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Worktree (Agent)</span>
          </button>
          )}
        </div>
      )}
    </aside>
    {removal && <ConfirmDialog title={`Remove ${removal.branch}?`} description={`This removes the worktree directory, not its branch. Git will refuse to remove uncommitted changes.\n${removal.path}`} busy={removing} error={removeError} onCancel={() => setRemoval(null)} onConfirm={() => { void confirmRemoval(); }} />}
    </>
  );
};
