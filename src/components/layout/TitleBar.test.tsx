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
beforeEach(() => {
  ipc.toggleMaximize.mockClear();
  ipc.isWindowMaximized.mockReset();
  ipc.isWindowMaximized.mockResolvedValue(false);
});

it('ignores double-clicks on window controls, including SVG children', async () => {
  render(<TitleBar />);
  fireEvent.doubleClick(screen.getByTitle('Minimize').querySelector('svg')!);
  fireEvent.doubleClick(screen.getByTitle('Maximize'));
  fireEvent.doubleClick(screen.getByTitle('Close'));
  expect(ipc.toggleMaximize).not.toHaveBeenCalled();
  fireEvent.doubleClick(screen.getByText('Vela'));
  await waitFor(() => expect(ipc.toggleMaximize).toHaveBeenCalledTimes(1));
});

it('keeps window control buttons flush with the top-right edge and uses macOS terminal badge colors', () => {
  const { container } = render(<TitleBar />);
  const header = container.querySelector('header')!;
  expect(header.className).toContain('pr-0');

  const controlsGroup = screen.getByRole('group', { name: 'Window controls' });
  expect(controlsGroup.className).toContain('h-full');
  expect(controlsGroup.className).toContain('items-stretch');

  const minimizeBtn = screen.getByTitle('Minimize');
  const maximizeBtn = screen.getByTitle('Maximize');
  const closeBtn = screen.getByTitle('Close');

  for (const btn of [minimizeBtn, maximizeBtn, closeBtn]) {
    expect(btn.className).toContain('h-full');
    expect(btn.className).toContain('rounded-none');
  }

  expect(minimizeBtn.querySelector('span')?.className).toContain('bg-[#FEBC2E]');
  expect(maximizeBtn.querySelector('span')?.className).toContain('bg-[#28C840]');
  expect(closeBtn.querySelector('span')?.className).toContain('bg-[#FF5F57]');
});

it('keeps every drag region disabled while the window is maximized', async () => {
  ipc.isWindowMaximized.mockResolvedValue(true);
  const { container } = render(<TitleBar />);
  const header = container.querySelector('header')!;

  // Unknown native state is treated as "do not drag" so a maximized startup window
  // can never be pulled out of maximize mode before the first state read resolves.
  expect(header.getAttribute('data-tauri-drag-region')).toBe('false');

  await waitFor(() => expect(screen.getByTitle('Restore Down')).toBeTruthy());
  const dragRegions = [header, ...Array.from(header.querySelectorAll('[data-tauri-drag-region]'))];
  expect(dragRegions.length).toBeGreaterThan(1);
  for (const region of dragRegions) {
    expect(region.getAttribute('data-tauri-drag-region')).toBe('false');
  }
});

it('enables dragging only when the window is restored', async () => {
  const { container } = render(<TitleBar />);
  const header = container.querySelector('header')!;

  await waitFor(() => expect(header.getAttribute('data-tauri-drag-region')).toBe('true'));

  fireEvent.click(screen.getByTitle('Maximize'));
  await waitFor(() => expect(header.getAttribute('data-tauri-drag-region')).toBe('false'));
  expect(screen.getByTitle('Restore Down')).toBeTruthy();
});
