import { afterEach, expect, it, vi } from 'vitest';
import { deferred } from '../test/helpers';
import { setWindowClosePreparation } from './windowClosePreparation';
import { tauriIpc } from './tauriIpc';

const native = vi.hoisted(() => ({ invoke: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  setWindowClosePreparation(() => Promise.resolve());
  native.invoke.mockClear();
});

it('waits for recovery data before requesting native close with its existing confirmation flag', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  const pending = deferred<void>();
  setWindowClosePreparation(() => pending.promise);
  const closing = tauriIpc.closeWindow(true);
  await Promise.resolve();
  expect(native.invoke).not.toHaveBeenCalled();
  pending.resolve();
  await closing;
  expect(native.invoke).toHaveBeenCalledWith('close_window', { unsavedChangesConfirmed: true });
});

it('does not bypass close preparation failures', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  setWindowClosePreparation(async () => {
    throw new Error('recovery failed');
  });
  await expect(tauriIpc.closeWindow()).rejects.toThrow('recovery failed');
  expect(native.invoke).not.toHaveBeenCalled();
});
