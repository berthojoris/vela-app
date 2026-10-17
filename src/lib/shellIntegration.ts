/** OSC 7 is metadata, never executable input. Ignore URLs that cannot map to a Windows path. */
export function cwdFromOsc7(data: string): string | null {
  if (!data.startsWith('file://') || data.length > 32768 || /[\x00-\x1f\x7f]/.test(data)) return null;
  try {
    // Do not let URL() normalise dots or reinterpret '#' in a raw CMD prompt path.
    const match = data.match(/^file:\/\/([^/]*)(\/.*)$/);
    if (!match) return null;
    let path = match[2];
    try { path = decodeURIComponent(path); } catch { /* CMD may emit literal '%' in a folder name. */ }
    path = path.replace(/\\/g, '/');
    if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
    else if (/^\/[a-z]\//i.test(path)) path = `${path[1].toUpperCase()}:${path.slice(2)}`;
    else if (match[1] && match[1].toLowerCase() !== 'localhost') path = `//${match[1]}${path}`;
    // Linux/remote paths are not Windows Git directories. WSL/custom shells can keep initial context.
    if (!/^[a-z]:\//i.test(path) && !/^\/\/[^/]+\/[^/]+/.test(path)) return null;
    if (/[\x00-\x1f\x7f]/.test(path)) return null;
    return path.length > 3 ? path.replace(/\/+$/, '') : path;
  } catch { return null; }
}
