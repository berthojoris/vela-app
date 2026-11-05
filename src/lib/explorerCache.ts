import type { DirectoryListing } from '../types';

interface FolderState {
  listing?: DirectoryListing;
  loading: boolean;
  error?: string;
}

const MAX_CACHED_FOLDERS = 64;
const MAX_CACHED_ENTRIES = 20000;
interface ExplorerState {
  folders: Record<string, FolderState>;
  expanded: Set<string>;
}
type ExplorerAction =
  | { type: 'toggle'; path: string }
  | { type: 'loading'; path: string }
  | { type: 'loaded'; path: string; listing: DirectoryListing }
  | { type: 'error'; path: string; error: string };

function descendant(path: string, parent: string): boolean {
  return parent === '' || path.startsWith(`${parent}/`);
}

export function explorerReducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  const expanded = new Set(state.expanded);
  const folders = { ...state.folders };
  const close = (path: string) => {
    expanded.delete(path);
    for (const key of expanded) if (descendant(key, path)) expanded.delete(key);
  };
  if (action.type === 'toggle') {
    if (expanded.has(action.path)) close(action.path);
    else expanded.add(action.path);
  } else {
    // Reinsert to keep cache access order without a second unbounded index.
    delete folders[action.path];
    folders[action.path] =
      action.type === 'loaded'
        ? { loading: false, listing: action.listing }
        : action.type === 'error'
          ? { loading: false, error: action.error }
          : { ...state.folders[action.path], loading: true };
  }
  const protectedPath = action.path;
  const protectedKey = (key: string) => key === '' || key === protectedPath || descendant(protectedPath, key);
  const count = () => Object.values(folders).reduce((sum, folder) => sum + (folder.listing?.entries.length ?? 0), 0);
  const candidates = [...new Set([...Object.keys(folders), ...expanded])].filter((key) => !protectedKey(key));
  candidates.sort((a, b) => Number(expanded.has(a)) - Number(expanded.has(b)));
  for (const key of candidates) {
    if (
      Object.keys(folders).length <= MAX_CACHED_FOLDERS &&
      expanded.size <= MAX_CACHED_FOLDERS &&
      count() <= MAX_CACHED_ENTRIES
    )
      break;
    close(key);
    delete folders[key];
    for (const child of Object.keys(folders)) if (descendant(child, key)) delete folders[child];
  }
  if (
    Object.keys(folders).length > MAX_CACHED_FOLDERS ||
    expanded.size > MAX_CACHED_FOLDERS ||
    count() > MAX_CACHED_ENTRIES
  ) {
    close(action.path);
    folders[action.path] = { loading: false, error: 'Explorer cache limit reached. Close some folders and retry.' };
    if (Object.keys(folders).length > MAX_CACHED_FOLDERS) delete folders[action.path];
  }
  return { folders, expanded };
}
