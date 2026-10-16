import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  FolderGit2,
  GitBranch,
  Terminal,
  Bot,
  Sparkles,
  X,
  History,
  Columns2,
  Check,
} from 'lucide-react';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { tauriIpc } from '../../lib/tauriIpc';

interface OpenTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDirectory?: string;
}

export const OpenTerminalModal: React.FC<OpenTerminalModalProps> = ({
  isOpen,
  onClose,
  initialDirectory,
}) => {
  const {
    profiles,
    createSession,
    recentDirectories,
    addRecentDirectory,
    setSplitMode,
    sessions,
  } = useTerminalStore();

  const { repoPath, worktrees, activeWorktreeId } = useWorktreeStore();
  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId);

  const [targetDir, setTargetDir] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('pwsh');
  const [openInSplit, setOpenInSplit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Set default initial directory when modal opens
  useEffect(() => {
    if (isOpen) {
      const defaultDir =
        initialDirectory ||
        activeWorktree?.path ||
        repoPath ||
        recentDirectories[0] ||
        '';
      setTargetDir(defaultDir);

      if (profiles.length > 0 && !selectedProfileId) {
        setSelectedProfileId(profiles[0].id);
      }

      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialDirectory, activeWorktree, repoPath, profiles]);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    try {
      const selected = await tauriIpc.selectDirectory();
      if (selected) {
        setTargetDir(selected);
      }
    } catch (err) {
      console.error('Failed to open directory dialog', err);
    }
  };

  const handleLaunch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalDir = targetDir.trim();

    if (finalDir) {
      addRecentDirectory(finalDir);
    }

    const profile =
      profiles.find((p) => p.id === selectedProfileId) || profiles[0];

    // Determine tab title
    let title = profile?.name || 'Terminal';
    if (activeWorktree && finalDir === activeWorktree.path) {
      title = activeWorktree.branch;
    } else if (finalDir) {
      const folderName = finalDir.split('/').pop() || finalDir;
      title = `${profile?.name || 'Term'} (${folderName})`;
    }

    const newSession = await createSession({
      shell: profile?.executable,
      args: profile?.args,
      title,
      cwd: finalDir,
      isAgent: profile?.is_agent,
      agentType: profile?.agent_type as any,
    });

    if (openInSplit && sessions.length > 0) {
      setSplitMode('vertical');
    }

    onClose();
  };

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none text-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-orca-darker border border-orca-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-orca-border flex items-center justify-between bg-orca-card/60">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-orca-accent/20 border border-orca-accent/40 flex items-center justify-center text-orca-accent">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-semibold text-white text-sm">
              Open Terminal in Directory
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-orca-hover text-orca-muted hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleLaunch} className="p-4 space-y-4">
          {/* 1. Target Directory Input with Native Browse */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-orca-muted font-medium flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-orca-accent" />
                <span>Working Directory Path</span>
              </label>
              <span className="text-[10px] text-orca-muted font-mono">
                Press Enter to Launch
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                placeholder="C:/path/to/project or leave empty for default"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                className="flex-1 bg-orca-darkest px-3 py-2 rounded-md border border-orca-border focus:border-orca-accent outline-none text-white text-xs font-mono placeholder:text-orca-muted/60"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                className="h-8 px-3 rounded-md bg-orca-card hover:bg-orca-hover border border-orca-border text-orca-text hover:text-white flex items-center gap-1.5 font-medium transition-colors"
                title="Browse Windows Folder..."
              >
                <FolderOpen className="w-3.5 h-3.5 text-orca-accent" />
                <span>Browse</span>
              </button>
            </div>
          </div>

          {/* 2. Quick Directory Presets */}
          <div>
            <span className="text-[10px] uppercase font-mono font-semibold text-orca-muted tracking-wider block mb-1.5">
              Quick Directory Presets
            </span>

            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {/* Active Worktree */}
              {activeWorktree && (
                <button
                  type="button"
                  onClick={() => setTargetDir(activeWorktree.path)}
                  className={`w-full px-2.5 py-1.5 rounded-md flex items-center justify-between border text-left transition-colors ${
                    targetDir === activeWorktree.path
                      ? 'bg-orca-accent/15 border-orca-accent/50 text-white font-medium'
                      : 'bg-orca-card/30 border-orca-border hover:bg-orca-card text-orca-text'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <GitBranch className="w-3.5 h-3.5 text-orca-emerald shrink-0" />
                    <span className="truncate">{activeWorktree.branch}</span>
                    <span className="text-[9px] bg-orca-emerald/10 text-orca-emerald px-1.5 py-0.5 rounded border border-orca-emerald/30 font-mono">
                      Active Worktree
                    </span>
                  </div>
                  <span className="text-[10px] text-orca-muted font-mono truncate max-w-[150px]">
                    {activeWorktree.name}
                  </span>
                </button>
              )}

              {/* Main Git Repository */}
              {repoPath && (
                <button
                  type="button"
                  onClick={() => setTargetDir(repoPath)}
                  className={`w-full px-2.5 py-1.5 rounded-md flex items-center justify-between border text-left transition-colors ${
                    targetDir === repoPath
                      ? 'bg-orca-accent/15 border-orca-accent/50 text-white font-medium'
                      : 'bg-orca-card/30 border-orca-border hover:bg-orca-card text-orca-text'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FolderGit2 className="w-3.5 h-3.5 text-orca-accent shrink-0" />
                    <span className="truncate font-semibold">
                      {repoPath.split('/').pop() || 'Repository'}
                    </span>
                    <span className="text-[9px] bg-orca-card text-orca-muted px-1.5 py-0.5 rounded border border-orca-border font-mono">
                      Repo Root
                    </span>
                  </div>
                  <span className="text-[10px] text-orca-muted font-mono truncate max-w-[150px]">
                    {repoPath}
                  </span>
                </button>
              )}

              {/* Other Worktrees */}
              {worktrees
                .filter((w) => w.id !== activeWorktreeId)
                .map((wt) => (
                  <button
                    key={wt.id}
                    type="button"
                    onClick={() => setTargetDir(wt.path)}
                    className={`w-full px-2.5 py-1.5 rounded-md flex items-center justify-between border text-left transition-colors ${
                      targetDir === wt.path
                        ? 'bg-orca-accent/15 border-orca-accent/50 text-white font-medium'
                        : 'bg-orca-card/30 border-orca-border hover:bg-orca-card text-orca-text'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <GitBranch className="w-3.5 h-3.5 text-orca-accent/70 shrink-0" />
                      <span className="truncate">{wt.branch}</span>
                    </div>
                    <span className="text-[10px] text-orca-muted font-mono truncate max-w-[150px]">
                      {wt.name}
                    </span>
                  </button>
                ))}

              {/* Recent Directories */}
              {recentDirectories.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setTargetDir(dir)}
                  className={`w-full px-2.5 py-1.5 rounded-md flex items-center justify-between border text-left transition-colors ${
                    targetDir === dir
                      ? 'bg-orca-accent/15 border-orca-accent/50 text-white font-medium'
                      : 'bg-orca-card/20 border-orca-border hover:bg-orca-card text-orca-text'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <History className="w-3.5 h-3.5 text-orca-muted shrink-0" />
                    <span className="truncate text-orca-muted" title={dir}>
                      {dir}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Launch Profile Selector */}
          <div>
            <span className="text-[10px] uppercase font-mono font-semibold text-orca-muted tracking-wider block mb-1.5">
              Launch Shell / Agent
            </span>

            <div className="flex flex-wrap gap-1.5">
              {profiles.map((p) => {
                const isSelected = selectedProfileId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProfileId(p.id)}
                    className={`h-7 px-2.5 rounded-md border flex items-center gap-1.5 text-xs transition-colors ${
                      isSelected
                        ? p.is_agent
                          ? 'bg-orca-emerald/20 border-orca-emerald/60 text-emerald-300 font-semibold shadow-sm'
                          : 'bg-orca-accent/20 border-orca-accent/60 text-white font-semibold shadow-sm'
                        : 'bg-orca-card/40 border-orca-border text-orca-muted hover:text-white hover:bg-orca-hover'
                    }`}
                  >
                    {p.is_agent ? (
                      <Bot className="w-3 h-3 text-orca-emerald" />
                    ) : (
                      <Terminal className="w-3 h-3 text-orca-muted" />
                    )}
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Split Screen Option */}
          {sessions.length > 0 && (
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-orca-muted hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={openInSplit}
                  onChange={(e) => setOpenInSplit(e.target.checked)}
                  className="rounded border-orca-border text-orca-accent bg-orca-darkest focus:ring-0"
                />
                <span className="flex items-center gap-1.5">
                  <Columns2 className="w-3.5 h-3.5 text-orca-accent" />
                  <span>Open in split pane (side-by-side with current tab)</span>
                </span>
              </label>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 border-t border-orca-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md hover:bg-orca-hover text-orca-muted hover:text-white transition-colors"
            >
              Cancel (Esc)
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded-md bg-orca-accent hover:bg-orca-accentHover text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Launch Terminal</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
