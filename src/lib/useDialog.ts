import { useEffect, useRef } from 'react';

/** Trap focus, restore it on close, and keep Escape from leaking into the terminal. */
export function useDialog(open: boolean, onClose: () => void, busy = false, restoreFocus: () => boolean = () => true) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const restoreRef = useRef(restoreFocus);
  closeRef.current = onClose;
  busyRef.current = busy;
  restoreRef.current = restoreFocus;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), [tabindex="0"]')?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const elements = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); ref.current.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKey, true);
      if (previous?.isConnected && restoreRef.current()) previous.focus();
    };
  }, [open]);
  return ref;
}
