import { describe, expect, it } from 'vitest';
import { detectTerminalType } from './TerminalIcon';

describe('detectTerminalType', () => {
  it('detects opencode from agentType, title, or shell', () => {
    expect(detectTerminalType({ isAgent: true, agentType: 'open_code', shell: 'powershell.exe', title: 'OpenCode' })).toBe('opencode');
    expect(detectTerminalType({ isAgent: true, title: 'OpenCode (main)' })).toBe('opencode');
    expect(detectTerminalType({ isAgent: false, title: 'OpenCode' })).toBe('opencode');
    expect(detectTerminalType({ isAgent: false, shell: 'opencode' })).toBe('opencode');
  });

  it('detects droid from agentType, title, or shell', () => {
    expect(detectTerminalType({ isAgent: true, agentType: 'droid_cli', shell: 'powershell.exe', title: 'Droid CLI' })).toBe('droid');
    expect(detectTerminalType({ isAgent: true, title: 'Droid CLI (feat)' })).toBe('droid');
    expect(detectTerminalType({ isAgent: false, shell: 'droid' })).toBe('droid');
  });

  it('detects antigravity from agentType, title, or shell', () => {
    expect(detectTerminalType({ isAgent: true, agentType: 'antigravity', shell: 'powershell.exe', title: 'Antigravity' })).toBe('antigravity');
    expect(detectTerminalType({ isAgent: true, title: 'Antigravity (feat)' })).toBe('antigravity');
    expect(detectTerminalType({ isAgent: false, title: 'agy' })).toBe('antigravity');
    expect(detectTerminalType({ isAgent: false, shell: 'agy' })).toBe('antigravity');
  });

  it('detects standard shells and other agents correctly', () => {
    expect(detectTerminalType({ shell: 'powershell.exe' })).toBe('powershell');
    expect(detectTerminalType({ shell: 'C:/Program Files/Git/bin/bash.exe' })).toBe('git-bash');
    expect(detectTerminalType({ shell: 'cmd.exe' })).toBe('cmd');
    expect(detectTerminalType({ shell: 'wsl.exe' })).toBe('wsl');
    expect(detectTerminalType({ isAgent: true, agentType: 'claude_code' })).toBe('claude');
  });
});
