import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  DetectedAgent,
  AgentType,
  FileDiff,
  GitWorktree,
  ShellProfile,
  TerminalSession,
} from '../types';

export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export const tauriIpc = {
  async reportError(message: string): Promise<void> {
    if (!isTauri()) return;
    await invoke('report_frontend_error', { message: message.slice(0, 8000) });
  },
  onAppError(callback: (message: string) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<string>('app-error', (event) => callback(event.payload));
  },
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
    agentType?: AgentType | null;
  }): Promise<TerminalSession> {
    if (!isTauri()) {
      return {
        id: params.id,
        title: params.title,
        shell: params.shell,
        cwd: params.cwd,
        worktree_id: params.worktreeId ?? null,
        cols: params.cols,
        rows: params.rows,
        pid: null,
        is_agent: params.isAgent,
        agent_type: params.agentType ?? null,
        agent_status: null,
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

  async startTerminalOutput(id: string): Promise<void> {
    if (!isTauri()) return;
    await invoke('start_terminal_output', { id });
  },

  async acknowledgeTerminalOutput(id: string, bytes: number): Promise<void> {
    if (!isTauri()) return;
    await invoke('acknowledge_terminal_output', { id, bytes });
  },

  async findGitRepo(path?: string | null): Promise<string | null> {
    if (!isTauri()) return null;
    return await invoke<string | null>('find_git_repo', { path: path ?? null });
  },

  async getCurrentDir(): Promise<string | null> {
    if (!isTauri()) return null;
    try {
      return await invoke<string>('get_current_dir');
    } catch {
      return null;
    }
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

  async rollbackWorktreeFile(worktreePath: string, filePath: string): Promise<void> {
    if (!isTauri()) return;
    await invoke('rollback_worktree_file', { worktreePath, filePath });
  },

  async resetWorktree(worktreePath: string): Promise<void> {
    if (!isTauri()) return;
    await invoke('reset_worktree', { worktreePath });
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
          agent_type: null,
        },
        {
          id: 'cmd',
          name: 'Command Prompt',
          executable: 'cmd.exe',
          args: [],
          is_agent: false,
          agent_type: null,
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

  async showWindow(): Promise<void> {
    if (!isTauri()) return;
    await invoke('show_window');
  },

  onWindowResized(callback: () => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return getCurrentWindow().onResized(callback);
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
        return selected[0] ? selected[0].replace(/\\/g, '/') : null;
      }
      return typeof selected === 'string' ? selected.replace(/\\/g, '/') : null;
    } catch (err) {
      console.warn('Native dialog plugin failed, falling back to invoke:', err);
      try {
        const fallback = await invoke<string | null>('select_directory');
        return fallback ? fallback.replace(/\\/g, '/') : null;
      } catch (fallbackError) {
        throw new Error(`Unable to open the directory picker: ${String(fallbackError)}. You can type the directory path instead.`);
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

  onPtyError(id: string, callback: (message: string) => void): Promise<UnlistenFn> {
    if (!isTauri()) return Promise.resolve(() => {});
    return listen<string>(`pty-error-${id}`, (event) => callback(event.payload));
  },

  onPtyExit(id: string, callback: (exitCode: number | null) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return Promise.resolve(() => {});
    }
    return listen<number | null>(`pty-exit-${id}`, (event) => {
      callback(event.payload);
    });
  },
};
