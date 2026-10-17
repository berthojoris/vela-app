import { expect, it } from 'vitest';
import { cwdFromOsc7 } from './shellIntegration';
import { errorMessage } from './errors';

it('decodes PowerShell, CMD, and MSYS prompt directory reports', () => {
  expect(cwdFromOsc7('file:///C:/Project%20Files/%E6%97%A5%E6%9C%AC/')).toBe('C:/Project Files/日本');
  expect(cwdFromOsc7('file:///C:\\Work\\new folder')).toBe('C:/Work/new folder');
  expect(cwdFromOsc7('file://DESKTOP/c/Projects/app')).toBe('C:/Projects/app');
  expect(cwdFromOsc7('file:///C:/100% done')).toBe('C:/100% done');
  expect(cwdFromOsc7('file://fileserver/share/project/')).toBe('//fileserver/share/project');
});
it('ignores remote protocols, control characters, and unmapped Linux paths', () => {
  for (const data of ['javascript:alert(1)', 'https://site/C:/repo', 'file:///home/user', 'file:///C:/repo%00bad', 'file:///C:/repo\n']) expect(cwdFromOsc7(data)).toBeNull();
});
it('handles every IPC error representation without throwing', () => {
  for (const error of [null, undefined, {}, 7, new Error(''), ' ']) expect(errorMessage(error, 'fallback')).toBe('fallback');
  expect(errorMessage({ message: 'Access denied' })).toBe('Access denied');
  expect(errorMessage('x'.repeat(10000))).toHaveLength(4000);
});
