import { useDialog } from '../../lib/useDialog';

export function UnsavedDialog({
  name,
  busy,
  error,
  onCancel,
  onDiscard,
  onSave,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const ref = useDialog(true, onCancel, busy);
  return (
    <div className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-4">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-description"
        aria-busy={busy}
        className="w-full max-w-lg p-6 bg-orca-darker border border-orca-border rounded-xl text-sm space-y-4"
      >
        <h2 id="unsaved-title" className="text-lg font-semibold">
          Save your changes?
        </h2>
        <p id="unsaved-description" className="text-orca-muted break-words">
          Changes to {name} will be lost if you close without saving.
        </p>
        {error && (
          <p role="alert" className="text-orca-rose break-words select-text">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            disabled={busy}
            onClick={onDiscard}
            className="px-3 py-2 rounded border border-orca-border text-orca-rose hover:bg-orca-hover disabled:opacity-40"
          >
            Don&apos;t Save
          </button>
          <button
            disabled={busy}
            onClick={onCancel}
            data-autofocus
            className="px-3 py-2 rounded border border-orca-border hover:bg-orca-hover disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={onSave}
            className="px-3 py-2 rounded bg-orca-accent hover:bg-orca-accentHover text-white disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
