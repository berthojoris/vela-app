import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDialog } from '../../lib/useDialog';

interface CloseAppModalProps {
  isOpen: boolean;
  /** Live terminal/agent sessions that quitting will terminate. */
  runningCount: number;
  isClosing?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms quitting Vela before the window closes, so an accidental click,
 * Alt+F4, or taskbar close cannot kill running shells and agents.
 */
export const CloseAppModal: React.FC<CloseAppModalProps> = ({
  isOpen,
  runningCount,
  isClosing = false,
  onCancel,
  onConfirm,
}) => {
  const dialogRef = useDialog(isOpen, onCancel, isClosing);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 text-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-app-title"
        aria-describedby="close-app-description"
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
          <div className="min-w-0">
            <h2 id="close-app-title" className="text-lg font-semibold">
              Quit Vela?
            </h2>
            <p id="close-app-description" className="text-orca-muted whitespace-pre-wrap break-words">
              {runningCount > 0
                ? `${runningCount} terminal ${
                    runningCount === 1 ? 'session is' : 'sessions are'
                  } still running. Quitting terminates ${runningCount === 1 ? 'its process' : 'their processes'}.`
                : 'Quitting closes the window and terminates every terminal session.'}
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
            {isClosing ? 'Quitting…' : 'Quit Vela'}
          </button>
        </footer>
      </div>
    </div>
  );
};
