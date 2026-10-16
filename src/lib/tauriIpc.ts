import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  DetectedAgent,
  FileDiff,
  GitWorktree,
  ShellProfile,
  TerminalSession,
} from '../types';

export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export const tauriIpc = {
  async spawnTerminal(params: {
    id: string;
    title: string;
    shell: string;
    args: string[];
    cwd: string;
    cols: number;
    rows: number;
    worktreeId?: string;
    isAgent: boolean;
    agentType?: string;
  }): Promise<TerminalSession> {
    if (!isTauri()) {
      return {
        id: params.id,
        title: params.title,
        shell: params.shell,
        cwd: params.cwd,
        cols: params.cols,
        rows: params.rows,
        is_agent: params.isAgent,
      };
    }
    return await invoke<TerminalSession>('spawn_terminal', {
      id: params.id,
      title: params.title,
      shell: params.shell,
      args: params.args,
      cwd: params.cwd,
      cols: params.cols,
      rows: params.rows,
      worktreeId: params.worktreeId,
      isAgent: params.isAgent,
      agentType: params.agentType,
    });
  },

  async writeTerminal(id: string, data: string): Promise<void> {
    if (!isTauri()) return;
    await invoke('write_terminal', { id, data });
  },

  async resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
    if (!isTauri()) return;
    await invoke('resize_terminal', { id, cols, rows });
  },

  async killTerminal(id: string): Promise<void> {
    if (!isTauri()) return;
    await invoke('kill_terminal', { id });
  },

  async findGitRepo(path: string): Promise<string | null> {
    if (!isTauri()) return null;
    return await invoke<string | null>('find_git_repo', { path });
  },

  async listWorktrees(repoPath: string): Promise<GitWorktree[]> {
    if (!isTauri()) return [];
    return await invoke<GitWorktree[]>('list_worktrees', { repoPath });
  },

  async createWorktree(
    repoPath: string,
    branch: string,
    baseBranch?: string
  ): Promise<GitWorktree> {
    if (!isTauri()) throw new Error('Not running in Tauri');
    return await invoke<GitWorktree>('create_worktree', {
      repoPath,
      branch,
      baseBranch,
    });
  },

  async removeWorktree(
    repoPath: string,
    worktreePath: string,
    force: boolean = false
  ): Promise<void> {
    if (!isTauri()) return;
    await invoke('remove_worktree', { repoPath, worktreePath, force });
  },

  async getWorktreeDiff(worktreePath: string): Promise<FileDiff[]> {
    if (!isTauri()) return [];
    return await invoke<FileDiff[]>('get_worktree_diff', { worktreePath });
  },

  async commitWorktree(worktreePath: string, message: string): Promise<string> {
    if (!isTauri()) return 'Committed (mock)';
    return await invoke<string>('commit_worktree', { worktreePath, message });
  },

  async getShellProfiles(): Promise<ShellProfile[]> {
    if (!isTauri()) {
      return [
        {
          id: 'pwsh',
          name: 'PowerShell',
          executable: 'powershell.exe',
          args: [],
          is_agent: false,
        },
        {
          id: 'cmd',
          name: 'Command Prompt',
          executable: 'cmd.exe',
          args: [],
          is_agent: false,
        },
      ];
    }
    return await invoke<ShellProfile[]>('get_shell_profiles');
  },

  async detectAgents(): Promise<DetectedAgent[]> {
    if (!isTauri()) return [];
    return await invoke<DetectedAgent[]>('detect_agents');
  },

  async toggleMaximize(): Promise<boolean> {
    if (!isTauri()) return false;
    return await invoke<boolean>('toggle_maximize');
  },

  async minimizeWindow(): Promise<void> {
    if (!isTauri()) return;
    await invoke('minimize_window');
  },

  async closeWindow(): Promise<void> {
    if (!isTauri()) return;
    await invoke('close_window');
  },

  async isWindowMaximized(): Promise<boolean> {
    if (!isTauri()) return false;
    return await invoke<boolean>('is_window_maximized');
  },

  async selectDirectory(options?: {
    title?: string;
    defaultPath?: string;
  }): Promise<string | null> {
    if (!isTauri()) return null;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: options?.title || 'Select Directory',
        defaultPath: options?.defaultPath,
      });
      if (Array.isArray(selected)) {
        return selected[0] ?? null;
      }
      return selected;
    } catch (err) {
      console.warn('Native dialog plugin failed, falling back to invoke:', err);
      try {
        return await invoke<string | null>('select_directory');
      } catch {
        return null;
      }
    }
  },

  onPtyOutput(
    id: string,
    callback: (bytes: Uint8Array) => void
  ): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<number[]>(`pty-output-${id}`, (event) => {
      callback(new Uint8Array(event.payload));
    });
  },

  onPtyExit(id: string, callback: () => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen(`pty-exit-${id}`, () => {
      callback();
    });
  },
};
