import { expect, it } from 'vitest';
import tauriConfig from '../../../src-tauri/tauri.conf.json';

// CodeMirror injects its base theme through a nonce-less <style> tag. If Tauri adds its
// style nonce to style-src, browsers ignore 'unsafe-inline' and the editor renders unstyled
// (only stacked line numbers, with the text pushed out of view).
it('keeps inline styles allowed for the CodeMirror editor', () => {
  const { security } = tauriConfig.app;
  expect(security.dangerousDisableAssetCspModification).toContain('style-src');
  expect(security.csp['style-src']).toContain("'unsafe-inline'");
  expect(security.devCsp['style-src']).toContain("'unsafe-inline'");
});
