import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect } from 'react';
import { Minus, X, GitBranch, FolderGit2 } from 'lucide-react';
import { tauriIpc } from '../../lib/tauriIpc';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import velaLogo from '../../assets/vela_logo.webp';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { CloseAppModal } from '../modals/CloseAppModal';
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
  // `null` until the native window reports its state. The drag regions stay
  // disabled while the state is unknown, because the window starts maximized
  // (tauri.conf.json) and dragging a maximized window restores it: Tauri's
  // start_dragging sends WM_NCLBUTTONDOWN/HTCAPTION, which Windows answers by
  // unmaximizing and moving the window.
  const [isMaximized, setIsMaximized] = useState<boolean | null>(null);
  const [closeAppOpen, setCloseAppOpen] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void tauriIpc
      .onAppCloseRequested(() => setCloseAppOpen(true))
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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

  const handleClose = () => {
    setCloseAppOpen(true);
  };

  const handleConfirmQuit = async () => {
    try {
      await tauriIpc.closeWindow(false, true);
      setCloseAppOpen(false);
    } catch (error) {
      setCloseAppOpen(false);
      useNoticeStore.getState().report('Unable to close window', error);
    }
  };

  const { sessions, activeSessionId } = useTerminalStore(
    useShallow((state) => ({ sessions: state.sessions, activeSessionId: state.activeSessionId }))
  );
  const { repoPath, worktrees, activeWorktreeId, activeSessionCwd } = useWorktreeStore(
    useShallow((state) => ({
      repoPath: state.repoPath,
      worktrees: state.worktrees,
      activeWorktreeId: state.activeWorktreeId,
      activeSessionCwd: state.activeSessionCwd,
    }))
  );
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const currentCwd = activeSession?.cwd || activeSessionCwd;
  const runningCount = sessions.filter((s) => !s.exited).length;

  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId);

  // Only enable the native drag regions once the window is known to be in the
  // restored state. Tauri's "false" value disables dragging for the element and
  // any descendant, so a maximized window can never be dragged loose.
  const dragRegion = isMaximized === false ? 'true' : 'false';

  return (
    <header
      data-tauri-drag-region={dragRegion}
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
      <div data-tauri-drag-region={dragRegion} className="flex-1 h-full mx-4 cursor-default" />

      {/* Right: Window Controls — flush to top, bottom, and right edge (Fitts's Law) with macOS terminal colors */}
      <div
        className="group/ctl flex items-stretch h-full pr-3 shrink-0 pointer-events-auto"
        role="group"
        aria-label="Window controls"
      >
        {/* Minimize Button (macOS Yellow) */}
        <button
          type="button"
          onClick={handleMinimize}
          className="h-full w-5 flex items-center justify-center rounded-none bg-transparent"
          title="Minimize"
          aria-label="Minimize"
        >
          <span className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] flex items-center justify-center text-[#4A3000]/80">
            <Minus className="w-2 h-2 stroke-[1.5] opacity-0 group-hover/ctl:opacity-100 transition-opacity" />
          </span>
        </button>

        {/* Maximize / Restore Button (macOS Green) */}
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="h-full w-5 flex items-center justify-center rounded-none bg-transparent"
          title={isMaximized ? 'Restore Down' : 'Maximize'}
          aria-label={isMaximized ? 'Restore Down' : 'Maximize'}
        >
          <span className="w-3.5 h-3.5 rounded-full bg-[#28C840] flex items-center justify-center text-[#083B0F]/80">
            {isMaximized ? (
              /* Restore Down Icon (inward arrows) */
              <svg
                className="w-2 h-2 opacity-0 group-hover/ctl:opacity-100 transition-opacity"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="4.75 2 4.75 4.75 2 4.75" />
                <polyline points="7.25 10 7.25 7.25 10 7.25" />
              </svg>
            ) : (
              /* macOS Zoom Icon (two opposing triangles) */
              <svg
                className="w-2 h-2 opacity-0 group-hover/ctl:opacity-100 transition-opacity"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                <path d="M2.6 2h3.9L2 6.5V2.6c0-.33.27-.6.6-.6Zm6.8 8H5.5L10 5.5v3.9c0 .33-.27.6-.6.6Z" />
              </svg>
            )}
          </span>
        </button>

        {/* Close Button (macOS Red) — flush with top-right corner */}
        <button
          type="button"
          onClick={handleClose}
          className="h-full w-5 flex items-center justify-center rounded-none bg-transparent"
          title="Close"
          aria-label="Close"
        >
          <span className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] flex items-center justify-center text-[#4D0000]/80">
            <X className="w-2 h-2 stroke-[1.5] opacity-0 group-hover/ctl:opacity-100 transition-opacity" />
          </span>
        </button>
      </div>
      <CloseAppModal
        isOpen={closeAppOpen}
        runningCount={runningCount}
        onCancel={() => setCloseAppOpen(false)}
        onConfirm={() => void handleConfirmQuit()}
      />
    </header>
  );
};
