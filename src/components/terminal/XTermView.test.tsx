import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { session } from '../../test/helpers';

const state = vi.hoisted(() => ({
  output: null as null | ((bytes: Uint8Array) => void),
  input: null as null | ((data: string) => void),
  exit: null as null | ((code: number | null) => void),
  osc: null as null | ((data: string) => boolean),
  keyHandler: null as null | ((e: KeyboardEvent) => boolean),
  callbacks: [] as (() => void)[],
}));
const ipc = vi.hoisted(() => ({
  onPtyOutput: vi.fn(),
  onPtyExit: vi.fn(),
  onPtyError: vi.fn(),
  startTerminalOutput: vi.fn(),
  acknowledgeTerminalOutput: vi.fn(),
  writeTerminal: vi.fn(),
  resizeTerminal: vi.fn(),
  killTerminal: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    parser = {
      registerOscHandler: (_: number, callback: (data: string) => boolean) => {
        state.osc = callback;
        return { dispose() {} };
      },
    };
    loadAddon() {}
    open() {}
    focus() {}
    dispose() {}
    writeln() {}
    attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean) {
      state.keyHandler = handler;
    }
    onData(callback: (data: string) => void) {
      state.input = callback;
      return { dispose() {} };
    }
    write(_: Uint8Array, callback: () => void) {
      state.callbacks.push(callback);
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss() {}
  },
}));
import { useTerminalStore } from '../../stores/useTerminalStore';
import { XTermView } from './XTermView';

beforeEach(() => {
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useTerminalStore.setState({ sessions: [session('test')] });
  state.callbacks = [];
  Object.values(ipc).forEach((mock) => mock.mockReset());
  ipc.onPtyOutput.mockImplementation(async (_, callback) => {
    state.output = callback;
    return () => {};
  });
  ipc.onPtyExit.mockImplementation(async (_, callback) => {
    state.exit = callback;
    return () => {};
  });
  ipc.onPtyError.mockResolvedValue(() => {});
  for (const method of [
    'startTerminalOutput',
    'acknowledgeTerminalOutput',
    'writeTerminal',
    'resizeTerminal',
    'killTerminal',
    'reportError',
  ] as const)
    ipc[method].mockResolvedValue(undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});

it('only releases backend output credits after xterm consumes a chunk', async () => {
  const view = render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalledWith('test'));
  act(() => state.output!(new Uint8Array([65, 66, 67])));
  expect(ipc.acknowledgeTerminalOutput).not.toHaveBeenCalled();
  act(() => state.callbacks.shift()!());
  expect(ipc.acknowledgeTerminalOutput).toHaveBeenCalledWith('test', 3);
  act(() => state.output!(new Uint8Array([68])));
  view.unmount();
  state.callbacks.shift()!();
  expect(ipc.acknowledgeTerminalOutput).toHaveBeenCalledTimes(1);
});
it('chunks ordered input without splitting Unicode surrogate pairs', async () => {
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  const input = `${'a'.repeat(2047)}🌌${'b'.repeat(2500)}`;
  act(() => {
    state.input!(input);
  });
  await waitFor(() => expect(ipc.writeTerminal).toHaveBeenCalledTimes(3));
  expect(ipc.writeTerminal.mock.calls.map((call) => call[1]).join('')).toBe(input);
  expect(ipc.writeTerminal.mock.calls[0][1]).toHaveLength(2047);
});
it('tracks prompt directory metadata and stops accepting input after process exit', async () => {
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  act(() => {
    state.osc!('file:///C:/new%20repo/');
  });
  expect(useTerminalStore.getState().sessions[0].cwd).toBe('C:/new repo');
  act(() => {
    state.exit!(0);
    state.input!('do not send');
  });
  expect(ipc.writeTerminal).not.toHaveBeenCalled();
  expect(useTerminalStore.getState().sessions[0].exited).toBe(true);
});
it('rejects oversized pastes with an inline error instead of an unbounded queue', async () => {
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  act(() => {
    state.input!('x'.repeat(262145));
  });
  expect(screen.getByRole('alert').textContent).toContain('Paste exceeds');
  expect(ipc.writeTerminal).not.toHaveBeenCalled();
});

const pasteWith = (target: Element, text: string, items: { kind: string; type: string }[]) => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : ''), items },
  });
  act(() => {
    target.dispatchEvent(event);
  });
};

it('forwards Ctrl+V for an image-only clipboard so the agent reads the OS clipboard', async () => {
  const view = render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  const target = view.container.querySelector('.bg-orca-darkest')!;
  pasteWith(target, '', [{ kind: 'file', type: 'image/png' }]);
  await waitFor(() => expect(ipc.writeTerminal).toHaveBeenCalledWith('test', '\x16'));
  expect(ipc.writeTerminal.mock.calls.map((call) => call[1]).join('')).not.toContain('\x1bv');
});

it('leaves text pastes to the browser instead of synthesizing a key', async () => {
  const view = render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  const target = view.container.querySelector('.bg-orca-darkest')!;
  pasteWith(target, 'ls -la', [{ kind: 'string', type: 'text/plain' }]);
  expect(ipc.writeTerminal).not.toHaveBeenCalled();
});

it('intercepts Shift+Enter to send a Shift+Enter key record carrying a newline', async () => {
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  expect(state.keyHandler).toBeTypeOf('function');
  const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
  const handled = state.keyHandler!(event);
  expect(handled).toBe(false);
  expect(event.defaultPrevented).toBe(true);
  await waitFor(() =>
    expect(ipc.writeTerminal).toHaveBeenCalledWith('test', '\x1b[13;28;10;1;16;1_\x1b[13;28;10;0;16;1_')
  );
  expect(state.keyHandler!(new KeyboardEvent('keyup', { key: 'Enter', shiftKey: true }))).toBe(false);
  expect(ipc.writeTerminal).toHaveBeenCalledTimes(1);
});

it('sends Escape as a Win32 key record so ConPTY cannot drop a bare ESC', async () => {
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  expect(state.keyHandler!(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false);
  expect(state.keyHandler!(new KeyboardEvent('keyup', { key: 'Escape' }))).toBe(false);
  await waitFor(() => expect(ipc.writeTerminal).toHaveBeenCalledWith('test', '\x1b[27;1;27;1;0;1_\x1b[27;1;27;0;0;1_'));
  expect(ipc.writeTerminal).toHaveBeenCalledTimes(1);
  expect(state.keyHandler!(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true }))).toBe(true);
});
