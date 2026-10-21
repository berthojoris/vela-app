import { ChangedFile } from '../types';

/** Porcelain may report separate index and untracked entries for the same path. */
export function changeKey(file: Pick<ChangedFile, 'status' | 'path'>): string {
  return JSON.stringify([file.status, file.path]);
}
