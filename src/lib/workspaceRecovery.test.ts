import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureEditorDocuments, fileKey, useEditorStore } from '../stores/useEditorStore';
import { useTerminalStore } from '../stores/useTerminalStore';
import { useNoticeStore } from '../stores/useNoticeStore';
import { deferred, session } from '../test/helpers';
import {
  captureWorkspace,
  flushWorkspaceRecovery,
  initializeWorkspaceRecovery,
  restoreWorkspace,
} from './workspaceRecovery';
import { parseWorkspace, type WorkspaceSnapshot } from './workspaceStorage';
import type { TextFile } from '../types';

const ipc = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  saveTextFile: vi.fn(),
  spawnTerminal: vi.fn(),
  getShellProfiles: vi.fn(),
  reportError: vi.fn(async () => {}),
}));
const storage = vi.hoisted(() => ({ readWorkspace: vi.fn(), writeWorkspace: vi.fn() }));
vi.mock('./tauriIpc', () => ({ tauriIpc: ipc }));
vi.mock('./workspaceStorage', async (original) => ({ ...(await original<object>()), ...storage }));
const disk: TextFile = { content: 'disk', revision: 'v1', line_ending: 'CRLF', has_bom: true };
const profile = { id: 'cmd', name: 'CMD', executable: 'cmd.exe', args: [], is_agent: false, agent_type: null };

function snapshot(): WorkspaceSnapshot {
  return {
    version: 1,
    terminals: [],
    documents: [],
    activeSessionId: null,
    primarySessionId: null,
    secondarySessionId: null,
    splitMode: 'none',
    activeDocumentId: null,
    workspaceView: 'terminal',
    explorerRoot: 'C:/repo',
    sidebarMode: 'files',
  };
}

