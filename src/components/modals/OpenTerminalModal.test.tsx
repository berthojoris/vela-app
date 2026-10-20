import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { deferred, session } from '../../test/helpers';
import { TerminalSession } from '../../types';
const ipc = vi.hoisted(() => ({ spawnTerminal: vi.fn(), selectDirectory: vi.fn(), getShellProfiles: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { OpenTerminalModal } from './OpenTerminalModal';

beforeEach(() => {
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useTerminalStore.setState({
    defaultProfileId: 'cmd',
    profiles: [
      { id: 'cmd', name: 'Command Prompt', executable: 'cmd.exe', args: [], is_agent: false, agent_type: null },
    ],
  });
  ipc.spawnTerminal.mockReset();
});
it('shows launch errors inline and keeps input available for retry', async () => {
  const close = vi.fn();
  ipc.spawnTerminal.mockRejectedValue('Directory does not exist');
  render(<OpenTerminalModal isOpen onClose={close} />);
  fireEvent.change(screen.getByLabelText('Working directory path'), { target: { value: 'C:/missing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Launch Terminal' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Directory does not exist');
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Working directory path')).toHaveProperty('value', 'C:/missing');
  expect(useTerminalStore.getState().sessions).toHaveLength(0);
});
it('submits once and does not close on Escape while startup is pending', async () => {
  const pending = deferred<TerminalSession>();
  const close = vi.fn();
  ipc.spawnTerminal.mockReturnValue(pending.promise);
  render(<OpenTerminalModal isOpen onClose={close} />);
  const form = screen.getByRole('button', { name: 'Launch Terminal' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(ipc.spawnTerminal).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve(session('new'));
    await pending.promise;
  });
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
it('does not silently replace a missing requested agent with PowerShell', () => {
  render(<OpenTerminalModal isOpen initialProfileId="agent-claude" onClose={() => {}} />);
  expect(screen.getByRole('button', { name: 'Launch Terminal' })).toHaveProperty('disabled', true);
  expect(ipc.spawnTerminal).not.toHaveBeenCalled();
});
