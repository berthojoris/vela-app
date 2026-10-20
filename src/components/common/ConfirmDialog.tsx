import React from 'react';
import { useDialog } from '../../lib/useDialog';

export const ConfirmDialog: React.FC<{
  title: string;
  description: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ title, description, busy, error, onCancel, onConfirm }) => {
  const ref = useDialog(true, onCancel, busy);
  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        aria-busy={busy}
        className="w-full max-w-lg p-6 bg-orca-darker border border-orca-border rounded-xl text-sm space-y-4"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p id="confirm-description" className="text-orca-muted whitespace-pre-wrap break-words">
          {description}
        </p>
        {error && (
          <p
            role="alert"
            className="border border-orca-rose/40 rounded-md p-3 whitespace-pre-wrap break-words select-text"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-3 py-2 rounded-md border border-orca-border hover:bg-orca-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-3 py-2 rounded-md border border-orca-rose/50 bg-orca-rose/20 hover:bg-orca-rose/30 font-semibold"
          >
            {busy ? 'Removing…' : 'Remove worktree'}
          </button>
        </div>
      </div>
    </div>
  );
};
