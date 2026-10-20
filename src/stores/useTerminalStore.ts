import { create } from 'zustand';
import { AgentType, ShellProfile, TerminalSession } from '../types';
import { tauriIpc } from '../lib/tauriIpc';
import { useNoticeStore } from './useNoticeStore';
import { formatTabTitle } from '../lib/shellIntegration';

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  primarySessionId: string | null;
  secondarySessionId: string | null;
  splitMode: 'none' | 'vertical' | 'horizontal';
  profiles: ShellProfile[];
  defaultProfileId: string;

  // Actions
  createSession: (params?: {
    shell?: string;
    title?: string;
    cwd?: string;
    args?: string[];
    worktreeId?: string;
    isAgent?: boolean;
    agentType?: AgentType | null;
  }) => Promise<TerminalSession>;
  closeSession: (id: string) => Promise<void>;
  markSessionExited: (id: string) => void;
  updateSessionCwd: (id: string, cwd: string) => void;
  setActiveSession: (id: string) => void;
  setSecondarySession: (id: string | null) => void;
  setSplitMode: (mode: 'none' | 'vertical' | 'horizontal') => void;
  fetchProfiles: () => Promise<void>;
  renameSession: (id: string, newTitle: string) => void;
}

// Drop the retired recent-directory history from older builds
let pendingLaunches = 0;
try {
  localStorage.removeItem('vela_recent_dirs');
  localStorage.removeItem('orca_recent_dirs');
} catch {}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  primarySessionId: null,
  secondarySessionId: null,
  splitMode: 'none',
  profiles: [],
  defaultProfileId: '',
  createSession: async (params = {}) => {
    if (get().sessions.length + pendingLaunches >= 32)
      throw new Error('The 32 tab limit has been reached. Close an unused tab first.');
    ++pendingLaunches;
    try {
      const { profiles, defaultProfileId } = get();

      const selectedProfile = profiles.find((p) => p.id === defaultProfileId) || profiles[0];

      const shell = params.shell || selectedProfile?.executable || 'powershell.exe';
      // Agent profiles reuse the shell executable (OpenCode runs in powershell.exe),
      // so match on agent-ness too; otherwise a PowerShell tab inherits OpenCode's
      // agent type and arguments.
      const shellProfile = params.shell
        ? profiles.find(
            (profile) =>
              profile.executable.toLowerCase() === shell.toLowerCase() && profile.is_agent === (params.isAgent ?? false)
          )
        : selectedProfile;
      const args = params.args ?? shellProfile?.args ?? [];
      const isAgent = params.isAgent ?? shellProfile?.is_agent ?? false;

      const id = `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const title =
        params.title || (isAgent ? shellProfile?.name || 'AI Agent' : formatTabTitle(shellProfile?.name || 'Terminal'));

      const cwd = params.cwd || '';

      // Call Rust backend to spawn ConPTY
      const newSession = await tauriIpc.spawnTerminal({
        id,
        title,
        shell,
        args,
        cwd,
        cols: 80,
        rows: 24,
        worktreeId: params.worktreeId,
        isAgent,
        // An explicit null means "not an agent"; only fall back when it was omitted.
        agentType: params.agentType !== undefined ? params.agentType : shellProfile?.agent_type,
      });

      set((state) => ({
        sessions: [...state.sessions, { ...newSession, exited: false }],
        activeSessionId: newSession.id,
        primarySessionId: newSession.id,
      }));

      return newSession;
    } finally {
      --pendingLaunches;
    }
  },

  closeSession: async (id: string) => {
    if (!get().sessions.find((session) => session.id === id)?.exited) {
      await tauriIpc.killTerminal(id);
    }

    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id);
      let nextActiveId = state.activeSessionId;

      if (state.activeSessionId === id) {
        nextActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }

      const nextPrimary = remaining.some((session) => session.id === state.primarySessionId)
        ? state.primarySessionId
        : nextActiveId;
      const nextSecondary =
        remaining.find((session) => session.id === state.secondarySessionId && session.id !== nextPrimary)?.id ?? null;

      return {
        sessions: remaining,
        activeSessionId: nextActiveId,
        primarySessionId: nextPrimary,
        secondarySessionId: nextSecondary,
        splitMode: nextSecondary ? state.splitMode : 'none',
      };
    });
  },

  updateSessionCwd: (id, cwd) => {
    set((state) => {
      const session = state.sessions.find((candidate) => candidate.id === id);
      if (!session || session.exited || session.cwd === cwd) return state;
      return {
        sessions: state.sessions.map((candidate) =>
          candidate.id === id ? { ...candidate, cwd, worktree_id: null } : candidate
        ),
      };
    });
  },

  markSessionExited: (id: string) => {
    set((state) => ({
      sessions: state.sessions.map((session) => (session.id === id ? { ...session, exited: true } : session)),
    }));
  },

  setActiveSession: (id: string) => {
    set((state) => {
      if (!state.sessions.some((session) => session.id === id)) return state;
      return {
        activeSessionId: id,
        primarySessionId: state.splitMode !== 'none' && id === state.secondarySessionId ? state.primarySessionId : id,
      };
    });
  },

  setSecondarySession: (id: string | null) => {
    const state = get();
    if (id && id !== state.primarySessionId && state.sessions.some((session) => session.id === id)) {
      set({ secondarySessionId: id });
    } else if (!id) {
      set({ secondarySessionId: null, splitMode: 'none', primarySessionId: state.activeSessionId });
    }
  },

  setSplitMode: (mode: 'none' | 'vertical' | 'horizontal') => {
    const { sessions, activeSessionId } = get();
    if (mode !== 'none' && sessions.length > 1) {
      const secondary = sessions.find((s) => s.id !== activeSessionId);
      set({ splitMode: mode, primarySessionId: activeSessionId, secondarySessionId: secondary?.id ?? null });
    } else {
      set({ splitMode: 'none', primarySessionId: activeSessionId, secondarySessionId: null });
    }
  },

  fetchProfiles: async () => {
    try {
      const profiles = await tauriIpc.getShellProfiles();
      // Prefer a plain shell: agent profiles are only offered when installed.
      const defaultProfile = profiles.find((profile) => !profile.is_agent) ?? profiles[0];
      set({
        profiles,
        defaultProfileId: defaultProfile?.id || '',
      });
    } catch (e) {
      useNoticeStore.getState().report('Unable to load shell profiles. You can retry from the terminal dialog', e);
    }
  },

  renameSession: (id: string, newTitle: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, title: newTitle } : s)),
    }));
  },
}));
