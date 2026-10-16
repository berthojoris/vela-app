export type AgentType =
  | 'claude_code'
  | 'gemini_cli'
  | 'aider'
  | 'codex'
  | 'open_code'
  | { custom: string };

export type AgentStatus =
  | { status: 'idle' }
  | { status: 'running'; data: { started_at: number; task: string } }
  | { status: 'waiting_user_input'; data: { prompt_preview: string } }
  | { status: 'completed'; data: { duration_secs: number } }
  | { status: 'failed'; data: { exit_code: number; error_summary: string } };

export interface TerminalSession {
  id: string;
  title: string;
  shell: string;
  cwd: string;
  worktree_id?: string;
  cols: number;
  rows: number;
  pid?: number;
  is_agent: boolean;
  agent_type?: AgentType;
  agent_status?: AgentStatus;
}

export interface GitWorktree {
  id: string;
  name: string;
  path: string;
  branch: string;
  is_main: boolean;
  dirty_files_count: number;
  active_agent_name?: string;
}

export interface FileDiff {
  path: string;
  status: string; // "M", "A", "D", "R"
  additions: number;
  deletions: number;
  diff_content: string;
}

export interface ShellProfile {
  id: string;
  name: string;
  executable: string;
  args: string[];
  is_agent: boolean;
  agent_type?: AgentType;
}

export interface DetectedAgent {
  agent_type: AgentType;
  name: string;
  executable: string;
  available: boolean;
  version?: string;
}