beforeEach(() => {
  useEditorStore.setState(useEditorStore.getInitialState());
  useTerminalStore.setState(useTerminalStore.getInitialState());
  useNoticeStore.setState({ notices: [] });
  ipc.readTextFile.mockReset().mockResolvedValue(disk);
  ipc.saveTextFile.mockReset().mockRejectedValue(new Error('disk changed'));
  ipc.getShellProfiles.mockReset().mockResolvedValue([profile]);
  ipc.spawnTerminal.mockReset().mockImplementation(async (params) => ({
    ...session(params.id),
    title: params.title,
    shell: params.shell,
    cwd: params.cwd,
    is_agent: params.isAgent,
    agent_type: params.agentType ?? null,
  }));
  storage.readWorkspace.mockReset().mockResolvedValue(null);
  storage.writeWorkspace.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it('backs up live editor text and its saved baseline without persisting transient state', async () => {
  await useEditorStore.getState().openFile('C:/repo', 'a.ts');
  const id = fileKey('C:/repo', 'a.ts');
  const unregister = useEditorStore.getState().registerEditor(id, {
    readSnapshot: () => ({ content: 'draft', commitSave: () => false }),
    readRecoverySnapshot: () => ({ content: 'draft', savedContent: 'disk' }),
  });
  useEditorStore.getState().setDirty(id, true);
  const recovered = parseWorkspace(captureWorkspace())!;
  expect(recovered.documents[0]).toMatchObject({
    content: 'draft',
    savedContent: 'disk',
    dirty: true,
    revision: 'v1',
    saving: false,
  });
  unregister();
  expect(useEditorStore.getState().documents[0].content).toBe('draft');
});

it('reopens clean files from current disk and preserves conflicting or missing drafts', async () => {
  const saved = snapshot();
  for (const path of ['clean.ts', 'dirty.ts', 'missing.ts']) {
    await useEditorStore.getState().openFile('C:/repo', path);
    if (path !== 'clean.ts') useEditorStore.getState().updateContent(fileKey('C:/repo', path), 'my draft');
  }
  saved.documents = captureEditorDocuments();
  saved.workspaceView = 'editor';
  saved.activeDocumentId = fileKey('C:/repo', 'dirty.ts');
  useEditorStore.setState(useEditorStore.getInitialState());
  ipc.readTextFile.mockImplementation(async (_root, path) => {
    if (path === 'missing.ts') throw new Error('missing');
    return { ...disk, content: 'new disk text', revision: 'v2' };
  });
  await restoreWorkspace(parseWorkspace(saved)!);
  const state = useEditorStore.getState();
  expect(state.documents[0]).toMatchObject({
    content: 'new disk text',
    savedContent: 'new disk text',
    dirty: false,
    revision: 'v2',
  });
  expect(state.documents[1]).toMatchObject({
    content: 'my draft',
    savedContent: 'disk',
    dirty: true,
    revision: 'v1',
    error: expect.stringContaining('disk version'),
  });
  expect(state.documents[2]).toMatchObject({
    content: 'my draft',
    dirty: true,
    error: expect.stringContaining('unavailable'),
  });
  expect(state.activeDocumentId).toBe(saved.activeDocumentId);
  expect(state.sidebarMode).toBe('files');
  expect(await state.saveFile(saved.activeDocumentId!)).toBe(false);
  expect(ipc.saveTextFile).toHaveBeenCalledWith('C:/repo', 'dirty.ts', 'my draft', 'v1');
});

it('restores ordered shell contexts and split focus without replaying agents or commands', async () => {
  const saved = snapshot();
  saved.terminals = ['one', 'two'].map((id) => ({
    id,
    title: id,
    shell: 'cmd.exe',
    cwd: `C:/${id}`,
    wasAgent: id === 'two',
  }));
  saved.activeSessionId = 'two';
  saved.primarySessionId = 'one';
  saved.secondarySessionId = 'two';
  saved.splitMode = 'vertical';
  await restoreWorkspace(saved);
  const state = useTerminalStore.getState();
  expect(state.sessions.map((item) => item.cwd)).toEqual(['C:/one', 'C:/two']);
  expect(state.sessions[1]).toMatchObject({ title: 'two (restored shell)', is_agent: false, agent_type: null });
  expect(state.primarySessionId).toBe(state.sessions[0].id);
  expect(state.secondarySessionId).toBe(state.sessions[1].id);
  expect(state.activeSessionId).toBe(state.secondarySessionId);
  expect(state.splitMode).toBe('vertical');
  expect(ipc.spawnTerminal.mock.calls.every(([params]) => params.args.length === 0 && !params.isAgent)).toBe(true);
});

it('keeps user selection when a slow recovery read completes after a new file is opened', async () => {
  await useEditorStore.getState().openFile('C:/repo', 'old.ts');
  const saved = captureWorkspace();
  useEditorStore.setState(useEditorStore.getInitialState());
  const slow = deferred<TextFile>();
  ipc.readTextFile.mockReturnValueOnce(slow.promise);
  const restoring = restoreWorkspace(saved);
  await useEditorStore.getState().openFile('C:/repo', 'new.ts');
  slow.resolve(disk);
  await restoring;
  expect(useEditorStore.getState().activeDocumentId).toBe(fileKey('C:/repo', 'new.ts'));
  expect(useEditorStore.getState().documents).toHaveLength(2);
});

it('rejects corrupt, unsupported and oversized snapshots', () => {
  expect(parseWorkspace({ ...snapshot(), version: 2 })).toBeNull();
  expect(parseWorkspace({ ...snapshot(), documents: Array(21).fill({}) })).toBeNull();
  expect(parseWorkspace({ ...snapshot(), terminals: [{ id: 'x', shell: 'cmd.exe' }] })).toBeNull();
  expect(parseWorkspace({ ...snapshot(), splitMode: 'diagonal' })).toBeNull();
  expect(parseWorkspace(snapshot())).toEqual(snapshot());
});

it('coalesces slow writes, flushes the latest state and excludes explicitly discarded drafts', async () => {
  vi.useFakeTimers();
  await initializeWorkspaceRecovery();
  const slow = deferred<void>();
  storage.writeWorkspace.mockReturnValueOnce(slow.promise);
  await useEditorStore.getState().openFile('C:/repo', 'discard.ts');
  useEditorStore.getState().updateContent(fileKey('C:/repo', 'discard.ts'), 'draft');
  const first = flushWorkspaceRecovery();
  await Promise.resolve();
  useEditorStore.getState().setExplorerRoot('C:/latest');
  void flushWorkspaceRecovery();
  useEditorStore.getState().closeFile(fileKey('C:/repo', 'discard.ts'), true);
  const last = flushWorkspaceRecovery();
  slow.resolve();
  await Promise.all([first, last]);
  expect(storage.writeWorkspace).toHaveBeenCalledTimes(2);
  expect(storage.writeWorkspace.mock.calls.at(-1)![0]).toMatchObject({ documents: [], explorerRoot: 'C:/latest' });
});
