import React, { useState, useEffect, useCallback } from 'react';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { NewTabDropdown } from './NewTabDropdown';
import { TerminalIcon } from '../terminal/TerminalIcon';
import { X, Columns2, Rows2, Square } from 'lucide-react';
import { useNoticeStore } from '../../stores/useNoticeStore';

interface TabBarProps {
  onOpenTerminalModal: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({ onOpenTerminalModal }) => {
  const {
    sessions,
    activeSessionId,
    secondarySessionId,
    splitMode,
    setActiveSession,
    closeSession,
    setSplitMode,
    renameSession,
  } = useTerminalStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleCloseSession = useCallback(async (id: string) => {
    try {
      await closeSession(id);
    } catch (err: any) {
      useNoticeStore.getState().report('Unable to close terminal', err);
    }
  }, [closeSession]);

  // Global Ctrl+T shortcut: opens Directory & Launch Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!e.ctrlKey || (key !== 't' && key !== 'w')) return;
      // Capture before xterm consumes the event; never send these app shortcuts
      // to the PTY or let WebView/Edge close a tab while a modal is open.
      e.preventDefault();
      e.stopPropagation();
      if (document.querySelector('[aria-modal="true"]')) return;
      if (key === 't') {
        onOpenTerminalModal();
      } else if (key === 'w') {
        if (activeSessionId) {
          void handleCloseSession(activeSessionId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeSessionId, onOpenTerminalModal, handleCloseSession]);

  const handleStartRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleFinishRename = (id: string) => {
    if (editTitle.trim()) {
      renameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="h-9 shrink-0 bg-orca-darker border-b border-orca-border flex items-center justify-between px-2 gap-2 select-none">
      {/* Left: Scrollable Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar h-full py-1">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isSecondary = session.id === secondarySessionId;

          return (
            <div
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              onDoubleClick={() => handleStartRename(session.id, session.title)}
              title={session.exited ? `${session.title} — Process completed` : session.title}
              className={`group h-7 px-2.5 rounded flex items-center gap-2 text-xs cursor-pointer transition-all border shrink-0 max-w-[210px] ${
                isActive
                  ? 'bg-orca-card border-orca-borderLight text-white font-medium shadow-sm'
                  : isSecondary
                  ? 'bg-orca-dark/60 border-orca-accent/40 text-orca-text'
                  : 'bg-transparent border-transparent text-orca-muted hover:text-orca-text hover:bg-orca-hover'
              }`}
            >
              <TerminalIcon
                shell={session.shell}
                title={session.title}
                isAgent={session.is_agent}
                agentType={session.agent_type}
                className="w-3.5 h-3.5 shrink-0"
              />
              {session.exited && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-orca-muted shrink-0"
                  aria-label="Process completed"
                />
              )}

              {editingId === session.id ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleFinishRename(session.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFinishRename(session.id)}
                  autoFocus
                  className="bg-orca-darkest text-white px-1 py-0.5 rounded border border-orca-accent outline-none text-xs w-24"
                />
              ) : (
                <span className="truncate flex-1">{session.title}</span>
              )}

              {/* Close Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleCloseSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:bg-orca-hover hover:text-orca-rose rounded p-0.5 transition-all text-orca-muted"
                title="Close Tab (Ctrl+W)"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Instant New Tab Button Dropdown */}
        <div className="ml-1">
          <NewTabDropdown onOpenTerminalModal={onOpenTerminalModal} />
        </div>
      </div>

      {/* Right: Split Screen Controls */}
      <div className="flex items-center gap-1 border-l border-orca-border pl-2 shrink-0">
        <button
          onClick={() => setSplitMode('none')}
          className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
            splitMode === 'none'
              ? 'bg-orca-card border-orca-border text-white'
              : 'border-transparent text-orca-muted hover:text-white hover:bg-orca-hover'
          }`}
          title="Single Pane"
        >
          <Square className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setSplitMode('vertical')}
          disabled={sessions.length < 2}
          className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
            splitMode === 'vertical'
              ? 'bg-orca-card border-orca-border text-white'
              : sessions.length < 2
              ? 'opacity-30 cursor-not-allowed border-transparent text-orca-muted'
              : 'border-transparent text-orca-muted hover:text-white hover:bg-orca-hover'
          }`}
          title="Split Vertically"
        >
          <Columns2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setSplitMode('horizontal')}
          disabled={sessions.length < 2}
          className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
            splitMode === 'horizontal'
              ? 'bg-orca-card border-orca-border text-white'
              : sessions.length < 2
              ? 'opacity-30 cursor-not-allowed border-transparent text-orca-muted'
              : 'border-transparent text-orca-muted hover:text-white hover:bg-orca-hover'
          }`}
          title="Split Horizontally"
        >
          <Rows2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
