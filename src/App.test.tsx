import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { useWorktreeStore } from './stores/useWorktreeStore';
import { useDiffStore } from './stores/useDiffStore';
import { useTerminalStore } from './stores/useTerminalStore';

const ipc = vi.hoisted(() => ({
  getShellProfiles: vi.fn(async () => []),
  onAppError: vi.fn(async () => () => {}),
  onWindowCloseRequested: vi.fn(async () => () => {}),
  listWorktrees: vi.fn(async () => []),
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
afterEach(() => vi.useRealTimers());

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
