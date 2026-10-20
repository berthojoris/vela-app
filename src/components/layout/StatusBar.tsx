import React from 'react';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { Cpu, Columns2, Rows2, Terminal as TermIcon, ShieldCheck } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { sessions, splitMode } = useTerminalStore();
  const { activeWorktreeId, worktrees } = useWorktreeStore();

  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId);
  const activeAgents = sessions.filter((s) => s.is_agent && !s.exited).length;

  return (
    <footer className="h-6 shrink-0 bg-orca-darker border-t border-orca-border flex items-center justify-between px-3 text-[11px] text-orca-muted select-none font-mono">
      {/* Left items */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orca-emerald animate-pulse" />
          <span className="text-orca-text font-sans font-medium">Vela Core</span>
          <span className="text-[10px] text-orca-muted">v0.1.0</span>
        </div>

        {activeWorktree && (
          <div className="flex items-center gap-1 border-l border-orca-border pl-3">
            <span className="text-orca-muted">Worktree:</span>
            <span className="text-orca-text font-semibold">{activeWorktree.branch}</span>
            {activeWorktree.dirty_files_count > 0 && (
              <span className="text-orca-amber ml-1">({activeWorktree.dirty_files_count} modified)</span>
            )}
          </div>
        )}
      </div>

      {/* Right items */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <TermIcon className="w-3 h-3 text-orca-muted" />
          <span>{sessions.length} sessions</span>
        </div>

        {activeAgents > 0 && (
          <div className="flex items-center gap-1.5 text-orca-emerald bg-orca-emerald/10 px-1.5 py-0.5 rounded border border-orca-emerald/30">
            <Cpu className="w-3 h-3" />
            <span>
              {activeAgents} Agent{activeAgents > 1 ? 's' : ''} Active
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          {splitMode === 'vertical' && <Columns2 className="w-3 h-3 text-orca-accent" />}
          {splitMode === 'horizontal' && <Rows2 className="w-3 h-3 text-orca-accent" />}
          <span className="capitalize">{splitMode} Split</span>
        </div>

        <div className="flex items-center gap-1 border-l border-orca-border pl-3 text-orca-emerald">
          <ShieldCheck className="w-3 h-3" />
          <span>ConPTY Native</span>
        </div>
      </div>
    </footer>
  );
};
