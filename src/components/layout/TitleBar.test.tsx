import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TitleBar } from './TitleBar';

const ipc = vi.hoisted(() => ({
  isWindowMaximized: vi.fn(async () => false),
  onWindowResized: vi.fn(async () => () => {}),
  toggleMaximize: vi.fn(async () => true),
}));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
beforeEach(() => ipc.toggleMaximize.mockClear());

it('ignores double-clicks on window controls, including SVG children', async () => {
  render(<TitleBar />);
  fireEvent.doubleClick(screen.getByTitle('Minimize').querySelector('svg')!);
  fireEvent.doubleClick(screen.getByTitle('Maximize'));
  fireEvent.doubleClick(screen.getByTitle('Close'));
  expect(ipc.toggleMaximize).not.toHaveBeenCalled();
  fireEvent.doubleClick(screen.getByText('Vela'));
  await waitFor(() => expect(ipc.toggleMaximize).toHaveBeenCalledTimes(1));
});
