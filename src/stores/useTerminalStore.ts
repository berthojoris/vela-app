import { create } from 'zustand';
import { AgentType, ShellProfile, TerminalSession } from '../types';
import { tauriIpc } from '../lib/tauriIpc';

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
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
  setActiveSession: (id: string) => void;
  setSecondarySession: (id: string | null) => void;
  setSplitMode: (mode: 'none' | 'vertical' | 'horizontal') => void;
  fetchProfiles: () => Promise<void>;
  renameSession: (id: string, newTitle: string) => void;
}

// Drop the retired recent-directory history from older builds
try {
  localStorage.removeItem('vela_recent_dirs');
  localStorage.removeItem('orca_recent_dirs');
} catch {}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  secondarySessionId: null,
  splitMode: 'none',
  profiles: [],
  defaultProfileId: 'pwsh',
  createSession: async (params = {}) => {
    const { sessions, profiles, defaultProfileId } = get();

    const selectedProfile =
      profiles.find((p) => p.id === defaultProfileId) || profiles[0];

    const shell = params.shell || selectedProfile?.executable || 'powershell.exe';
    const shellProfile = profiles.find(
      (profile) => profile.executable.toLowerCase() === shell.toLowerCase()
    );
    const args =
      params.args ??
      shellProfile?.args ??
      (shell.toLowerCase() === 'claude'
        ? ['--dangerously-skip-permissions']
        : selectedProfile?.args ?? []);
    const isAgent = params.isAgent ?? shellProfile?.is_agent ?? selectedProfile?.is_agent ?? false;

    const id = `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const title =
      params.title ||
      (isAgent ? 'AI Agent' : selectedProfile?.name || 'Terminal');

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
      agentType: params.agentType ?? shellProfile?.agent_type,
    });

    set((state) => ({
      sessions: [...state.sessions, { ...newSession, exited: false }],
      activeSessionId: newSession.id,
    }));

    return newSession;
  },

  closeSession: async (id: string) => {
    await tauriIpc.killTerminal(id);

    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id);
      let nextActiveId = state.activeSessionId;

      if (state.activeSessionId === id) {
        nextActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }

      let nextSecondary = state.secondarySessionId;
      if (state.secondarySessionId === id) {
        nextSecondary = null;
      }

      return {
        sessions: remaining,
        activeSessionId: nextActiveId,
        secondarySessionId: nextSecondary,
        splitMode: nextSecondary ? state.splitMode : 'none',
      };
    });
  },

  markSessionExited: (id: string) => {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, exited: true } : session
      ),
    }));
  },

  setActiveSession: (id: string) => {
    set({ activeSessionId: id });
  },

  setSecondarySession: (id: string | null) => {
    set({ secondarySessionId: id });
  },

  setSplitMode: (mode: 'none' | 'vertical' | 'horizontal') => {
    const { sessions, activeSessionId } = get();
    if (mode !== 'none' && sessions.length > 1) {
      const secondary = sessions.find((s) => s.id !== activeSessionId);
      set({ splitMode: mode, secondarySessionId: secondary ? secondary.id : null });
    } else {
      set({ splitMode: mode, secondarySessionId: null });
    }
  },

  fetchProfiles: async () => {
    try {
      const profiles = await tauriIpc.getShellProfiles();
      set({
        profiles,
        defaultProfileId: profiles[0]?.id || 'pwsh',
      });
    } catch (e) {
      console.error('Failed to fetch profiles', e);
    }
  },

  renameSession: (id: string, newTitle: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title: newTitle } : s
      ),
    }));
  },
}));
