import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { tauriIpc } from '../../lib/tauriIpc';
import { useTerminalStore } from '../../stores/useTerminalStore';

interface XTermViewProps {
  sessionId: string;
  isActive: boolean;
}

export const XTermView: React.FC<XTermViewProps> = ({ sessionId, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

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

    term.open(containerRef.current);

    // Try GPU-accelerated WebGL Addon for 60 FPS rendering
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon could not be initialized, falling back to standard canvas/DOM', e);
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
      tauriIpc.resizeTerminal(sessionId, term.cols, term.rows);
    }, 50);

    // Terminal data input listener (keyboard -> Rust PTY)
    const onDataDisposable = term.onData((data) => {
      tauriIpc.writeTerminal(sessionId, data);
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

    // Image-only clipboard: the browser paste carries no text, so nothing would
    // reach the PTY. Send Alt+V (ESC v) instead so CLI agents like Claude Code
    // read the image from the Windows clipboard themselves.
    const container = containerRef.current;
    const handlePaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data || data.getData('text/plain')) return;
      const hasImage = Array.from(data.items).some(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      );
      if (!hasImage) return;
      e.preventDefault();
      e.stopPropagation();
      tauriIpc.writeTerminal(sessionId, '\x1bv');
    };
    container.addEventListener('paste', handlePaste, true);

    // PTY output listener (Rust ConPTY -> xterm)
    let unlistenPtyOutput: (() => void) | null = null;
    let unlistenPtyExit: (() => void) | null = null;

    const connectPty = async () => {
      try {
        // Register both listeners before opening the backend reader gate.
        // The terminal instance already exists, so the first PTY chunk has a sink.
        const outputUnlisten = await tauriIpc.onPtyOutput(sessionId, (bytes) => {
          if (!disposed) term.write(bytes);
        });
        if (disposed) {
          outputUnlisten();
          return;
        }
        unlistenPtyOutput = outputUnlisten;

        const exitUnlisten = await tauriIpc.onPtyExit(sessionId, () => {
          if (disposed) return;
          term.writeln('\r\n\x1b[90m[Process completed]\x1b[0m');
          useTerminalStore.getState().markSessionExited(sessionId);
        });
        if (disposed) {
          exitUnlisten();
          return;
        }
        unlistenPtyExit = exitUnlisten;

        await tauriIpc.startTerminalOutput(sessionId);
      } catch (error) {
        if (disposed) return;
        console.error('Failed to connect terminal output stream', error);
        term.writeln('\r\n\x1b[31m[Unable to start terminal output stream]\x1b[0m');
        useTerminalStore.getState().markSessionExited(sessionId);
        void tauriIpc.killTerminal(sessionId).catch((killError) => {
          console.error('Failed to stop terminal after stream setup failed', killError);
        });
      }
    };
    void connectPty();

    // Window / Container resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.clientWidth > 0) {
        fitAddon.fit();
        tauriIpc.resizeTerminal(sessionId, term.cols, term.rows);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      disposed = true;
      onDataDisposable.dispose();
      container.removeEventListener('paste', handlePaste, true);
      resizeObserver.disconnect();
      if (unlistenPtyOutput) unlistenPtyOutput();
      if (unlistenPtyExit) unlistenPtyExit();
      term.dispose();
    };
  }, [sessionId]);

  // Focus terminal when active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
      if (fitAddonRef.current) {
        setTimeout(() => fitAddonRef.current?.fit(), 20);
      }
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full bg-orca-darkest overflow-hidden ${
        isActive ? 'ring-1 ring-orca-borderLight' : 'opacity-85'
      }`}
    />
  );
};
