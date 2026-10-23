import { beforeEach, expect, it, vi } from 'vitest';
import { fileKey, isDirty, useEditorStore } from './useEditorStore';
import { useWorktreeStore } from './useWorktreeStore';
import { useNoticeStore } from './useNoticeStore';
import type { TextFile } from '../types';

const ipc = vi.hoisted(() => ({ readTextFile: vi.fn(), saveTextFile: vi.fn(), reportError: vi.fn(async () => {}) }));
vi.mock('../lib/tauriIpc', () => ({ tauriIpc: ipc }));
const file: TextFile = { content: 'original\n', revision: 'v1', line_ending: 'LF', has_bom: false };
beforeEach(() => {
  vi.restoreAllMocks();
  ipc.readTextFile.mockReset().mockResolvedValue(file);
  ipc.saveTextFile.mockReset().mockResolvedValue({ ...file, revision: 'v2' });
  useEditorStore.setState(useEditorStore.getInitialState());
  useWorktreeStore.setState(useWorktreeStore.getInitialState());
  useNoticeStore.setState({ notices: [] });
});

it('deduplicates file opens and keeps documents when changing workspace', async () => {
  await useEditorStore.getState().openFile('C:/Repo', 'src/main.ts');
  await useEditorStore.getState().openFile('c:\\repo', 'src/main.ts');
  expect(ipc.readTextFile).toHaveBeenCalledTimes(1);
  expect(useEditorStore.getState().documents).toHaveLength(1);
  expect(useEditorStore.getState().workspaceView).toBe('editor');
  useEditorStore.getState().setWorkspaceView('terminal');
  expect(useEditorStore.getState().documents).toHaveLength(1);
});

it('does not let a late file read steal a newer selection or explicit workspace switch', async () => {
  let finish!: (value: TextFile) => void;
  ipc.readTextFile.mockImplementationOnce(
    () =>
      new Promise<TextFile>((resolve) => {
        finish = resolve;
      })
  );
  const slow = useEditorStore.getState().openFile('C:/Repo', 'slow.ts');
  await useEditorStore.getState().openFile('C:/Repo', 'fast.ts');
  finish(file);
  await slow;
  expect(useEditorStore.getState().activeDocumentId).toBe(fileKey('C:/Repo', 'fast.ts'));
  ipc.readTextFile.mockImplementationOnce(
    () =>
      new Promise<TextFile>((resolve) => {
        finish = resolve;
      })
  );
  const pending = useEditorStore.getState().openFile('C:/Repo', 'later.ts');
  useEditorStore.getState().setWorkspaceView('terminal');
  finish(file);
  await pending;
  expect(useEditorStore.getState().workspaceView).toBe('terminal');
});

it('saves one snapshot once and keeps edits typed while saving dirty', async () => {
  await useEditorStore.getState().openFile('C:/Repo', 'a.ts');
  const id = useEditorStore.getState().activeDocumentId!;
  useEditorStore.getState().updateContent(id, 'first edit');
  let finish!: (value: TextFile) => void;
  ipc.saveTextFile.mockImplementationOnce(
    () =>
      new Promise<TextFile>((resolve) => {
        finish = resolve;
      })
  );
  const pending = useEditorStore.getState().saveFile(id);
  expect(useEditorStore.getState().saveFile(id)).toBe(pending);
  expect(useEditorStore.getState().closeFile(id, true)).toBe(false);
  useEditorStore.getState().updateContent(id, 'newer edit');
  finish({ ...file, content: 'first edit', revision: 'v2' });
  expect(await pending).toBe(true);
  const doc = useEditorStore.getState().documents[0];
  expect(ipc.saveTextFile).toHaveBeenCalledWith('C:/Repo', 'a.ts', 'first edit', 'v1');
  expect(doc.content).toBe('newer edit');
  expect(doc.savedContent).toBe('first edit');
  expect(doc.revision).toBe('v2');
  expect(isDirty(doc)).toBe(true);
  expect(useEditorStore.getState().closeFile(id)).toBe(false);
  expect(useEditorStore.getState().closeFile(id, true)).toBe(true);
});

it('keeps edits and revision after a failed save, then allows retry', async () => {
  await useEditorStore.getState().openFile('C:/Repo', 'a.ts');
  const id = useEditorStore.getState().activeDocumentId!;
  useEditorStore.getState().updateContent(id, 'local');
  ipc.saveTextFile.mockRejectedValueOnce(new Error('changed on disk'));
  expect(await useEditorStore.getState().saveFile(id)).toBe(false);
  expect(useEditorStore.getState().documents[0]).toMatchObject({
    content: 'local',
    savedContent: file.content,
    revision: 'v1',
    saving: false,
    error: 'changed on disk',
  });
  expect(await useEditorStore.getState().saveFile(id)).toBe(true);
  expect(isDirty(useEditorStore.getState().documents[0])).toBe(false);
  expect(useEditorStore.getState().closeFile(id)).toBe(true);
  expect(useEditorStore.getState().workspaceView).toBe('terminal');
});

it('keeps the same relative file in different roots separate', async () => {
  await useEditorStore.getState().openFile('C:/one', 'index.ts');
  await useEditorStore.getState().openFile('C:/two', 'index.ts');
  expect(useEditorStore.getState().documents).toHaveLength(2);
  expect(useEditorStore.getState().documents[0].root).toBe('C:/one');
  expect(useEditorStore.getState().documents[1].root).toBe('C:/two');
});
