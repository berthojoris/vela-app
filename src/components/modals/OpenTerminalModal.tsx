import React, { useState, useEffect, useRef } from 'react';
import { Folder, FolderOpen, Terminal, X, Columns2, Check, Loader2 } from 'lucide-react';
import { TerminalIcon } from '../terminal/TerminalIcon';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { tauriIpc } from '../../lib/tauriIpc';
import { errorMessage } from '../../lib/errors';
import { useDialog } from '../../lib/useDialog';
import { formatTabTitle } from '../../lib/shellIntegration';

interface OpenTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDirectory?: string;
  initialProfileId?: string;
}

export const OpenTerminalModal: React.FC<OpenTerminalModalProps> = ({
  isOpen,
  onClose,
  initialDirectory,
  initialProfileId,
}) => {
  const { profiles, createSession, setSplitMode, sessions, defaultProfileId, fetchProfiles } = useTerminalStore();

  const { repoPath, worktrees, activeWorktreeId } = useWorktreeStore();
  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId);

  const [targetDir, setTargetDir] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [openInSplit, setOpenInSplit] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const launchingRef = useRef(false);
  const launchedRef = useRef(false);
  const dialogRef = useDialog(isOpen, onClose, isLaunching || isBrowsing, () => !launchedRef.current);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  // Set default initial directory ONLY when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const defaultDir = initialDirectory || activeWorktree?.path || repoPath || '';
      setTargetDir(defaultDir);
      launchedRef.current = false;
      setError(null);
      setOpenInSplit(false);

      if (initialProfileId) {
        setSelectedProfileId(initialProfileId);
      } else if (defaultProfileId && profiles.some((profile) => profile.id === defaultProfileId)) {
        setSelectedProfileId(defaultProfileId);
      } else if (profiles.length > 0) {
        setSelectedProfileId(profiles[0].id);
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialDirectory, initialProfileId, activeWorktree?.path, defaultProfileId, profiles, repoPath]);

  // Profiles load asynchronously: only fill an empty selection. An explicitly
  // requested profile that is missing stays missing so the launch button stays
  // disabled instead of silently starting a different shell.
  useEffect(() => {
    if (!isOpen || initialProfileId || selectedProfileId || profiles.length === 0) return;
    const fallback = profiles.find((profile) => profile.id === defaultProfileId) ?? profiles[0];
    setSelectedProfileId(fallback.id);
  }, [isOpen, initialProfileId, profiles, selectedProfileId, defaultProfileId]);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    if (isBrowsing) return;
    setIsBrowsing(true);
    try {
      const selected = await tauriIpc.selectDirectory({
        title: 'Select Directory for Terminal',
        defaultPath: targetDir || repoPath || undefined,
      });
      if (selected) {
        setTargetDir(selected);
      }
    } catch (err) {
      setError(errorMessage(err, 'Unable to open the folder picker. Type the directory path instead.'));
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleLaunch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (launchingRef.current || isBrowsing) return;
    launchingRef.current = true;
    setIsLaunching(true);
    setError(null);
    try {
      const finalDir = targetDir.trim();

      const profile = profiles.find((p) => p.id === selectedProfileId);
      if (!profile)
        throw new Error('Select an available shell or agent. If it is missing, install it and reload profiles.');
      const previousActive = useTerminalStore.getState().activeSessionId;

      let matchedWorktreeId: string | undefined = undefined;
      let matchedBranch: string | undefined = undefined;
      if (finalDir) {
        const normFinal = finalDir.trim().replace(/\\/g, '/').toLowerCase();
        const wt = worktrees.find((w) => w.path.trim().replace(/\\/g, '/').toLowerCase() === normFinal);
        if (wt) {
          matchedWorktreeId = wt.id;
          matchedBranch = wt.branch;
        }
      }

      // Determine tab title
      let title = formatTabTitle(profile?.name || 'Terminal');
      if (matchedBranch) {
        title = formatTabTitle(profile?.name || 'Terminal', matchedBranch);
      } else if (activeWorktree && finalDir === activeWorktree.path) {
        title = formatTabTitle(profile?.name || 'Terminal', activeWorktree.branch);
      } else if (finalDir) {
        const folderName = finalDir.split('/').pop() || finalDir;
        title = formatTabTitle(profile?.name || 'Terminal', folderName);
      }

      await createSession({
        shell: profile?.executable,
        args: profile?.args,
        title,
        cwd: finalDir,
        worktreeId: matchedWorktreeId,
        isAgent: profile?.is_agent,
        agentType: profile.agent_type,
      });

      if (openInSplit && sessions.length > 0) {
        setSplitMode('vertical');
        if (previousActive) useTerminalStore.getState().setSecondarySession(previousActive);
      }

      launchedRef.current = true;
      onClose();
    } catch (error) {
      setError(errorMessage(error, 'Unable to launch terminal. Check the executable and directory, then try again.'));
    } finally {
      launchingRef.current = false;
      setIsLaunching(false);
    }
  };

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const requestedProfileMissing =
    Boolean(initialProfileId) && profiles.length > 0 && !profiles.some((profile) => profile.id === initialProfileId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none text-xs"
      onClick={() => {
        if (!isLaunching && !isBrowsing) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-terminal-title"
        aria-busy={isLaunching}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-orca-darker border border-orca-border rounded-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-orca-border flex items-center justify-between bg-orca-card/60">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-orca-accent/20 border border-orca-accent/40 flex items-center justify-center text-orca-accent">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <h3 id="open-terminal-title" className="font-semibold text-white text-sm">
              Open Terminal in Directory
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLaunching || isBrowsing}
            aria-label="Close terminal dialog"
            className="w-7 h-7 rounded hover:bg-orca-hover text-orca-muted hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleLaunch} className="p-4 space-y-4">
          {error && (
            <p
              role="alert"
              className="p-3 border border-orca-rose/40 rounded-md text-sm text-orca-text whitespace-pre-wrap break-words select-text"
            >
              {error}
            </p>
          )}
          {requestedProfileMissing && !error && (
            <p
              role="status"
              className="p-3 border border-orca-amber/40 rounded-md text-sm text-orca-text whitespace-pre-wrap break-words select-text"
            >
              The requested agent is not installed or not available on PATH. Install it, then reload profiles, or choose
              an installed profile below.
            </p>
          )}
          <fieldset disabled={isLaunching || isBrowsing} className="space-y-4 min-w-0">
            {/* 1. Target Directory Input with Native Browse */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-orca-muted font-medium flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-orca-accent" />
                  <span>Working Directory Path</span>
                </label>
                <span className="text-[10px] text-orca-muted font-mono">Press Enter to Launch</span>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  data-autofocus
                  ref={inputRef}
                  aria-label="Working directory path"
                  type="text"
                  placeholder="C:/path/to/project or leave empty for default"
                  value={targetDir}
                  onChange={(e) => setTargetDir(e.target.value)}
                  className="flex-1 bg-orca-darkest px-3 py-2 rounded-md border border-orca-border focus:border-orca-accent outline-none text-white text-xs font-mono placeholder:text-orca-muted/60"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={isBrowsing}
                  aria-busy={isBrowsing}
                  aria-label={isBrowsing ? 'Browsing for directory' : 'Browse for directory'}
                  className="h-8 px-3 rounded-md bg-orca-card hover:bg-orca-hover border border-orca-border text-orca-text hover:text-white flex items-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orca-card disabled:hover:text-orca-text"
                  title="Browse Windows Folder..."
                >
                  {isBrowsing ? (
                    <Loader2 className="w-3.5 h-3.5 text-orca-accent animate-spin" />
                  ) : (
                    <FolderOpen className="w-3.5 h-3.5 text-orca-accent" />
                  )}
                  <span>Browse</span>
                </button>
              </div>
            </div>

            {/* 2. Launch Profile Selector */}
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
                            ? 'bg-orca-emerald/20 border-orca-emerald/60 text-emerald-300 font-semibold'
                            : 'bg-orca-accent/20 border-orca-accent/60 text-white font-semibold'
                          : 'bg-orca-card/40 border-orca-border text-orca-muted hover:text-white hover:bg-orca-hover'
                      }`}
                    >
                      <TerminalIcon
                        shell={p.executable}
                        title={p.name}
                        isAgent={p.is_agent}
                        agentType={p.agent_type}
                        className="w-3.5 h-3.5"
                      />
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  void fetchProfiles();
                }}
                className="mt-2 underline text-orca-muted hover:text-white"
              >
                Reload profiles
              </button>
            </div>

            {/* 3. Split Screen Option */}
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
          </fieldset>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-orca-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLaunching || isBrowsing}
              className="h-8 px-3 rounded-md hover:bg-orca-hover text-orca-muted hover:text-white transition-colors"
            >
              Cancel (Esc)
            </button>
            <button
              type="submit"
              disabled={isLaunching || isBrowsing || !selectedProfile}
              aria-busy={isLaunching}
              className="h-8 px-4 rounded-md bg-orca-accent hover:bg-orca-accentHover text-white font-medium flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isLaunching ? 'Launching…' : 'Launch Terminal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
