import React, { lazy, Suspense } from 'react';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useNoticeStore } from '../../stores/useNoticeStore';
const XTermView = lazy(() => import('./XTermView').then((module) => ({ default: module.XTermView })));
import { Terminal, Plus, Bot, GitBranch } from 'lucide-react';

interface TerminalGridProps {
  onOpenCreateWorktree: () => void;
  onOpenTerminalModal: (initialProfileId?: string) => void;
}

export const TerminalGrid: React.FC<TerminalGridProps> = ({ onOpenCreateWorktree, onOpenTerminalModal }) => {
  const { sessions, activeSessionId, primarySessionId, secondarySessionId, splitMode, setActiveSession } =
    useTerminalStore();

  const repoPath = useWorktreeStore((state) => state.repoPath);

  if (sessions.length === 0) {
    return (
      <div className="h-full bg-orca-darkest flex flex-col items-center justify-center p-8 select-none">
        <div className="w-14 h-14 rounded-2xl bg-orca-card border border-orca-border flex items-center justify-center text-orca-accent mb-4">
          <Terminal className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white mb-1">No Active Terminals</h2>
        <p className="text-orca-muted text-xs max-w-sm text-center mb-6">
          Open a new terminal tab, launch an AI agent, or create an isolated Git Worktree to begin.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => onOpenTerminalModal()}
            className="h-9 px-4 rounded-md bg-orca-accent hover:bg-orca-accentHover text-white text-xs font-medium flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Terminal Tab (Ctrl+T)</span>
          </button>

          <button
            onClick={() => onOpenTerminalModal('agent-claude')}
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

  const activeSession =
    sessions.find((s) => s.id === (splitMode === 'none' ? activeSessionId : primarySessionId)) || sessions[0];
  const secondarySession = sessions.find((s) => s.id === secondarySessionId);

  const hasDistinctSecondary = secondarySession && secondarySession.id !== activeSession.id;
  const isVerticalSplit = splitMode === 'vertical' && Boolean(hasDistinctSecondary);
  const isHorizontalSplit = splitMode === 'horizontal' && Boolean(hasDistinctSecondary);
  const showSecondary = isVerticalSplit || isHorizontalSplit;
  const orderedSessions = [
    activeSession,
    ...(showSecondary && secondarySession ? [secondarySession] : []),
    ...sessions.filter(
      (session) => session.id !== activeSession.id && (!showSecondary || session.id !== secondarySession?.id)
    ),
  ];

  const containerClass = isVerticalSplit
    ? 'h-full w-full flex overflow-hidden'
    : isHorizontalSplit
      ? 'h-full w-full flex flex-col overflow-hidden'
      : 'flex-1 h-full w-full overflow-hidden';

  return (
    <div className={containerClass}>
      {orderedSessions.map((session) => {
        const isPrimary = session.id === activeSession.id;
        const isActive = session.id === activeSessionId;
        const isSecondary = showSecondary && session.id === secondarySession?.id;
        const isVisible = isPrimary || isSecondary;
        const paneClass = !isVisible
          ? 'hidden'
          : isVerticalSplit
            ? isPrimary
              ? 'w-1/2 h-full border-r border-orca-border relative'
              : 'w-1/2 h-full relative'
            : isHorizontalSplit
              ? isPrimary
                ? 'h-1/2 w-full border-b border-orca-border relative'
                : 'h-1/2 w-full relative'
              : 'w-full h-full relative';

        return (
          <div
            key={session.id}
            className={paneClass}
            onClick={isVisible ? () => setActiveSession(session.id) : undefined}
            onFocusCapture={isVisible ? () => setActiveSession(session.id) : undefined}
          >
            <ErrorBoundary
              onClose={() => {
                void useTerminalStore
                  .getState()
                  .closeSession(session.id)
                  .catch((error) => useNoticeStore.getState().report('Unable to close terminal', error));
              }}
            >
              <Suspense
                fallback={
                  <div role="status" className="p-4 text-sm text-orca-muted">
                    Loading terminal…
                  </div>
                }
              >
                <XTermView sessionId={session.id} isActive={isActive} />
              </Suspense>
            </ErrorBoundary>
          </div>
        );
      })}
    </div>
  );
};
