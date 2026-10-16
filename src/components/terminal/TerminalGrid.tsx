import React from 'react';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { XTermView } from './XTermView';
import { Terminal, Plus, Bot, GitBranch, Sparkles } from 'lucide-react';

interface TerminalGridProps {
  onOpenCreateWorktree: () => void;
}

export const TerminalGrid: React.FC<TerminalGridProps> = ({ onOpenCreateWorktree }) => {
  const {
    sessions,
    activeSessionId,
    secondarySessionId,
    splitMode,
    createSession,
    setActiveSession,
  } = useTerminalStore();

  const { repoPath, worktrees, activeWorktreeId } = useWorktreeStore();
  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId);
  const defaultCwd = activeWorktree?.path || repoPath || '';

  if (sessions.length === 0) {
    return (
      <div className="flex-1 bg-orca-darkest flex flex-col items-center justify-center p-8 select-none">
        <div className="w-14 h-14 rounded-2xl bg-orca-card border border-orca-border flex items-center justify-center text-orca-accent mb-4 shadow-lg">
          <Terminal className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white mb-1">No Active Terminals</h2>
        <p className="text-orca-muted text-xs max-w-sm text-center mb-6">
          Open a new terminal tab, launch an AI agent, or create an isolated Git Worktree to begin.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => createSession({ cwd: defaultCwd })}
            className="h-9 px-4 rounded-md bg-orca-accent hover:bg-orca-accentHover text-white text-xs font-medium flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Terminal Tab (Ctrl+T)</span>
          </button>

          <button
            onClick={() =>
              createSession({
                title: 'Claude Code',
                shell: 'claude',
                cwd: defaultCwd,
                isAgent: true,
              })
            }
            className="h-9 px-4 rounded-md bg-orca-card hover:bg-orca-hover border border-orca-border text-orca-text text-xs font-medium flex items-center gap-2 transition-all"
          >
            <Bot className="w-4 h-4 text-orca-emerald" />
            <span>Launch Claude Code</span>
          </button>

          {repoPath && (
            <button
              onClick={onOpenCreateWorktree}
              className="h-9 px-4 rounded-md bg-orca-card hover:bg-orca-hover border border-orca-border text-orca-text text-xs font-medium flex items-center gap-2 transition-all"
            >
              <GitBranch className="w-4 h-4 text-orca-accent" />
              <span>New Git Worktree</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const secondarySession = sessions.find((s) => s.id === secondarySessionId);

  if (splitMode === 'vertical' && secondarySession) {
    return (
      <div className="flex-1 flex overflow-hidden">
        <div
          className="w-1/2 h-full border-r border-orca-border relative"
          onClick={() => setActiveSession(activeSession.id)}
        >
          <XTermView sessionId={activeSession.id} isActive={true} />
        </div>
        <div
          className="w-1/2 h-full relative"
          onClick={() => setActiveSession(secondarySession.id)}
        >
          <XTermView sessionId={secondarySession.id} isActive={false} />
        </div>
      </div>
    );
  }

  if (splitMode === 'horizontal' && secondarySession) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="h-1/2 w-full border-b border-orca-border relative"
          onClick={() => setActiveSession(activeSession.id)}
        >
          <XTermView sessionId={activeSession.id} isActive={true} />
        </div>
        <div
          className="h-1/2 w-full relative"
          onClick={() => setActiveSession(secondarySession.id)}
        >
          <XTermView sessionId={secondarySession.id} isActive={false} />
        </div>
      </div>
    );
  }

  // Single Pane Mode
  return (
    <div className="flex-1 h-full w-full overflow-hidden">
      <XTermView sessionId={activeSession.id} isActive={true} />
    </div>
  );
};
