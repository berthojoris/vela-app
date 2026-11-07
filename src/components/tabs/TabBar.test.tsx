import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { session } from '../../test/helpers';

const ipc = vi.hoisted(() => ({ killTerminal: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));

import { TabBar } from './TabBar';
import { useTerminalStore } from '../../stores/useTerminalStore';

const openTabBar = () => render(<TabBar onOpenTerminalModal={() => {}} />);

beforeEach(() => {
  useTerminalStore.setState(useTerminalStore.getInitialState());
  ipc.killTerminal.mockReset();
  ipc.killTerminal.mockResolvedValue(undefined);
  useTerminalStore.setState({
    sessions: [session('alpha')],
    activeSessionId: 'alpha',
    primarySessionId: 'alpha',
  });
});

it('asks for confirmation before killing a running terminal', async () => {
  openTabBar();

  fireEvent.click(screen.getByRole('button', { name: 'Close alpha tab' }));

  expect(screen.getByRole('dialog', { name: 'Close a running terminal?' })).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Keep open' })).toBe(document.activeElement));
  expect(ipc.killTerminal).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }));

  await waitFor(() => expect(ipc.killTerminal).toHaveBeenCalledWith('alpha'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(useTerminalStore.getState().sessions).toHaveLength(0);
});

it('keeps the terminal alive when the confirmation is cancelled', () => {
  openTabBar();

  fireEvent.click(screen.getByRole('button', { name: 'Close alpha tab' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(ipc.killTerminal).not.toHaveBeenCalled();
  expect(useTerminalStore.getState().sessions).toHaveLength(1);
});

it('cancels the pending close with Escape', () => {
  openTabBar();

  fireEvent.click(screen.getByRole('button', { name: 'Close alpha tab' }));
  fireEvent.keyDown(window, { key: 'Escape' });

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(ipc.killTerminal).not.toHaveBeenCalled();
});

it('confirms Ctrl+W instead of closing the active tab immediately', () => {
  openTabBar();

  fireEvent.keyDown(window, { key: 'w', ctrlKey: true });

  expect(screen.getByRole('dialog', { name: 'Close a running terminal?' })).toBeTruthy();
  expect(ipc.killTerminal).not.toHaveBeenCalled();
});

it('closes a session whose process already exited without asking', async () => {
  useTerminalStore.setState({
    sessions: [{ ...session('alpha'), exited: true }],
    activeSessionId: 'alpha',
    primarySessionId: 'alpha',
  });
  openTabBar();

  fireEvent.click(screen.getByRole('button', { name: 'Close alpha tab' }));

  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(useTerminalStore.getState().sessions).toHaveLength(0));
  expect(ipc.killTerminal).not.toHaveBeenCalled();
});
