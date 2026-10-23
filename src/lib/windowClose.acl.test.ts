import { expect, it } from 'vitest';
import capability from '../../src-tauri/capabilities/default.json';

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// A JS onCloseRequested listener makes Tauri defer every close to window.destroy() from JS.
// Without core:window:allow-destroy that call is rejected ("plugin:window|destroy not allowed
// by ACL") and Vela can never close; with it, the backend Git-write close guard is bypassed.
// Window close is gated in Rust instead (CloseGuard in lib.rs).
it('keeps window close gating out of JS close-requested listeners', () => {
  const offenders = Object.entries(sources)
    .filter(([, source]) => /\.onCloseRequested\(/.test(source))
    .map(([path]) => path);
  expect(offenders).toEqual([]);
  expect(capability.permissions).not.toContain('core:window:allow-destroy');
});
