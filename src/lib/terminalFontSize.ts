/** Terminal font size shared by every mounted pane and persisted across restarts. */
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
const STORAGE_KEY = 'vela_terminal_font_size';
const MIN_SIZE = 9;
const MAX_SIZE = 24;
const CHANGE_EVENT = 'vela-terminal-font-size';

const clamp = (size: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));

export function getTerminalFontSize(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : DEFAULT_TERMINAL_FONT_SIZE;
  } catch {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
}

/** Clamps, persists, and notifies every live terminal. Returns the applied size. */
export function setTerminalFontSize(size: number): number {
  const next = clamp(size);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* Private-mode storage failures must not block zoom. */
  }
  window.dispatchEvent(new CustomEvent<number>(CHANGE_EVENT, { detail: next }));
  return next;
}

export function onTerminalFontSizeChange(handler: (size: number) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<number>).detail);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
