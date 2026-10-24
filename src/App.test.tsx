import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { useWorktreeStore } from './stores/useWorktreeStore';
import { useDiffStore } from './stores/useDiffStore';
import { useTerminalStore } from './stores/useTerminalStore';
import { useEditorStore } from './stores/useEditorStore';
import { worktree } from './test/helpers';

const ipc = vi.hoisted(() => ({
  getShellProfiles: vi.fn(async () => []),
  onAppError: vi.fn(async () => () => {}),
  listWorktrees: vi.fn(async () => []),
  readWorktreeBranches: vi.fn(async () => [] as (string | null)[]),
}));
vi.mock('./lib/tauriIpc', () => ({ tauriIpc: ipc }));
vi.mock('./components/layout/TitleBar', () => ({ TitleBar: () => null }));
vi.mock('./components/tabs/TabBar', () => ({ TabBar: () => null }));
vi.mock('./components/terminal/TerminalGrid', () => ({ TerminalGrid: () => null }));
vi.mock('./components/layout/StatusBar', () => ({ StatusBar: () => null }));
vi.mock('./components/sidebar/WorktreeSidebar', () => ({ WorktreeSidebar: () => null }));
vi.mock('./components/diff/DiffViewerModal', () => ({ DiffViewerModal: () => null }));
vi.mock('./components/modals/CreateWorktreeModal', () => ({ CreateWorktreeModal: () => null }));
vi.mock('./components/modals/OpenTerminalModal', () => ({ OpenTerminalModal: () => null }));
vi.mock('./components/editor/EditorWorkspace', () => ({ EditorWorkspace: () => null }));
afterEach(() => vi.useRealTimers());

it('shows the Editor tab only while files are open and returns to Terminal after the last close', async () => {
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useDiffStore.setState(useDiffStore.getInitialState());
  useEditorStore.setState(useEditorStore.getInitialState());
  const { queryByRole } = render(<App />);
  expect(queryByRole('button', { name: /^Editor/ })).toBeNull();
  const doc = {
    id: 'c:/repo/a.ts',
    root: 'C:/repo',
    path: 'a.ts',
    content: 'x',
    savedContent: 'x',
    revision: 'v1',
    line_ending: 'LF' as const,
    has_bom: false,
    saving: false,
    error: null,
  };
  await act(async () =>
    useEditorStore.setState({ documents: [doc], activeDocumentId: doc.id, workspaceView: 'editor' })
  );
  expect(queryByRole('button', { name: /^Editor/ })).not.toBeNull();
  await act(async () => {
    useEditorStore.getState().closeFile(doc.id);
  });
  expect(queryByRole('button', { name: /^Editor/ })).toBeNull();
  expect(useEditorStore.getState().workspaceView).toBe('terminal');
});

it('pauses timed and focus refreshes while Diff is open and resumes after closing', async () => {
  vi.useFakeTimers();
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useDiffStore.setState(useDiffStore.getInitialState());
  render(<App />);
  await act(async () => {
    useWorktreeStore.setState({ repoPath: 'C:/A', autoGitStatus: true });
    useDiffStore.setState({ isOpen: true });
  });
  ipc.listWorktrees.mockClear();
  fireEvent.focus(window);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(ipc.listWorktrees).not.toHaveBeenCalled();
  await act(async () => useDiffStore.setState({ isOpen: false }));
  fireEvent.focus(window);
  await act(async () => {});
  expect(ipc.listWorktrees).toHaveBeenCalledWith('C:/A', true);
});

it('follows a branch switch on window focus even while Git auto-check is OFF', async () => {
  vi.useFakeTimers();
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useDiffStore.setState(useDiffStore.getInitialState());
  render(<App />);
  await act(async () => {
    useWorktreeStore.setState({
      repoPath: 'C:/A',
      autoGitStatus: false,
      worktrees: [worktree('main', 'C:/A')],
    });
  });
  ipc.readWorktreeBranches.mockClear();
  ipc.readWorktreeBranches.mockResolvedValue(['feat/switched']);
  ipc.listWorktrees.mockClear();

  await act(async () => {
    fireEvent.focus(window);
  });

  expect(ipc.readWorktreeBranches).toHaveBeenCalledWith(['C:/A']);
  expect(useWorktreeStore.getState().worktrees[0].branch).toBe('feat/switched');
  expect(ipc.listWorktrees).not.toHaveBeenCalled();
});
