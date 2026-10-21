import React, { useState, useEffect } from 'react';
import { Minus, X, GitBranch, FolderGit2 } from 'lucide-react';
import { tauriIpc } from '../../lib/tauriIpc';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import velaLogo from '../../assets/vela_logo.webp';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { describeDisplayPath, pathCharBudget } from '../../lib/formatPath';

/** Character budget that follows the window width so paths compact before clipping. */
function usePathCharBudget(): number {
  const [budget, setBudget] = useState(() => pathCharBudget(typeof window === 'undefined' ? 1280 : window.innerWidth));

  useEffect(() => {
    const update = () => setBudget(pathCharBudget(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return budget;
}

/**
 * Full path of the active project. The directory prefix is dimmed and the
 * final folder name stays bright. Long paths compact their middle segments into
 * "..." (e.g. C:\DEKSTOP\LARAVELPACKAGE\...\folder-project) instead of being
 * clipped, and the tooltip always carries the untouched full path.
 */
const PathLabel: React.FC<{ path: string; muted?: boolean }> = ({ path, muted }) => {
  const budget = usePathCharBudget();
  const { display, dir, name, expanded } = describeDisplayPath(path, budget);
  if (!display) return null;

  return (
    <span
      className="flex min-w-0 max-w-[min(52vw,560px)] items-baseline whitespace-nowrap font-mono text-[11px] leading-none"
      title={expanded}
    >
      {dir && <span className="min-w-0 truncate text-orca-muted/80">{dir}</span>}
      <span className={`max-w-full shrink-0 truncate font-medium ${muted ? 'text-orca-text/80' : 'text-orca-text'}`}>
        {name}
      </span>
    </span>
  );
};

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const update = () => {
      void tauriIpc
        .isWindowMaximized()
        .then((value) => {
          if (!disposed) setIsMaximized(value);
        })
        .catch((error) => {
          if (!disposed) useNoticeStore.getState().report('Unable to read window state', error);
        });
    };
    update();
    void tauriIpc
      .onWindowResized(update)
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => {
        if (!disposed) useNoticeStore.getState().report('Unable to watch window state', error);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const handleMinimize = async () => {
    try {
      await tauriIpc.minimizeWindow();
    } catch (error) {
      useNoticeStore.getState().report('Unable to minimize window', error);
    }
  };

  const handleToggleMaximize = async () => {
    try {
      setIsMaximized(await tauriIpc.toggleMaximize());
    } catch (error) {
      useNoticeStore.getState().report('Unable to resize window', error);
    }
  };

  const handleClose = async () => {
    try {
      await tauriIpc.closeWindow();
    } catch (error) {
      useNoticeStore.getState().report('Unable to close window', error);
    }
  };

  const { sessions, activeSessionId } = useTerminalStore();
  const { repoPath, worktrees, activeWorktreeId, activeSessionCwd } = useWorktreeStore();
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const currentCwd = activeSession?.cwd || activeSessionCwd;

  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId);

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) return;
        void handleToggleMaximize();
      }}
      className="h-10 shrink-0 bg-orca-darker border-b border-orca-border flex items-center justify-between px-3 select-none z-50 text-xs"
    >
      {/* Left: Branding & Active Project Info */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <div className="flex items-center gap-2 font-semibold text-orca-text">
          <img src={velaLogo} alt="Vela" className="w-5 h-5 object-contain" />
          <span className="tracking-tight font-bold text-white text-[13px]">Vela</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-orca-card border border-orca-border text-orca-muted">
            ADE
          </span>
        </div>

        {repoPath ? (
          <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-orca-border text-orca-muted min-w-0">
            <FolderGit2 className="w-3.5 h-3.5 shrink-0 text-orca-accent" />
            <PathLabel path={repoPath} />

            {activeWorktree && (
              <div className="flex items-center gap-1 shrink-0 bg-orca-card px-2 py-0.5 rounded border border-orca-border text-[11px] text-orca-emerald font-mono">
                <GitBranch className="w-3 h-3" />
                <span>{activeWorktree.branch}</span>
              </div>
            )}
          </div>
        ) : currentCwd ? (
          <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-orca-border text-orca-muted min-w-0">
            <PathLabel path={currentCwd} muted />
          </div>
        ) : null}
      </div>

      {/* Middle: Drag Region Filler */}
      <div data-tauri-drag-region className="flex-1 h-full mx-4 cursor-default" />

      {/* Right: Window Controls */}
      <div className="flex items-center gap-1 -mr-1 pointer-events-auto">
        {/* Minimize Button */}
        <button
          onClick={handleMinimize}
          className="w-8 h-7 flex items-center justify-center text-orca-muted hover:text-orca-text hover:bg-orca-hover rounded transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Maximize / Restore Button with Distinct Icons */}
        <button
          onClick={handleToggleMaximize}
          className="w-8 h-7 flex items-center justify-center text-orca-muted hover:text-orca-text hover:bg-orca-hover rounded transition-colors"
          title={isMaximized ? 'Restore Down' : 'Maximize'}
        >
          {isMaximized ? (
            /* Windows Restore Down Icon (Two overlapping squares) */
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
              {/* Back offset square */}
              <path
                d="M5.5 4.5V2.75C5.5 2.33579 5.83579 2 6.25 2H13.25C13.6642 2 14 2.33579 14 2.75V9.75C14 10.1642 13.6642 10.5 13.25 10.5H11.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Front main square */}
              <rect x="2" y="5" width="9" height="9" rx="0.75" />
            </svg>
          ) : (
            /* Windows Maximize Icon (Single square) */
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1" />
            </svg>
          )}
        </button>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="w-8 h-7 flex items-center justify-center text-orca-muted hover:text-white hover:bg-orca-rose rounded transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
