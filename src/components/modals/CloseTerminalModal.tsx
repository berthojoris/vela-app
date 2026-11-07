import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { TerminalSession } from '../../types';
import { useDialog } from '../../lib/useDialog';

interface CloseTerminalModalProps {
  /** Session awaiting confirmation; `null` keeps the dialog closed. */
  session: TerminalSession | null;
  /** True while the pending close request is in flight. */
  isClosing?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms ending a live terminal session before the tab is closed, so an
 * accidental click or Ctrl+W cannot kill a running shell or agent.
 */
export const CloseTerminalModal: React.FC<CloseTerminalModalProps> = ({
  session,
  isClosing = false,
  onCancel,
  onConfirm,
}) => {
  const isOpen = session !== null;
  const dialogRef = useDialog(isOpen, onCancel, isClosing);

  if (!session) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 text-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-terminal-title"
        aria-describedby="close-terminal-description"
        aria-busy={isClosing}
        className="w-full max-w-sm bg-orca-darker border border-orca-border rounded-xl"
      >
        <header className="p-4 flex items-start gap-3">
          <span
            aria-hidden="true"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md border border-orca-rose/40 text-orca-rose"
          >
            <AlertTriangle className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="close-terminal-title" className="font-semibold">
              {session.exited ? 'Close this tab?' : 'Close a running terminal?'}
            </h2>
            <p id="close-terminal-description" className="mt-1 text-orca-muted break-words">
              <span className="text-orca-text select-text">{session.title}</span>
              {session.exited
                ? ' has already exited. Closing the tab only removes it from the workspace.'
                : session.is_agent
                  ? ' is still running. Closing the tab ends the agent session.'
                  : ' is still running. Closing the tab terminates its process.'}
            </p>
          </div>
        </header>

        <footer className="p-4 pt-0 flex justify-end gap-2">
          <button
            type="button"
            data-autofocus
            disabled={isClosing}
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md border border-orca-border hover:bg-orca-hover disabled:opacity-40"
          >
            Keep open
          </button>
          <button
            type="button"
            disabled={isClosing}
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md font-semibold border border-orca-rose/60 bg-orca-rose/10 text-orca-rose hover:bg-orca-rose/20 disabled:opacity-40"
          >
            {isClosing ? 'Closing…' : 'Close terminal'}
          </button>
        </footer>
      </div>
    </div>
  );
};
