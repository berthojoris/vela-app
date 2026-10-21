import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { version } from '../../../package.json';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { worktree } from '../../test/helpers';
import { StatusBar } from './StatusBar';

const { getVersion } = vi.hoisted(() => ({ getVersion: vi.fn() }));

vi.mock('@tauri-apps/api/app', () => ({ getVersion }));

beforeEach(() => {
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  getVersion.mockReset();
});

afterEach(() => {
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

it('reads the product version and distinguishes unavailable Git status', () => {
  useWorktreeStore.setState({
    activeWorktreeId: 'A',
    worktrees: [{ ...worktree('A'), dirty_files_count: null, status_error: 'inaccessible index' }],
  });
  render(<StatusBar />);
  expect(screen.getByText(`v${version}`)).toBeTruthy();
  expect(screen.getByTitle('inaccessible index').textContent).toContain('status unavailable');
});

it('shows the running app version instead of the bundled one', async () => {
  (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  getVersion.mockResolvedValue('9.9.9');
  render(<StatusBar />);
  expect(await screen.findByText('v9.9.9')).toBeTruthy();
  expect(screen.queryByText(`v${version}`)).toBeNull();
});
