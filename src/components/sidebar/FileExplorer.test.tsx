import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FileExplorer } from './FileExplorer';
import { explorerReducer } from '../../lib/explorerCache';
import { useEditorStore } from '../../stores/useEditorStore';

const ipc = vi.hoisted(() => ({ listDirectory: vi.fn(), readTextFile: vi.fn() }));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
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

it('bounds cached folders and entries even when every folder is expanded', () => {
  let state = { folders: {}, expanded: new Set(['']) } as Parameters<typeof explorerReducer>[0];
  for (let i = 0; i < 100; ++i) {
    const path = `folder${i}`;
    state = explorerReducer(state, { type: 'toggle', path });
    state = explorerReducer(state, {
      type: 'loaded',
      path,
      listing: {
        entries: Array.from({ length: 500 }, (_, j) => ({ name: `${j}`, path: `${path}/${j}`, is_dir: false })),
        truncated: false,
      },
    });
    expect(Object.keys(state.folders).length).toBeLessThanOrEqual(64);
    expect(
      Object.values(state.folders).reduce((sum, folder) => sum + (folder.listing?.entries.length ?? 0), 0)
    ).toBeLessThanOrEqual(20000);
  }
  expect(state.expanded.has('folder0')).toBe(false);
  expect(state.expanded.has('folder99')).toBe(true);
});

it('clears descendant expansion when a parent is collapsed', () => {
  const state = explorerReducer(
    { folders: {}, expanded: new Set(['', 'src', 'src/deep', 'src/deep/nested']) },
    { type: 'toggle', path: 'src' }
  );
  expect([...state.expanded]).toEqual(['']);
});

it('virtualizes 5000 entries and preserves keyboard navigation across the window', async () => {
  ipc.listDirectory.mockResolvedValue({
    entries: Array.from({ length: 5000 }, (_, i) => ({ name: `file${i}.ts`, path: `file${i}.ts`, is_dir: false })),
    truncated: false,
  });
  render(<FileExplorer root="C:/repo" />);
  await screen.findByRole('treeitem', { name: 'file0.ts' });
  const rendered = screen.getAllByRole('treeitem');
  expect(rendered.length).toBeLessThan(60);
  // Cross the rendered boundary directly instead of repeatedly traversing the
  // viewport; this checks the offscreen focus path even on a busy build machine.
  const last = rendered[rendered.length - 1];
  const nextIndex = Number(last.textContent?.match(/file(\d+)/)?.[1]) + 1;
  last.focus();
  fireEvent.keyDown(last, { key: 'ArrowDown' });
  expect(document.activeElement?.textContent).toBe(`file${nextIndex}.ts`);
  expect(screen.getAllByRole('treeitem').length).toBeLessThan(60);
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
