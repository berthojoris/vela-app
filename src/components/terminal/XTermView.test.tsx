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
  nextFitSize: null as null | { cols: number; rows: number },
  terminals: [] as Array<{
    cols: number;
    rows: number;
    refresh: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    handleResize: ReturnType<typeof vi.fn>;
    queueSync: ReturnType<typeof vi.fn>;
  }>,
  webglAddons: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    triggerContextLoss: () => void;
  }>,
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
    refresh = vi.fn();
    focus = vi.fn();
    handleResize = vi.fn();
    queueSync = vi.fn();
    _core = {
      _renderService: { handleResize: this.handleResize },
      _viewport: { queueSync: this.queueSync },
    };
    parser = {
      registerOscHandler: (_: number, callback: (data: string) => boolean) => {
        state.osc = callback;
        return { dispose() {} };
      },
    };
    constructor() {
      state.terminals.push(this);
    }
    loadAddon(addon: { activate?: (term: unknown) => void }) {
      addon?.activate?.(this);
    }
    open() {}
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
    private term: { cols: number; rows: number } | null = null;
    activate(term: { cols: number; rows: number }) {
      this.term = term;
    }
    fit() {
      if (this.term && state.nextFitSize) {
        this.term.cols = state.nextFitSize.cols;
        this.term.rows = state.nextFitSize.rows;
      }
    }
  },
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {
    findNext() {}
    findPrevious() {}
  },
}));
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    dispose = vi.fn();
    private onLoss: (() => void) | null = null;
    constructor() {
      state.webglAddons.push({
        dispose: this.dispose,
        triggerContextLoss: () => this.onLoss?.(),
      });
    }
    onContextLoss(callback: () => void) {
      this.onLoss = callback;
      return { dispose: vi.fn() };
    }
  },
}));
import { useTerminalStore } from '../../stores/useTerminalStore';
import { XTermView } from './XTermView';

beforeEach(() => {
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useTerminalStore.setState({ sessions: [session('test')] });
  state.callbacks = [];
  state.nextFitSize = null;
  state.terminals = [];
  state.webglAddons = [];
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

it('opens in-terminal search with Ctrl+F without sending ^F to the shell', async () => {
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
  expect(state.keyHandler!(event)).toBe(false);
  expect(event.defaultPrevented).toBe(true);
  expect(ipc.writeTerminal).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('Find in terminal')).toBeTruthy();
});

it('zooms the terminal font with Ctrl+= and persists it for every pane', async () => {
  localStorage.clear();
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  const event = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true, cancelable: true });
  expect(state.keyHandler!(event)).toBe(false);
  expect(localStorage.getItem('vela_terminal_font_size')).toBe('14');
  expect(ipc.writeTerminal).not.toHaveBeenCalled();
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

it('unlistens PTY events immediately when the process exits before the tab is closed', async () => {
  const unlistenOutput = vi.fn();
  const unlistenExit = vi.fn();
  const unlistenError = vi.fn();
  ipc.onPtyOutput.mockImplementationOnce(async (_, callback) => {
    state.output = callback;
    return unlistenOutput;
  });
  ipc.onPtyExit.mockImplementationOnce(async (_, callback) => {
    state.exit = callback;
    return unlistenExit;
  });
  ipc.onPtyError.mockResolvedValueOnce(unlistenError);
  render(<XTermView sessionId="test" isActive />);
  await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
  act(() => {
    state.exit!(0);
  });
  expect(unlistenOutput).toHaveBeenCalledTimes(1);
  expect(unlistenExit).toHaveBeenCalledTimes(1);
  expect(unlistenError).toHaveBeenCalledTimes(1);
});

it('synchronizes ConPTY dimensions and viewport surface when switching to a hidden or unfocused tab', async () => {
  const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
  const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(540);
  try {
    state.nextFitSize = { cols: 120, rows: 34 };
    const view = render(<XTermView sessionId="test" isActive={false} isVisible={false} />);
    await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
    expect(ipc.resizeTerminal).not.toHaveBeenCalled();

    view.rerender(<XTermView sessionId="test" isActive isVisible />);
    expect(ipc.resizeTerminal).toHaveBeenCalledWith('test', 120, 34);
    expect(state.terminals[0].queueSync).toHaveBeenCalled();
    expect(state.terminals[0].refresh).toHaveBeenCalledWith(0, 33);
    expect(state.terminals[0].focus).toHaveBeenCalled();

    // Switching active focus onto an already-visible split pane after layout change also resizes ConPTY
    ipc.resizeTerminal.mockClear();
    view.rerender(<XTermView sessionId="test" isActive={false} isVisible />);
    state.nextFitSize = { cols: 100, rows: 30 };
    vi.useFakeTimers();
    try {
      view.rerender(<XTermView sessionId="test" isActive isVisible />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(25);
      });
      expect(ipc.resizeTerminal).toHaveBeenCalledWith('test', 100, 30);
    } finally {
      vi.useRealTimers();
    }
  } finally {
    widthSpy.mockRestore();
    heightSpy.mockRestore();
  }
});

