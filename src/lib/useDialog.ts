import { useEffect, useRef } from 'react';

const dialogs: object[] = [];

/** Trap focus, restore it on close, and keep Escape from leaking into the terminal. */
export function useDialog(open: boolean, onClose: () => void, busy = false, restoreFocus: () => boolean = () => true) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const restoreRef = useRef(restoreFocus);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
    restoreRef.current = restoreFocus;
  }, [onClose, busy, restoreFocus]);
  useEffect(() => {
    if (!open) return;
    const token = {};
    dialogs.push(token);
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      if (dialogs[dialogs.length - 1] !== token) return;
      const root = ref.current;
      const target =
        root?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)') ??
        root?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') ??
        root?.querySelector<HTMLElement>('button:not(:disabled), [tabindex="0"]');
      (target ?? root)?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (dialogs[dialogs.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const elements = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
        )
      );
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        ref.current.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !ref.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !ref.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKey, true);
      const index = dialogs.indexOf(token);
      if (index !== -1) dialogs.splice(index, 1);
      if (previous?.isConnected && restoreRef.current()) previous.focus();
    };
  }, [open]);
  return ref;
}
