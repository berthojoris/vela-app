import type { EditorDocument } from '../stores/useEditorStore';

export interface TerminalContext {
  id: string;
  title: string;
  shell: string;
  cwd: string;
  wasAgent: boolean;
}

export interface WorkspaceSnapshot {
  version: 1;
  terminals: TerminalContext[];
  activeSessionId: string | null;
  primarySessionId: string | null;
  secondarySessionId: string | null;
  splitMode: 'none' | 'vertical' | 'horizontal';
  documents: EditorDocument[];
  activeDocumentId: string | null;
  workspaceView: 'terminal' | 'editor';
  explorerRoot: string | null;
  sidebarMode: 'git' | 'files';
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 32768): value is string =>
  typeof value === 'string' && value.length <= max && !value.includes('\0');
const nullableText = (value: unknown) => value === null || text(value);

/** Recovery data is untrusted and bounded just like the live workspace. */
export function parseWorkspace(value: unknown): WorkspaceSnapshot | null {
  if (!record(value) || value.version !== 1) return null;
  if (!Array.isArray(value.terminals) || value.terminals.length > 32) return null;
  if (!Array.isArray(value.documents) || value.documents.length > 20) return null;
  if (
    !['none', 'vertical', 'horizontal'].includes(String(value.splitMode)) ||
    !['terminal', 'editor'].includes(String(value.workspaceView)) ||
    !['git', 'files'].includes(String(value.sidebarMode)) ||
    !['activeSessionId', 'primarySessionId', 'secondarySessionId', 'activeDocumentId', 'explorerRoot'].every((key) =>
      nullableText(value[key])
    )
  )
    return null;
  const terminals: TerminalContext[] = [];
  for (const item of value.terminals) {
    if (
      !record(item) ||
      !text(item.id, 128) ||
      !text(item.title, 1024) ||
      !text(item.shell) ||
      !text(item.cwd) ||
      typeof item.wasAgent !== 'boolean' ||
      terminals.some((other) => other.id === item.id)
    )
      return null;
    terminals.push({ id: item.id, title: item.title, shell: item.shell, cwd: item.cwd, wasAgent: item.wasAgent });
  }
  const documents: EditorDocument[] = [];
  for (const item of value.documents) {
    if (
      !record(item) ||
      !text(item.id) ||
      !text(item.root) ||
      !text(item.path) ||
      !text(item.revision, 128) ||
      !text(item.content, 2 * 1024 * 1024) ||
      !text(item.savedContent, 2 * 1024 * 1024) ||
      !['LF', 'CRLF'].includes(String(item.line_ending)) ||
      typeof item.has_bom !== 'boolean' ||
      documents.some((other) => other.id === item.id)
    )
      return null;
    documents.push({
      id: item.id,
      root: item.root,
      path: item.path,
      revision: item.revision,
      content: item.content,
      savedContent: item.savedContent,
      line_ending: String(item.line_ending),
      has_bom: item.has_bom,
      dirty: item.content !== item.savedContent,
      saving: false,
      error: null,
    });
  }
  return { ...value, version: 1, terminals, documents } as WorkspaceSnapshot;
}

/** IndexedDB keeps large drafts out of synchronous, quota-limited localStorage. */
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vela-workspace', 1);
    let settled = false;
    const fail = () => {
      settled = true;
      reject(
        (request.readyState === 'done' ? request.error : null) ??
          new Error('Workspace storage is unavailable. Close other Vela windows and retry.')
      );
    };
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      if (settled) request.result.close();
      else resolve(request.result);
    };
  });
}

export async function readWorkspace(): Promise<WorkspaceSnapshot | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readonly');
      const request = transaction.objectStore('workspace').get('current');
      transaction.oncomplete = () => resolve(parseWorkspace(request.result));
      transaction.onabort = () => reject(transaction.error ?? new Error('Cannot read workspace recovery data.'));
    });
  } finally {
    db.close();
  }
}

export async function writeWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readwrite');
      transaction.objectStore('workspace').put(snapshot, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Cannot save workspace recovery data.'));
    });
  } finally {
    db.close();
  }
}