it('refreshes renderer surface on tab return even when cols and rows did not change', async () => {
  const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480);
  try {
    state.nextFitSize = { cols: 80, rows: 24 };
    const view = render(<XTermView sessionId="test" isActive isVisible />);
    await waitFor(() => expect(ipc.startTerminalOutput).toHaveBeenCalled());
    expect(ipc.resizeTerminal).toHaveBeenCalledTimes(1);
    expect(ipc.resizeTerminal).toHaveBeenCalledWith('test', 80, 24);

    const term = state.terminals[0];
    term.handleResize.mockClear();
    term.queueSync.mockClear();
    term.refresh.mockClear();
    ipc.resizeTerminal.mockClear();

    view.rerender(<XTermView sessionId="test" isActive={false} isVisible={false} />);
    view.rerender(<XTermView sessionId="test" isActive isVisible />);

    expect(ipc.resizeTerminal).not.toHaveBeenCalled();
    expect(term.handleResize).toHaveBeenCalledWith(80, 24);
    expect(term.queueSync).toHaveBeenCalled();
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  } finally {
    widthSpy.mockRestore();
    heightSpy.mockRestore();
  }
});

it('keeps WebGL warm across tab switches up to the pool limit and evicts oldest hidden contexts', async () => {
  const ids = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
  useTerminalStore.setState({ sessions: ids.map((id) => session(id)) });

  const renderGroup = (activeId: string) => (
    <>
      {ids.map((id) => (
        <XTermView key={id} sessionId={id} isActive={id === activeId} isVisible={id === activeId} />
      ))}
    </>
  );

  const view = render(renderGroup('t1'));
  expect(state.webglAddons).toHaveLength(1);
  expect(state.webglAddons[0].dispose).not.toHaveBeenCalled();

  // Switching away to t2 keeps t1's WebGL context warm instead of tearing it down
  view.rerender(renderGroup('t2'));
  expect(state.webglAddons).toHaveLength(2);
  expect(state.webglAddons[0].dispose).not.toHaveBeenCalled();

  // Returning to t1 reuses its warm WebGL addon without creating a new instance
  view.rerender(renderGroup('t1'));
  expect(state.webglAddons).toHaveLength(2);

  // Visiting t3..t7 exceeds the 6-context pool; t2 (least-recently-used hidden tab) is evicted, not t1
  for (const id of ['t3', 't4', 't5', 't6', 't7']) {
    view.rerender(renderGroup(id));
  }
  expect(state.webglAddons).toHaveLength(7);
  expect(state.webglAddons[1].dispose).toHaveBeenCalledTimes(1);
  expect(state.webglAddons[0].dispose).not.toHaveBeenCalled();

  // Returning to evicted t2 allocates a fresh WebGL context and evicts the next oldest hidden tab (t1)
  view.rerender(renderGroup('t2'));
  expect(state.webglAddons).toHaveLength(8);
  expect(state.webglAddons[0].dispose).toHaveBeenCalledTimes(1);

  // Context loss cleans up the broken WebGL addon cleanly
  act(() => {
    state.webglAddons[7].triggerContextLoss();
  });
  expect(state.webglAddons[7].dispose).toHaveBeenCalledTimes(1);
});
