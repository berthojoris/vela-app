import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { tauriIpc } from '../../lib/tauriIpc';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { AntigravityIcon, CursorIcon } from '../terminal/TerminalIcon';

/** Quick IDE launchers for the active terminal's directory. */
export const IdeLauncherButtons: React.FC<{ className?: string }> = ({ className }) => {
  const { sessions, activeSessionId } = useTerminalStore(
    useShallow((state) => ({ sessions: state.sessions, activeSessionId: state.activeSessionId }))
  );
  const activeSessionCwd = useWorktreeStore((state) => state.activeSessionCwd);
  const currentCwd = sessions.find((s) => s.id === activeSessionId)?.cwd || activeSessionCwd;

  const [openingIde, setOpeningIde] = useState<string | null>(null);
  const handleOpenInIde = async (ide: 'antigravity' | 'cursor') => {
    if (!currentCwd || openingIde) return;
    setOpeningIde(ide);
    try {
      await tauriIpc.openInIde(currentCwd, ide);
    } catch (error) {
      useNoticeStore
        .getState()
        .report(`Unable to open with ${ide === 'antigravity' ? 'Antigravity' : 'Cursor'}`, error);
    } finally {
      setOpeningIde(null);
    }
  };

  if (!currentCwd) return null;

  return (
    <div className={`flex items-center gap-0.5 shrink-0 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => {
          void handleOpenInIde('antigravity');
        }}
        disabled={openingIde !== null}
        className="h-7 w-7 flex items-center justify-center rounded text-orca-muted hover:text-white hover:bg-orca-card transition-colors disabled:opacity-50 cursor-pointer"
        title={`Open with AG: ${currentCwd}`}
        aria-label="Open active directory with Antigravity"
      >
        <AntigravityIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          void handleOpenInIde('cursor');
        }}
        disabled={openingIde !== null}
        className="h-7 w-7 flex items-center justify-center rounded text-orca-muted hover:text-white hover:bg-orca-card transition-colors disabled:opacity-50 cursor-pointer"
        title={`Open with Cursor: ${currentCwd}`}
        aria-label="Open active directory with Cursor"
      >
        <CursorIcon className="w-4 h-4" />
      </button>
    </div>
  );
};
