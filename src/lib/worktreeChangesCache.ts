import { WorktreeChanges } from '../types';

const cache = new Map<string, WorktreeChanges>();
const key = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export function getCachedChanges(path: string): WorktreeChanges | undefined {
  return cache.get(key(path));
}

export function cacheChanges(path: string, changes: WorktreeChanges): void {
  if (cache.size > 32) cache.clear();
  cache.set(key(path), changes);
}

export function invalidateChanges(path: string): void {
  cache.delete(key(path));
}
