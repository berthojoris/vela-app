import { expect, it } from 'vitest';
import { describeDisplayPath, normalizeDisplayPath, pathCharBudget, trimTrailingSeparators } from './formatPath';

it('normalizes Windows separators and duplicate slashes', () => {
  expect(normalizeDisplayPath('C:\\DEKSTOP\\\\RUST\\terminal_manager')).toBe('C:/DEKSTOP/RUST/terminal_manager');
  expect(normalizeDisplayPath('//fileserver/share//project')).toBe('//fileserver/share/project');
  expect(normalizeDisplayPath('  C:/repo  ')).toBe('C:/repo');
  expect(normalizeDisplayPath(null)).toBe('');
  expect(normalizeDisplayPath(undefined)).toBe('');
});

it('keeps drive roots and UNC roots when trimming separators', () => {
  expect(trimTrailingSeparators('C:/repo/')).toBe('C:/repo');
  expect(trimTrailingSeparators('C:/')).toBe('C:/');
  expect(trimTrailingSeparators('/')).toBe('/');
  expect(trimTrailingSeparators('//fileserver/share/')).toBe('//fileserver/share');
});

it('renders a short Windows path in full with Windows separators', () => {
  expect(describeDisplayPath('C:\\DEKSTOP\\RUST\\terminal_manager')).toEqual({
    full: 'C:/DEKSTOP/RUST/terminal_manager',
    display: 'C:\\DEKSTOP\\RUST\\terminal_manager',
    expanded: 'C:\\DEKSTOP\\RUST\\terminal_manager',
    dir: 'C:\\DEKSTOP\\RUST\\',
    name: 'terminal_manager',
    compacted: false,
  });
});

it('compacts long paths with "..." while keeping the root and folder name', () => {
  const deep = 'C:\\DEKSTOP\\LARAVELPACKAGE\\nightwatch\\vendor\\packages\\folder-project';
  const parts = describeDisplayPath(deep, 46);

  expect(parts.compacted).toBe(true);
  expect(parts.display).toContain('...');
  expect(parts.display.startsWith('C:\\DEKSTOP\\')).toBe(true);
  expect(parts.name).toBe('folder-project');
  expect(parts.display.length).toBeLessThanOrEqual(46);
  // The tooltip never loses information.
  expect(parts.expanded).toBe(deep);
  expect(parts.display).not.toContain('vendor\\packages');
});

it('matches the requested compact shape for a deep Laravel path', () => {
  const parts = describeDisplayPath(
    'C:\\DEKSTOP\\LARAVELPACKAGE\\nightwatch\\vendor\\laravel\\framework\\folder-projectnya',
    60
  );
  expect(parts.display).toBe('C:\\DEKSTOP\\LARAVELPACKAGE\\...\\framework\\folder-projectnya');
});

it('drops the parent folder before dropping all leading context', () => {
  const deep = 'C:\\very-long-workspace-folder\\another-long-parent-folder\\parent\\child';
  const parts = describeDisplayPath(deep, 30);
  expect(parts.compacted).toBe(true);
  expect(parts.name).toBe('child');
  expect(parts.display).toContain('...');
});

it('keeps POSIX-style paths (WSL cwd) on forward slashes', () => {
  const parts = describeDisplayPath('/home/ajoris/projects/vela/apps/desktop', 28);
  expect(parts.display.startsWith('/home/')).toBe(true);
  expect(parts.display).toContain('/.../');
  expect(parts.name).toBe('desktop');
  expect(parts.display).not.toContain('\\');
});

it('handles bare, root, and empty inputs without losing the folder name', () => {
  expect(describeDisplayPath('terminal_manager')).toMatchObject({
    display: 'terminal_manager',
    dir: '',
    name: 'terminal_manager',
  });
  expect(describeDisplayPath('C:/')).toMatchObject({ display: 'C:\\', dir: '', name: 'C:\\' });
  expect(describeDisplayPath('')).toMatchObject({ display: '', name: '', compacted: false });
});

it('reserves more characters on wider windows', () => {
  expect(pathCharBudget(800)).toBeLessThan(pathCharBudget(1600));
  expect(pathCharBudget(1600)).toBe(84);
  expect(pathCharBudget(200)).toBe(25);
});
