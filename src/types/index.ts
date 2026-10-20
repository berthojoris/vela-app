export type AgentType =
  'claude_code' | 'gemini_cli' | 'aider' | 'codex' | 'open_code' | 'droid_cli' | 'antigravity' | { custom: string };

export interface TerminalSession {
  id: string;
  title: string;
  shell: string;
  cwd: string;
  worktree_id: string | null;
  cols: number;
  rows: number;
  pid: number | null;
  is_agent: boolean;
  agent_type: AgentType | null;
  /** Frontend-only lifecycle state; the backend wire model does not contain this. */
  exited?: boolean;
}

export interface GitWorktree {
  id: string;
  name: string;
  path: string;
  branch: string;
  is_main: boolean;
  dirty_files_count: number;
  active_agent_name: string | null;
}

export interface FileDiff {
  path: string;
  status: string; // "M", "A", "D", "R"
  additions: number;
  deletions: number;
  diff_content: string;
}

/** Lightweight changed-file entry for the sidebar: status and line counts, no patch text. */
export interface ChangedFile {
  path: string;
  status: string; // git porcelain XY, trimmed: "M", "A", "D", "R", "??", ...
  additions: number;
  deletions: number;
}

export interface WorktreeChanges {
  /** All changed entries reported by git status; `files` may be capped below this. */
  total: number;
  files: ChangedFile[];
}

export interface ShellProfile {
  id: string;
  name: string;
  executable: string;
  args: string[];
  is_agent: boolean;
  agent_type: AgentType | null;
}
