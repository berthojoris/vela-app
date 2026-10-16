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
} from 'lucide-react';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useDiffStore } from '../../stores/useDiffStore';

interface WorktreeSidebarProps {
  onOpenCreateModal: () => void;
}

export const WorktreeSidebar: React.FC<WorktreeSidebarProps> = ({ onOpenCreateModal }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [showPathInput, setShowPathInput] = useState(false);

  const {
    repoPath,
    worktrees,
    activeWorktreeId,
    isLoading,
    setRepoPath,
    refreshWorktrees,
    removeWorktree,
    selectWorktree,
  } = useWorktreeStore();

  const { createSession } = useTerminalStore();
  const { openDiffModal } = useDiffStore();

  const handleOpenTerminalInWorktree = (path: string, branch: string) => {
    createSession({
      title: branch,
      cwd: path,
    });
  };

  const handleSelectRepo = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPath.trim()) {
      setRepoPath(manualPath.trim());
      setShowPathInput(false);
    }
  };

  if (isCollapsed) {
    return (
      <aside className="w-10 bg-orca-darker border-r border-orca-border flex flex-col items-center py-2 select-none shrink-0">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded hover:bg-orca-hover text-orca-muted hover:text-white mb-2 transition-colors"
          title="Expand Worktrees Sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenCreateModal}
          className="p-1.5 rounded bg-orca-accent/20 border border-orca-accent/40 text-orca-accent hover:bg-orca-accent hover:text-white transition-colors"
          title="New Git Worktree"
        >
          <Plus className="w-4 h-4" />
        </button>
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
          {worktrees.length > 0 && (
            <span className="text-[10px] font-mono bg-orca-card px-1.5 rounded text-orca-muted">
              {worktrees.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => refreshWorktrees()}
            disabled={isLoading || !repoPath}
            className="p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white transition-colors"
            title="Refresh Worktrees"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Repo Selector Header */}
      <div className="p-2 border-b border-orca-border bg-orca-card/30">
        {repoPath ? (
          <div className="flex items-center justify-between bg-orca-darkest/70 p-1.5 rounded border border-orca-border">
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderGit2 className="w-3.5 h-3.5 text-orca-accent shrink-0" />
              <span className="truncate font-mono text-[11px] text-orca-text" title={repoPath}>
                {repoPath.split('/').pop() || repoPath}
              </span>
            </div>
            <button
              onClick={() => setShowPathInput(!showPathInput)}
              className="text-[10px] text-orca-muted hover:text-orca-accent px-1"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowPathInput(true)}
            className="w-full h-8 rounded border border-dashed border-orca-border flex items-center justify-center gap-1.5 text-orca-muted hover:text-white hover:border-orca-accent transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Select Git Repo Folder</span>
          </button>
        )}

        {showPathInput && (
          <form onSubmit={handleSelectRepo} className="mt-2 flex gap-1">
            <input
              type="text"
              placeholder="C:/path/to/git-repo"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              className="flex-1 bg-orca-darkest px-2 py-1 rounded border border-orca-border outline-none text-orca-text text-[11px] font-mono"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-orca-accent hover:bg-orca-accentHover text-white rounded text-[11px]"
            >
              Open
            </button>
          </form>
        )}
      </div>

      {/* Worktrees List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {worktrees.map((wt) => {
          const isSelected = wt.id === activeWorktreeId;

          return (
            <div
              key={wt.id}
              onClick={() => selectWorktree(wt.id)}
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
                    handleOpenTerminalInWorktree(wt.path, wt.branch);
                  }}
                  className="flex-1 h-6 rounded bg-orca-hover hover:bg-orca-border text-orca-text hover:text-white flex items-center justify-center gap-1 text-[10px] transition-colors"
                  title="Open Terminal in this worktree"
                >
                  <Terminal className="w-3 h-3 text-orca-accent" />
                  <span>Terminal</span>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDiffModal(wt.path);
                  }}
                  className="h-6 px-2 rounded bg-orca-hover hover:bg-orca-border text-orca-text hover:text-white flex items-center justify-center gap-1 text-[10px] transition-colors"
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
                    className="h-6 w-6 rounded bg-orca-hover hover:bg-orca-rose/20 text-orca-muted hover:text-orca-rose flex items-center justify-center transition-colors"
                    title="Remove Worktree"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {worktrees.length === 0 && repoPath && (
          <div className="p-4 text-center text-orca-muted text-[11px]">
            No worktrees found. Click below to add an isolated worktree for your agent.
          </div>
        )}
      </div>

      {/* Footer: Create Worktree Button */}
      {repoPath && (
        <div className="p-2 border-t border-orca-border">
          <button
            onClick={onOpenCreateModal}
            className="w-full h-8 rounded-md bg-orca-accent hover:bg-orca-accentHover text-white font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Worktree (Agent)</span>
          </button>
        </div>
      )}
    </aside>
  );
};
