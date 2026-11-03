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
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  getTerminalFontSize,
  onTerminalFontSizeChange,
  setTerminalFontSize,
} from '../../lib/terminalFontSize';

interface XTermViewProps {
  sessionId: string;
  isActive: boolean;
  isVisible?: boolean;
}

export const XTermView: React.FC<XTermViewProps> = ({ sessionId, isActive, isVisible = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const webglCleanupRef = useRef<(() => void) | null>(null);
  const searchOpenRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let exited = Boolean(useTerminalStore.getState().sessions.find((session) => session.id === sessionId)?.exited);

    let resizeFrame = 0;
    let lastSize = '';
    let writing = false;
    let queuedInput = '';
    const report = (error: unknown) => {
      if (!disposed && !exited) {
        const message = errorMessage(error);
        setStreamError(message);
        void tauriIpc
          .reportError(`Terminal ${sessionId}: ${message}`)
          .catch((error) => console.error('Unable to write diagnostic log', error));
      }
    };

    // Create xterm instance with clean Vela dark theme
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: getTerminalFontSize(),
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
        scrollbarSliderBackground: 'rgba(255, 255, 255, 0.22)',
        scrollbarSliderHoverBackground: '#ffffff',
        scrollbarSliderActiveBackground: '#ffffff',
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
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    try {
      term.open(containerRef.current);
    } catch (error) {
      term.dispose();
      report(error);
      void tauriIpc
        .killTerminal(sessionId)
        .then(() => useTerminalStore.getState().markSessionExited(sessionId))
        .catch((error) => useNoticeStore.getState().report('Unable to stop terminal after renderer failure', error));
      return;
    }

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
      } catch (error) {
        report(error);
      }
    };
    const fitTimer = setTimeout(fit, 50);

    // Font size is shared by every pane, so store it once and let each live terminal follow.
    const offFontSize = onTerminalFontSizeChange((size) => {
      if (term.options) term.options.fontSize = size;
      fit();
    });

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
      } catch (error) {
        queuedInput = '';
        report(error);
      } finally {
        writing = false;
      }
    };

    // Terminal data input listener (keyboard -> Rust PTY)
    const onDataDisposable = term.onData((data) => {
      void sendInput(data);
    });

    // Let Ctrl+V / Ctrl+Shift+V fall through to the browser paste event
    // instead of xterm sending a raw ^V, so the paste handler below decides.
    let swallowEscapeUp = false;
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'v') {
        return false;
      }
      // Ctrl+F opens the in-terminal search bar instead of sending ^F to the shell.
      if (e.type === 'keydown' && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        searchOpenRef.current = true;
        setSearchOpen(true);
        return false;
      }
      // Ctrl+= / Ctrl+- / Ctrl+0 zoom every terminal pane and persist the size.
      if (e.type === 'keydown' && e.ctrlKey && !e.altKey && !e.metaKey) {
        const size = term.options?.fontSize ?? getTerminalFontSize();
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          e.stopPropagation();
          setTerminalFontSize(size + 1);
          return false;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          e.stopPropagation();
          setTerminalFontSize(size - 1);
          return false;
        }
        if (e.key === '0') {
          e.preventDefault();
          e.stopPropagation();
          setTerminalFontSize(DEFAULT_TERMINAL_FONT_SIZE);
          return false;
        }
      }
      // Closing search must not leak an ESC record into the shell on keyup.
      if (e.key === 'Escape' && swallowEscapeUp && e.type === 'keyup') {
        swallowEscapeUp = false;
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      if (e.key === 'Escape' && searchOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'keydown') {
          searchOpenRef.current = false;
          swallowEscapeUp = true;
          setSearchOpen(false);
          term.focus();
        }
        return false;
      }
      // Intercept Shift+Enter: xterm's default '\r' submits the prompt. Send a Win32 key
      // record for Shift+Enter carrying '\n' instead. ConPTY gives console-API readers
      // (PSReadLine AddLine, Codex) a real Shift+Enter and VT readers (Claude Code,
      // OpenCode, Droid, Antigravity) a '\n'; both insert a line break. A bare '\n'
      // arrives at console readers as Ctrl+Enter, which Codex ignores, and a Shift+Enter
      // record carrying '\r' reaches VT readers as plain Enter.
      // Calling preventDefault and stopPropagation ensures the browser does not insert text into
      // xterm's hidden textarea (which would trigger secondary onData emissions).
      const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
      if (isEnter && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'keydown') {
          void sendInput('\x1b[13;28;10;1;16;1_\x1b[13;28;10;0;16;1_');
        }
        return false;
      }
      // Encode Escape as a Win32 key record so ConPTY delivers it as VK_ESCAPE
      // even if win32-input-mode was activated. Leave IME composition alone so Escape can cancel it.
      if (e.key === 'Escape' && !e.metaKey && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'keydown') {
          const modifiers = (e.shiftKey ? 0x10 : 0) | (e.ctrlKey ? 0x08 : 0) | (e.altKey ? 0x02 : 0);
          void sendInput(`\x1b[27;1;27;1;${modifiers};1_\x1b[27;1;27;0;${modifiers};1_`);
        }
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
      const hasImage = Array.from(data.items).some((item) => item.kind === 'file' && item.type.startsWith('image/'));
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
    const cleanupPtyListeners = () => {
      if (unlistenPtyOutput) {
        unlistenPtyOutput();
        unlistenPtyOutput = null;
      }
      if (unlistenPtyExit) {
        unlistenPtyExit();
        unlistenPtyExit = null;
      }
      if (unlistenPtyError) {
        unlistenPtyError();
        unlistenPtyError = null;
      }
    };

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
        if (disposed || exited) {
          outputUnlisten();
          return;
        }
        unlistenPtyOutput = outputUnlisten;

        const exitUnlisten = await tauriIpc.onPtyExit(sessionId, (code) => {
          if (disposed) return;
          exited = true;
          queuedInput = '';
          cleanupPtyListeners();
          cwdHandler.dispose();
          onDataDisposable.dispose();
          term.writeln(`\r\n\x1b[90m[Process completed${code == null ? '' : `, exit code ${code}`}]\x1b[0m`);
          useTerminalStore.getState().markSessionExited(sessionId);
        });
        if (disposed || exited) {
          exitUnlisten();
          return;
        }
        unlistenPtyExit = exitUnlisten;

        const errorUnlisten = await tauriIpc.onPtyError(sessionId, (message) => {
          if (disposed) return;
          report(message);
          void tauriIpc
            .killTerminal(sessionId)
            .catch((error) => useNoticeStore.getState().report('Unable to stop failed terminal', error));
        });
        if (disposed || exited) {
          errorUnlisten();
          return;
        }
        unlistenPtyError = errorUnlisten;

        await tauriIpc.startTerminalOutput(sessionId);
      } catch (error) {
        if (disposed) return;
        console.error('Failed to connect terminal output stream', error);
        report(error);
        term.writeln('\r\n\x1b[31m[Unable to start terminal output stream]\x1b[0m');
        void tauriIpc
          .killTerminal(sessionId)
          .then(() => useTerminalStore.getState().markSessionExited(sessionId))
          .catch((killError) => {
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
      cleanupPtyListeners();
      offFontSize();
      webglCleanupRef.current?.();
      webglCleanupRef.current = null;
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      term.dispose();
    };
  }, [sessionId]);

  // Attach the optional WebGL renderer only while the pane is visible so hidden tabs
  // do not exhaust WebView2's active WebGL context limit or hold idle GPU textures.
  useEffect(() => {
    const term = termRef.current;
    if (!isVisible || !term) {
      webglCleanupRef.current?.();
      webglCleanupRef.current = null;
      return;
    }
    let cancelled = false;
    void import('@xterm/addon-webgl')
      .then(({ WebglAddon }) => {
        if (cancelled || termRef.current !== term || webglCleanupRef.current) return;
        try {
          const addon = new WebglAddon();
          let disposed = false;
          const contextLoss = addon.onContextLoss(() => cleanup()) as { dispose?: () => void } | undefined;
          function cleanup() {
            if (disposed) return;
            disposed = true;
            if (webglCleanupRef.current === cleanup) webglCleanupRef.current = null;
            contextLoss?.dispose?.();
            addon.dispose?.();
          }
          term.loadAddon(addon);
          webglCleanupRef.current = cleanup;
        } catch (error) {
          console.warn('Using the standard terminal renderer', error);
        }
      })
      .catch((error) => console.warn('WebGL is unavailable; using the standard terminal renderer', error));
    return () => {
      cancelled = true;
      webglCleanupRef.current?.();
      webglCleanupRef.current = null;
    };
  }, [isVisible, sessionId]);

  // Focus terminal when active
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isActive && termRef.current) {
      termRef.current.focus();
      if (fitAddonRef.current) {
        timer = setTimeout(() => {
          try {
            fitAddonRef.current?.fit();
          } catch (error) {
            setStreamError(errorMessage(error));
          }
        }, 20);
      }
    }
    return () => clearTimeout(timer);
  }, [isActive]);

  useEffect(() => {
    if (!searchOpen) return;
    // Selecting the existing query makes the next keystroke replace it.
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [searchOpen]);

  return (
    <div className="w-full h-full relative">
      {streamError && (
        <div
          role="alert"
          className="absolute z-10 inset-x-2 top-2 p-3 bg-orca-darker border border-orca-rose/40 rounded-md text-sm text-orca-text break-words select-text"
        >
          <span>{streamError}</span>
          <button type="button" className="ml-3 underline" onClick={() => setStreamError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className={`w-full h-full bg-orca-darkest overflow-hidden ${
          isActive ? 'ring-1 ring-orca-borderLight' : 'opacity-85'
        }`}
      />
      {searchOpen && (
        <div className="absolute z-20 top-2 right-2 flex items-center gap-1 p-1 rounded-md bg-orca-darker border border-orca-border text-xs">
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              searchAddonRef.current?.findNext(e.target.value, { incremental: true, caseSensitive: false });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) searchAddonRef.current?.findPrevious(searchTerm);
                else searchAddonRef.current?.findNext(searchTerm);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                searchOpenRef.current = false;
                setSearchOpen(false);
                termRef.current?.focus();
              }
            }}
            placeholder="Find in terminal"
            aria-label="Find in terminal"
            className="w-44 bg-orca-darkest px-2 py-1 rounded border border-orca-border focus:border-orca-accent outline-none text-white font-mono text-[11px] placeholder:text-orca-muted/60"
          />
          <button
            type="button"
            onClick={() => searchAddonRef.current?.findPrevious(searchTerm)}
            disabled={!searchTerm}
            className="px-1.5 py-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white disabled:opacity-40"
            title="Previous match (Shift+Enter)"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => searchAddonRef.current?.findNext(searchTerm)}
            disabled={!searchTerm}
            className="px-1.5 py-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white disabled:opacity-40"
            title="Next match (Enter)"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => {
              searchOpenRef.current = false;
              setSearchOpen(false);
              termRef.current?.focus();
            }}
            className="px-1.5 py-1 rounded hover:bg-orca-hover text-orca-muted hover:text-white"
            title="Close search (Esc)"
            aria-label="Close search"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
