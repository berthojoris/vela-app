import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { EditorWorkspace } from './EditorWorkspace';
import { useEditorStore } from '../../stores/useEditorStore';

const ipc = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  saveTextFile: vi.fn(),
  onWindowCloseRequested: vi.fn(),
  closeWindow: vi.fn(async () => {}),
}));
vi.mock('../../lib/tauriIpc', () => ({ tauriIpc: ipc }));
vi.mock('./CodeEditor', () => ({
  CodeEditor: ({ document: doc, active }: { document: { id: string; content: string }; active: boolean }) =>
    active ? (
      <textarea
        aria-label="Code"
        value={doc.content}
        onChange={(e) => useEditorStore.getState().updateContent(doc.id, e.target.value)}
      />
    ) : null,
}));
beforeEach(async () => {
  useEditorStore.setState(useEditorStore.getInitialState());
  ipc.readTextFile
    .mockReset()
    .mockResolvedValue({ content: 'original', revision: 'v1', line_ending: 'LF', has_bom: false });
  ipc.saveTextFile
    .mockReset()
    .mockResolvedValue({ content: 'changed', revision: 'v2', line_ending: 'LF', has_bom: false });
  ipc.onWindowCloseRequested.mockReset().mockResolvedValue(() => {});
  ipc.closeWindow.mockClear();
  await useEditorStore.getState().openFile('C:/repo', 'a.ts');
});

it('saves with Ctrl+S and suspends saving while a dialog is open', async () => {
  render(<EditorWorkspace />);
  fireEvent.change(await screen.findByLabelText('Code'), { target: { value: 'changed' } });
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved'));
  expect(ipc.saveTextFile).toHaveBeenCalledWith('C:/repo', 'a.ts', 'changed', 'v1');
  fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'new changes' } });
  fireEvent.click(screen.getByLabelText('Close a.ts'));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  expect(ipc.saveTextFile).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(useEditorStore.getState().documents[0].content).toBe('new changes');
});

it('guards Ctrl+W and discards only after confirmation', async () => {
  render(<EditorWorkspace />);
  fireEvent.change(await screen.findByLabelText('Code'), { target: { value: 'dirty' } });
  fireEvent.keyDown(window, { key: 'w', ctrlKey: true });
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(useEditorStore.getState().documents).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: "Don't Save" }));
  await waitFor(() => expect(useEditorStore.getState().documents).toHaveLength(0));
});

it('prevents native window close until files are saved, including failed-save retry', async () => {
  render(<EditorWorkspace />);
  fireEvent.change(await screen.findByLabelText('Code'), { target: { value: 'dirty' } });
  const preventDefault = vi.fn();
  act(() => ipc.onWindowCloseRequested.mock.calls[0][0]({ preventDefault }));
  expect(preventDefault).toHaveBeenCalled();
  ipc.saveTextFile.mockRejectedValueOnce(new Error('Disk conflict'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Disk conflict'))).toBe(true)
  );
  expect(ipc.closeWindow).not.toHaveBeenCalled();
  expect(useEditorStore.getState().documents[0].content).toBe('dirty');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(ipc.closeWindow).toHaveBeenCalledTimes(1));
});
