import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FileExplorer } from './FileExplorer';
import { useEditorStore } from '../../stores/useEditorStore';

const ipc = vi.hoisted(() => ({ listDirectory: vi.fn(), readTextFile: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState());
  ipc.listDirectory.mockReset().mockImplementation(async (_root, path) => ({
    entries: path
      ? [{ name: 'main.ts', path: 'src/main.ts', is_dir: false }]
      : [{ name: 'src', path: 'src', is_dir: true }],
    truncated: false,
  }));
  ipc.readTextFile
    .mockReset()
    .mockResolvedValue({ content: 'const a = 1;', revision: 'r1', line_ending: 'LF', has_bom: false });
});

it('loads directories lazily and opens files only on double click or Enter', async () => {
  render(<FileExplorer root="C:/repo" />);
  const folder = await screen.findByRole('treeitem', { name: 'src' });
  expect(ipc.listDirectory).toHaveBeenCalledTimes(1);
  fireEvent.click(folder);
  const file = await screen.findByRole('treeitem', { name: 'main.ts' });
  expect(ipc.listDirectory).toHaveBeenCalledWith('C:/repo', 'src');
  fireEvent.click(file);
  expect(ipc.readTextFile).not.toHaveBeenCalled();
  fireEvent.doubleClick(file);
  await waitFor(() => expect(useEditorStore.getState().documents).toHaveLength(1));
  expect(ipc.readTextFile).toHaveBeenCalledWith('C:/repo', 'src/main.ts');
  fireEvent.keyDown(file, { key: 'Enter' });
  expect(useEditorStore.getState().documents).toHaveLength(1);
  fireEvent.click(folder);
  fireEvent.click(folder);
  expect(ipc.listDirectory).toHaveBeenCalledTimes(2);
});

it('does not read directories in Git mode and keeps expansion on return', async () => {
  const { rerender } = render(<FileExplorer root="C:/repo" enabled={false} />);
  expect(ipc.listDirectory).not.toHaveBeenCalled();
  rerender(<FileExplorer root="C:/repo" enabled />);
  fireEvent.click(await screen.findByRole('treeitem', { name: 'src' }));
  await screen.findByRole('treeitem', { name: 'main.ts' });
  rerender(<FileExplorer root="C:/repo" enabled={false} />);
  rerender(<FileExplorer root="C:/repo" enabled />);
  expect(screen.getByRole('treeitem', { name: 'main.ts' })).toBeTruthy();
  expect(ipc.listDirectory).toHaveBeenCalledTimes(2);
});

it('shows retryable listing errors and ignores results from an unmounted root', async () => {
  ipc.listDirectory.mockRejectedValueOnce(new Error('Access denied'));
  const { unmount } = render(<FileExplorer root="C:/repo" />);
  expect((await screen.findByRole('alert')).textContent).toContain('Access denied');
  fireEvent.click(screen.getByText('Retry'));
  await screen.findByRole('treeitem', { name: 'src' });
  let finish!: (value: unknown) => void;
  ipc.listDirectory.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('treeitem', { name: 'src' }));
  unmount();
  await act(async () => finish({ entries: [], truncated: false }));
  expect(useEditorStore.getState().documents).toHaveLength(0);
});
