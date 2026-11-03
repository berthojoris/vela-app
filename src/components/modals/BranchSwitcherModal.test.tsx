import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BranchSwitcherModal } from './BranchSwitcherModal';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useDiffStore } from '../../stores/useDiffStore';
import { worktree } from '../../test/helpers';

const ipc = vi.hoisted(() => ({
  listBranches: vi.fn(),
  getWorktreeChanges: vi.fn(),
  switchBranch: vi.fn(),
  listWorktrees: vi.fn(),
  reportError: vi.fn(),
}));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));

const target = { path: 'C:/A', branch: 'main' };
const branches = [
  { name: 'feat/free', is_current: false, checked_out_at: null },
  { name: 'feat/occupied', is_current: false, checked_out_at: 'C:/A/linked' },
  { name: 'main', is_current: true, checked_out_at: 'C:/A' },
];

beforeEach(() => {
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useDiffStore.setState(useDiffStore.getInitialState());
  Object.values(ipc).forEach((mock) => mock.mockReset());
  ipc.listBranches.mockResolvedValue(branches);
  ipc.getWorktreeChanges.mockResolvedValue({ total: 0, files: [] });
  ipc.switchBranch.mockResolvedValue(undefined);
  ipc.listWorktrees.mockResolvedValue([{ ...worktree('A', 'C:/A'), branch: 'feat/free' }]);
  useWorktreeStore.setState({ repoPath: 'C:/A', worktrees: [worktree('A', 'C:/A')] });
});

it('lists branches and disables the current branch and branches checked out elsewhere', async () => {
  render(<BranchSwitcherModal worktree={target} onClose={() => {}} />);

  const current = await screen.findByRole('option', { name: /main current/ });
  const occupied = screen.getByRole('option', { name: /feat\/occupied in use/ });
  const free = screen.getByRole('option', { name: 'feat/free' });
  expect(current).toHaveProperty('disabled', true);
  expect(occupied).toHaveProperty('disabled', true);
  expect(free).toHaveProperty('disabled', false);
  expect(ipc.listBranches).toHaveBeenCalledWith('C:/A');
});

it('switches immediately when the worktree is clean', async () => {
  const onClose = vi.fn();
  render(<BranchSwitcherModal worktree={target} onClose={onClose} />);

  fireEvent.click(await screen.findByRole('option', { name: 'feat/free' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());

  expect(ipc.switchBranch).toHaveBeenCalledWith('C:/A', 'feat/free', false);
  expect(screen.queryByText(/uncommitted change/)).toBeNull();
});

it('asks how to handle uncommitted changes before switching', async () => {
  ipc.getWorktreeChanges.mockResolvedValue({ total: 3, files: [] });
  const onClose = vi.fn();
  render(<BranchSwitcherModal worktree={target} onClose={onClose} />);

  fireEvent.click(await screen.findByRole('option', { name: 'feat/free' }));
  const confirm = await screen.findByRole('button', { name: /Stash, switch & re-apply/ });
  expect(screen.getByText(/3 uncommitted change/)).toBeTruthy();
  expect(ipc.switchBranch).not.toHaveBeenCalled();

  fireEvent.click(confirm);
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(ipc.switchBranch).toHaveBeenCalledWith('C:/A', 'feat/free', true);
});

it('offers the diff view so changes can be committed before switching', async () => {
  ipc.getWorktreeChanges.mockResolvedValue({ total: 1, files: [] });
  const openDiffModal = vi.fn();
  useDiffStore.setState({ openDiffModal });
  const onClose = vi.fn();
  render(<BranchSwitcherModal worktree={target} onClose={onClose} />);

  fireEvent.click(await screen.findByRole('option', { name: 'feat/free' }));
  fireEvent.click(await screen.findByRole('button', { name: /Review & commit first/ }));

  expect(openDiffModal).toHaveBeenCalledWith('C:/A');
  expect(onClose).toHaveBeenCalled();
  expect(ipc.switchBranch).not.toHaveBeenCalled();
});

it('keeps the dialog open and shows the error when the switch fails', async () => {
  ipc.switchBranch.mockRejectedValue('Switched to feat/free, but re-applying the stashed changes failed');
  ipc.getWorktreeChanges.mockResolvedValue({ total: 1, files: [] });
  const onClose = vi.fn();
  render(<BranchSwitcherModal worktree={target} onClose={onClose} />);

  fireEvent.click(await screen.findByRole('option', { name: 'feat/free' }));
  fireEvent.click(await screen.findByRole('button', { name: /Stash, switch & re-apply/ }));

  await screen.findByRole('alert');
  expect(onClose).not.toHaveBeenCalled();
});
