import { WorktreeChanges } from '../types';

const MAX_CACHED_WORKTREES = 16;
const cache = new Map<string, WorktreeChanges>();
const key = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export function getCachedChanges(path: string): WorktreeChanges | undefined {
  const k = key(path);
  const existing = cache.get(k);
  if (existing !== undefined) {
    // Refresh LRU order on hit.
    cache.delete(k);
    cache.set(k, existing);
  }
  return existing;
}

export function cacheChanges(path: string, changes: WorktreeChanges): void {
  const k = key(path);
  cache.delete(k);
  while (cache.size >= MAX_CACHED_WORKTREES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(k, changes);
}

export function invalidateChanges(path: string): void {
  cache.delete(key(path));
}
