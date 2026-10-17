import { FileDiff, GitWorktree, TerminalSession } from '../types';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const file = (path: string): FileDiff => ({ path, status: 'M', additions: 1, deletions: 0, diff_content: '+change' });
export const session = (id: string): TerminalSession => ({ id, title: id, shell: 'cmd.exe', cwd: `C:/${id}`, worktree_id: null, cols: 80, rows: 24, pid: 123, is_agent: false, agent_type: null, agent_status: null, exited: false });
export const worktree = (id: string, path = `C:/${id}`): GitWorktree => ({ id, path, name: id, branch: id, is_main: false, dirty_files_count: 0, active_agent_name: null });
