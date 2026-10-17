/** IPC may reject with a string, Error, or a serialised object. Never render it directly. */
export function errorMessage(error: unknown, fallback = 'The operation failed. Please try again.'): string {
  try {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : fallback;
  return (message.trim() || fallback).slice(0, 4000);
  } catch { return fallback; }
}
