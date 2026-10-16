import React, { useState } from 'react';
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
import { TerminalIcon } from '../terminal/TerminalIcon';

interface WorktreeSidebarProps {
  onOpenCreateModal: () => void;
}

export const WorktreeSidebar: React.FC<WorktreeSidebarProps> = ({ onOpenCreateModal }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const {
    repoPath,
    worktrees,
    activeWorktreeId,
    activeSessionCwd,
    isLoading,
    error,
    refreshWorktrees,
    removeWorktree,
    selectWorktree,
    clearError,
  } = useWorktreeStore();

  const { sessions, activeSessionId, createSession, setActiveSession, profiles } = useTerminalStore();
  const { openDiffModal } = useDiffStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleSelectWorktreeCard = (wt: { id: string; path: string }) => {
    selectWorktree(wt.id);
    const norm = (p: string) => p.trim().replace(/\\/g, '/').toLowerCase();
    const targetPath = norm(wt.path);
    const existing = sessions.find(
      (s) => s.worktree_id === wt.id || norm(s.cwd) === targetPath
    );
    if (existing) {
      setActiveSession(existing.id);
    }
  };

  const handleOpenTerminalInWorktree = (path: string, branch: string, worktreeId: string) => {
    const norm = (p: string) => p.trim().replace(/\\/g, '/').toLowerCase();
    const targetPath = norm(path);
    const existing = sessions.find(
      (s) => s.worktree_id === worktreeId || norm(s.cwd) === targetPath
    );

    if (existing) {
      setActiveSession(existing.id);
      return;
    }

    createSession({
      title: branch,
      cwd: path,
      worktreeId,
    });
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
    <aside className="w-64 bg-orca-darker border-r border-orca-border flex flex-col select-none shrink-0 h-full text-xs">
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

        <div className="flex items-center gap-1">
          <button
            onClick={() => refreshWorktrees()}
            disabled={isLoading || !repoPath}
            className="p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
            title="Refresh Worktrees"
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
                title={activeSessionCwd || 'No Directory'}
              >
                {activeSessionCwd ? activeSessionCwd.split('/').pop() || activeSessionCwd : 'No Directory'}
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

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
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
                        <span className="text-orca-amber bg-orca-amber/10 px-1 rounded">
                          {wt.dirty_files_count} dirty
                        </span>
                      ) : (
                        <span className="text-orca-muted">clean</span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 pt-1.5 border-t border-orca-border/50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTerminalInWorktree(wt.path, wt.branch, wt.id);
                        }}
                        className="flex-1 h-6 rounded bg-orca-hover hover:bg-orca-border text-orca-text hover:text-white flex items-center justify-center gap-1 text-[10px] transition-colors cursor-pointer"
                        title="Open Terminal in this worktree"
                      >
                        <TerminalIcon
                          shell={profiles.find((p) => p.id === 'git-bash')?.executable || profiles[0]?.executable}
                          title={profiles.find((p) => p.id === 'git-bash')?.name || profiles[0]?.name}
                          className="w-3 h-3"
                        />
                        <span>Terminal</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDiffModal(wt.path);
                        }}
                        className="h-6 px-2 rounded bg-orca-hover hover:bg-orca-border text-orca-text hover:text-white flex items-center justify-center gap-1 text-[10px] transition-colors cursor-pointer"
                        title="View Diffs & Commit"
                      >
                        <FileCode2 className="w-3 h-3 text-orca-emerald" />
                        <span>Diff</span>
                      </button>

                      {!wt.is_main && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Remove worktree for branch '${wt.branch}'?`)) {
                              removeWorktree(wt.path);
                            }
                          }}
                          className="h-6 w-6 rounded bg-orca-hover hover:bg-orca-rose/20 text-orca-muted hover:text-orca-rose flex items-center justify-center transition-colors cursor-pointer"
                          title="Remove Worktree"
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
      </div>

      {/* Footer: Create Worktree Button */}
      {repoPath && (
        <div className="p-2 border-t border-orca-border">
          <button
            onClick={onOpenCreateModal}
            className="w-full h-8 rounded-md bg-orca-accent hover:bg-orca-accentHover text-white font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Worktree (Agent)</span>
          </button>
        </div>
      )}
    </aside>
  );
};
