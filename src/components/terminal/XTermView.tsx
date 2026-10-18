import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { tauriIpc } from '../../lib/tauriIpc';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { cwdFromOsc7 } from '../../lib/shellIntegration';
import { errorMessage } from '../../lib/errors';
import { useNoticeStore } from '../../stores/useNoticeStore';

interface XTermViewProps {
  sessionId: string;
  isActive: boolean;
}

export const XTermView: React.FC<XTermViewProps> = ({ sessionId, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let exited = Boolean(useTerminalStore.getState().sessions.find((session) => session.id === sessionId)?.exited);
    let fitTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeFrame = 0;
    let lastSize = '';
    let writing = false;
    let queuedInput = '';
    const report = (error: unknown) => {
      if (!disposed && !exited) {
        const message = errorMessage(error);
        setStreamError(message);
        void tauriIpc.reportError(`Terminal ${sessionId}: ${message}`).catch((error) => console.error('Unable to write diagnostic log', error));
      }
    };

    // Create xterm instance with clean Vela dark theme
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Cascadia Code, Fira Code, Consolas, monospace',
      letterSpacing: 0,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#09090b',
        foreground: '#f4f4f6',
        cursor: '#3b82f6',
        cursorAccent: '#09090b',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#141418',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f4f4f6',
        brightBlack: '#71717a',
        brightRed: '#fb7185',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new SearchAddon());

    try { term.open(containerRef.current); }
    catch (error) {
      term.dispose();
      report(error);
      void tauriIpc.killTerminal(sessionId).then(() => useTerminalStore.getState().markSessionExited(sessionId))
        .catch((error) => useNoticeStore.getState().report('Unable to stop terminal after renderer failure', error));
      return;
    }

    // Load the optional renderer separately; a GPU failure must not kill a usable terminal.
    void import('@xterm/addon-webgl').then(({ WebglAddon }) => {
      if (disposed) return;
      try {
        const addon = new WebglAddon();
        addon.onContextLoss(() => addon.dispose());
        term.loadAddon(addon);
      } catch (error) { console.warn('Using the standard terminal renderer', error); }
    }).catch((error) => console.warn('WebGL is unavailable; using the standard terminal renderer', error));

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const fit = () => {
      if (disposed || exited || !containerRef.current?.clientWidth || !containerRef.current.clientHeight) return;
      try {
        fitAddon.fit();
        const size = `${term.cols}:${term.rows}`;
        if (size === lastSize) return;
        lastSize = size;
        void tauriIpc.resizeTerminal(sessionId, term.cols, term.rows).catch(report);
      } catch (error) { report(error); }
    };
    fitTimer = setTimeout(fit, 50);

    const cwdHandler = term.parser.registerOscHandler(7, (data) => {
      const cwd = cwdFromOsc7(data);
      if (!disposed && cwd) useTerminalStore.getState().updateSessionCwd(sessionId, cwd);
      return true;
    });

    const sendInput = async (data: string) => {
      if (disposed || exited) return;
      if (queuedInput.length + data.length > 262144) {
        report('Paste exceeds the input limit. Paste fewer than 262,144 characters at a time.');
        return;
      }
      queuedInput += data;
      if (writing) return;
      writing = true;
      try {
        while (queuedInput && !disposed && !exited) {
          let end = Math.min(2048, queuedInput.length);
          // Do not split a UTF-16 surrogate pair between IPC messages.
          if (end < queuedInput.length && /[\uD800-\uDBFF]/.test(queuedInput[end - 1])) --end;
          const chunk = queuedInput.slice(0, end);
          queuedInput = queuedInput.slice(end);
          await tauriIpc.writeTerminal(sessionId, chunk);
        }
      } catch (error) { queuedInput = ''; report(error); }
      finally { writing = false; }
    };

    // Terminal data input listener (keyboard -> Rust PTY)
    const onDataDisposable = term.onData((data) => {
      void sendInput(data);
    });

    // Let Ctrl+V / Ctrl+Shift+V fall through to the browser paste event
    // instead of xterm sending a raw ^V, so the paste handler below decides.
    term.attachCustomKeyEventHandler((e) => {
      if (
        e.type === 'keydown' &&
        e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.toLowerCase() === 'v'
      ) {
        return false;
      }
      return true;
    });

    // An image-only clipboard carries no text, so a normal paste would send
    // nothing to the PTY and the image would be lost. Forward the raw Ctrl+V
    // key instead: agents that read the Windows clipboard themselves (OpenCode
    // binds `prompt.paste` to ctrl+v, and Claude Code pastes images the same
    // way) then attach the image from the OS clipboard.
    const container = containerRef.current;
    const handlePaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data || data.getData('text/plain')) return;
      const hasImage = Array.from(data.items).some(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      );
      // Empty pastes (image-only clipboard exposed without a file item, or a
      // terminal-style paste of an unsupported payload) reach here the same
      // way, and the agent still needs the key to read the clipboard itself.
      if (!hasImage && data.items.length > 0) return;
      e.preventDefault();
      e.stopPropagation();
      void sendInput('\x16');
    };
    container.addEventListener('paste', handlePaste, true);

    // PTY output listener (Rust ConPTY -> xterm)
    let unlistenPtyOutput: (() => void) | null = null;
    let unlistenPtyExit: (() => void) | null = null;
    let unlistenPtyError: (() => void) | null = null;

    const connectPty = async () => {
      try {
        // Register both listeners before opening the backend reader gate.
        // The terminal instance already exists, so the first PTY chunk has a sink.
        const outputUnlisten = await tauriIpc.onPtyOutput(sessionId, (bytes) => {
          if (!disposed) {
            term.write(bytes, () => {
              if (!disposed) void tauriIpc.acknowledgeTerminalOutput(sessionId, bytes.byteLength).catch(report);
            });
          }
        });
        if (disposed) {
          outputUnlisten();
          return;
        }
        unlistenPtyOutput = outputUnlisten;

        const exitUnlisten = await tauriIpc.onPtyExit(sessionId, (code) => {
          if (disposed) return;
          exited = true;
          queuedInput = '';
          term.writeln(`\r\n\x1b[90m[Process completed${code == null ? '' : `, exit code ${code}`}]\x1b[0m`);
          useTerminalStore.getState().markSessionExited(sessionId);
        });
        if (disposed) {
          exitUnlisten();
          return;
        }
        unlistenPtyExit = exitUnlisten;

        const errorUnlisten = await tauriIpc.onPtyError(sessionId, (message) => {
          if (disposed) return;
          report(message);
          void tauriIpc.killTerminal(sessionId).catch((error) => useNoticeStore.getState().report('Unable to stop failed terminal', error));
        });
        if (disposed) { errorUnlisten(); return; }
        unlistenPtyError = errorUnlisten;

        await tauriIpc.startTerminalOutput(sessionId);
      } catch (error) {
        if (disposed) return;
        console.error('Failed to connect terminal output stream', error);
        report(error);
        term.writeln('\r\n\x1b[31m[Unable to start terminal output stream]\x1b[0m');
        void tauriIpc.killTerminal(sessionId).then(() => useTerminalStore.getState().markSessionExited(sessionId)).catch((killError) => {
          useNoticeStore.getState().report('Unable to stop terminal after stream setup failed', killError);
        });
      }
    };
    void connectPty();

    // Window / Container resize observer
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(fit);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      clearTimeout(fitTimer);
      cancelAnimationFrame(resizeFrame);
      queuedInput = '';
      cwdHandler.dispose();
      onDataDisposable.dispose();
      container.removeEventListener('paste', handlePaste, true);
      resizeObserver.disconnect();
      if (unlistenPtyOutput) unlistenPtyOutput();
      if (unlistenPtyExit) unlistenPtyExit();
      if (unlistenPtyError) unlistenPtyError();
      termRef.current = null;
      fitAddonRef.current = null;
      term.dispose();
    };
  }, [sessionId]);

  // Focus terminal when active
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isActive && termRef.current) {
      termRef.current.focus();
      if (fitAddonRef.current) {
        timer = setTimeout(() => {
          try { fitAddonRef.current?.fit(); } catch (error) { setStreamError(errorMessage(error)); }
        }, 20);
      }
    }
    return () => clearTimeout(timer);
  }, [isActive]);

  return (
    <div className="w-full h-full relative">
    {streamError && <div role="alert" className="absolute z-10 inset-x-2 top-2 p-3 bg-orca-darker border border-orca-rose/40 rounded-md text-sm text-orca-text break-words select-text">
      <span>{streamError}</span>
      <button type="button" className="ml-3 underline" onClick={() => setStreamError(null)}>Dismiss</button>
    </div>}
    <div
      ref={containerRef}
      className={`w-full h-full bg-orca-darkest overflow-hidden ${
        isActive ? 'ring-1 ring-orca-borderLight' : 'opacity-85'
      }`}
    />
    </div>
  );
};
