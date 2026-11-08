import { useShallow } from 'zustand/react/shallow';
import React, { useEffect, useState } from 'react';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { Cpu, Columns2, Rows2, Terminal as TermIcon, ShieldCheck } from 'lucide-react';
import { version as bundleVersion } from '../../../package.json';
import { isTauri } from '../../lib/tauriIpc';

export const StatusBar: React.FC = () => {
  const { sessionCount, activeAgents, splitMode } = useTerminalStore(
    useShallow((state) => ({
      sessionCount: state.sessions.length,
      activeAgents: state.sessions.reduce((count, s) => count + (s.is_agent && !s.exited ? 1 : 0), 0),
      splitMode: state.splitMode,
    }))
  );
  const { hasActiveWorktree, branch, dirtyCount, statusError } = useWorktreeStore(
    useShallow((state) => {
      const wt = state.worktrees.find((w) => w.id === state.activeWorktreeId);
      return {
        hasActiveWorktree: Boolean(wt),
        branch: wt?.branch ?? '',
        dirtyCount: wt?.dirty_files_count ?? null,
        statusError: wt?.status_error ?? null,
      };
    })
  );
  // Never hardcode this string: the bundled package.json version is the initial/fallback
  // value, and the running binary's real version (tauri.conf.json -> ProductVersion)
  // replaces it when the Tauri IPC is available.
  const [appVersion, setAppVersion] = useState(bundleVersion);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const runtimeVersion = await getVersion();
        if (!cancelled && runtimeVersion) setAppVersion(runtimeVersion);
      } catch {
        // Keep the bundled version when the app metadata is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="h-6 shrink-0 bg-orca-darker border-t border-orca-border flex items-center justify-between px-3 text-[11px] text-orca-muted select-none font-mono">
      {/* Left items */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orca-emerald animate-pulse" />
          <span className="text-orca-text font-sans font-medium">Vela Core</span>
          <span className="text-[10px] text-orca-muted">v{appVersion}</span>
        </div>

        {hasActiveWorktree && (
          <div className="flex items-center gap-1 border-l border-orca-border pl-3">
            <span className="text-orca-muted">Worktree:</span>
            <span className="text-orca-text font-semibold">{branch}</span>
            {dirtyCount === null ? (
              <span className="text-orca-muted ml-1" title={statusError || 'Refresh to check Git status'}>
                ({statusError ? 'status unavailable' : 'not checked'})
              </span>
            ) : (
              dirtyCount > 0 && <span className="text-orca-amber ml-1">({dirtyCount} modified)</span>
            )}
          </div>
        )}
      </div>

      {/* Right items */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <TermIcon className="w-3 h-3 text-orca-muted" />
          <span>{sessionCount} sessions</span>
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
