/**
 * Path presentation helpers for the title bar.
 *
 * Paths cross the IPC boundary with forward slashes, but shell/users can still
 * hand us backslashes (OSC 7 cwd, pasted paths), so every helper normalizes
 * first. Display never mutates the stored path — callers keep the original.
 */

const ELLIPSIS = '...';

/** Normalized, trimmed path with forward slashes ('' stays ''). */
export function normalizeDisplayPath(path: string | null | undefined): string {
  if (!path) return '';
  const trimmed = path.trim().replace(/\\/g, '/');
  // Collapse duplicate separators, but keep a leading UNC "//server" intact.
  const unc = trimmed.startsWith('//');
  const collapsed = trimmed.replace(/\/{2,}/g, '/');
  return unc ? `/${collapsed}` : collapsed;
}

/** Drops a trailing separator so "C:/repo/" and "C:/repo" present identically. */
export function trimTrailingSeparators(path: string): string {
  const normalized = normalizeDisplayPath(path);
  if (normalized === '/' || /^[A-Za-z]:\/$/.test(normalized)) return normalized;
  return normalized.replace(/\/+$/, '');
}

/** Windows drive paths and UNC shares read better with backslashes. */
function usesBackslashes(full: string): boolean {
  return /^[A-Za-z]:\//.test(full) || full.startsWith('//');
}

const segments = (value: string) => value.split('/').filter(Boolean);

/** Splits "C:/a/b" into root "C:/" + parts ["a", "b"], and UNC/POSIX alike. */
function splitPathParts(full: string): { root: string; parts: string[] } {
  if (/^[A-Za-z]:\//.test(full)) return { root: full.slice(0, 3), parts: segments(full.slice(3)) };
  if (full.startsWith('//')) {
    const unc = segments(full.slice(2));
    if (unc.length <= 1) return { root: full, parts: [] };
    return { root: `//${unc[0]}/${unc[1]}/`, parts: unc.slice(2) };
  }
  if (full.startsWith('/')) return { root: '/', parts: segments(full.slice(1)) };
  return { root: '', parts: segments(full) };
}

export interface DisplayPathParts {
  /** Normalized path with forward slashes (the IPC form). */
  full: string;
  /** What the UI renders — may contain a "..." gap in the middle. */
  display: string;
  /** The same path without compaction, for tooltips/titles. */
  expanded: string;
  /** Directory prefix of `display`, including its trailing separator. */
  dir: string;
  /** Final folder name of `display`, always kept intact. */
  name: string;
  /** True when "..." replaced middle segments to fit `maxChars`. */
  compacted: boolean;
}

/**
 * Describes a path for the title bar. When the rendered path would exceed
 * `maxChars`, the middle segments collapse into "...", keeping the root, as
 * many leading folders as fit, and the final folder name:
 *
 *   C:\DEKSTOP\LARAVELPACKAGE\nightwatch\vendor\pkg\folder-project
 *   C:\DEKSTOP\LARAVELPACKAGE\...\folder-project
 */
export function describeDisplayPath(path: string | null | undefined, maxChars = 60): DisplayPathParts {
  const full = trimTrailingSeparators(path || '');
  if (!full) return { full: '', display: '', expanded: '', dir: '', name: '', compacted: false };

  const sep = usesBackslashes(full) ? '\\' : '/';
  const { root, parts } = splitPathParts(full);
  const rootDisplay = root.split('/').join(sep);
  const expanded = rootDisplay + parts.join(sep);
  const budget = Math.max(12, Math.floor(maxChars));

  const compacted = expanded.length > budget && parts.length > 1;
  const display = compacted ? compactPath(rootDisplay, parts, sep, budget) : expanded;

  const lastSeparator = display.lastIndexOf(sep);
  let dir = lastSeparator < 0 ? '' : display.slice(0, lastSeparator + 1);
  let name = lastSeparator < 0 ? display : display.slice(lastSeparator + 1);
  if (!name) {
    dir = '';
    name = display;
  }

  return { full, display, expanded, dir, name, compacted };
}

function compactPath(root: string, parts: string[], sep: string, budget: number): string {
  const join = (head: string[], tail: string[]) =>
    `${root}${head.length ? `${head.join(sep)}${sep}` : ''}${ELLIPSIS}${sep}${tail.join(sep)}`;

  // Prefer showing the parent folder too, but never at the cost of all leading
  // context: fall back to the final folder only when nothing else fits.
  for (const tailSize of [2, 1]) {
    const maxHead = parts.length - tailSize;
    if (maxHead < 1) continue;
    const tail = parts.slice(-tailSize);
    let best: string | null = null;
    for (let headSize = 1; headSize <= maxHead; headSize++) {
      const candidate = join(parts.slice(0, headSize), tail);
      if (candidate.length > budget) break;
      best = candidate;
    }
    if (best) return best;
  }

  return join([], parts.slice(-1));
}

/**
 * Rough character budget for the title bar path label. Monospace 11px glyphs
 * advance about 6.6px, and the label is capped at min(52vw, 560px).
 */
export function pathCharBudget(viewportWidth: number): number {
  const width = Math.min(Math.max(viewportWidth, 320) * 0.52, 560);
  return Math.max(20, Math.floor(width / 6.6));
}
