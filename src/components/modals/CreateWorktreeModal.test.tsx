import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { session, worktree } from '../../test/helpers';
const ipc = vi.hoisted(() => ({ spawnTerminal: vi.fn(), createWorktree: vi.fn(), listWorktrees: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { CreateWorktreeModal } from './CreateWorktreeModal';

beforeEach(() => {
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useTerminalStore.setState({ defaultProfileId: 'cmd', profiles: [{ id: 'cmd', name: 'Command Prompt', executable: 'cmd.exe', args: [], is_agent: false, agent_type: null }] });
  useWorktreeStore.setState({ repoPath: 'C:/repo' });
  ipc.spawnTerminal.mockReset(); ipc.createWorktree.mockReset();
  ipc.listWorktrees.mockResolvedValue([worktree('task')]);
});
it('retries terminal launch without recreating an already created worktree', async () => {
  const close = vi.fn();
  ipc.createWorktree.mockResolvedValue(worktree('task'));
  ipc.spawnTerminal.mockRejectedValueOnce('Executable is unavailable').mockResolvedValueOnce(session('new'));
  render(<CreateWorktreeModal isOpen onClose={close} />);
  fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'task' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create worktree' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Worktree was created');
  fireEvent.click(screen.getByRole('button', { name: 'Retry terminal launch' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(ipc.createWorktree).toHaveBeenCalledTimes(1);
  expect(ipc.spawnTerminal).toHaveBeenCalledTimes(2);
});
