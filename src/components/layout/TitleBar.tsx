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
      className="h-10 shrink-0 bg-orca-darker border-b border-orca-border flex items-center justify-between pl-3 pr-0 select-none z-50 text-xs"
    >
      {/* Left: Branding & Active Project Info */}
      <div className="flex items-center gap-3 min-w-0 pointer-events-auto">
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

      {/* Right: Window Controls — flush to top, bottom, and right edge (Fitts's Law) with macOS terminal colors */}
      <div className="flex items-stretch h-full shrink-0 pointer-events-auto" role="group" aria-label="Window controls">
        {/* Minimize Button (macOS Yellow) */}
        <button
          type="button"
          onClick={handleMinimize}
          className="group h-full w-11 flex items-center justify-center rounded-none hover:bg-[#FEBC2E]/15 active:bg-[#FEBC2E]/25 transition-colors"
          title="Minimize"
          aria-label="Minimize"
        >
          <span className="w-4 h-4 rounded-full bg-[#FEBC2E] border border-[#DFA023] flex items-center justify-center text-[#4A3000] transition-transform group-hover:scale-110">
            <Minus className="w-2.5 h-2.5 stroke-[2.5]" />
          </span>
        </button>

        {/* Maximize / Restore Button (macOS Green) */}
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="group h-full w-11 flex items-center justify-center rounded-none hover:bg-[#28C840]/15 active:bg-[#28C840]/25 transition-colors"
          title={isMaximized ? 'Restore Down' : 'Maximize'}
          aria-label={isMaximized ? 'Restore Down' : 'Maximize'}
        >
          <span className="w-4 h-4 rounded-full bg-[#28C840] border border-[#1AAB29] flex items-center justify-center text-[#083B0F] transition-transform group-hover:scale-110">
            {isMaximized ? (
              /* Restore Down Icon (Inward arrows) */
              <svg
                className="w-2.5 h-2.5"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="4.25 1.5 4.25 4.25 1.5 4.25" />
                <polyline points="7.75 10.5 7.75 7.75 10.5 7.75" />
              </svg>
            ) : (
              /* macOS Maximize / Zoom Icon (Opposing diagonal triangles) */
              <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2.5 2h4.2L2 6.7V2.5C2 2.22 2.22 2 2.5 2Zm7 8H5.3L10 5.3v4.2c0 .28-.22.5-.5.5Z" />
              </svg>
            )}
          </span>
        </button>

        {/* Close Button (macOS Red) — flush with top-right corner */}
        <button
          type="button"
          onClick={handleClose}
          className="group h-full w-11 flex items-center justify-center rounded-none hover:bg-[#FF5F57]/20 active:bg-[#FF5F57]/30 transition-colors"
          title="Close"
          aria-label="Close"
        >
          <span className="w-4 h-4 rounded-full bg-[#FF5F57] border border-[#E0443E] flex items-center justify-center text-[#4D0000] transition-transform group-hover:scale-110">
            <X className="w-2.5 h-2.5 stroke-[2.5]" />
          </span>
        </button>
      </div>
    </header>
  );
};
