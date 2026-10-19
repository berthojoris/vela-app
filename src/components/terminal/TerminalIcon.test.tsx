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
    expect(detectTerminalType({ isAgent: true, title: 'Codex' })).toBe('codex');
    expect(detectTerminalType({ isAgent: false, shell: 'codex' })).toBe('codex');
  });

  it('ignores the branch or folder that formatTabTitle appends', () => {
    for (const folder of ['android-app', 'strategy', 'opencode-fork', 'claude-notes', 'my-codex']) {
      expect(detectTerminalType({ shell: 'powershell.exe', title: `PowerShell (${folder})`, isAgent: false, agentType: null })).toBe('powershell');
    }
    expect(detectTerminalType({ shell: 'cmd.exe', title: 'Command Prompt (android)' })).toBe('cmd');
    expect(detectTerminalType({ shell: 'powershell.exe', title: 'OpenCode (android)', isAgent: true, agentType: 'open_code' })).toBe('opencode');
    expect(detectTerminalType({ shell: 'powershell.exe', title: 'Droid CLI (strategy)', isAgent: true, agentType: 'droid_cli' })).toBe('droid');
  });

  it('trusts the executable over a renamed tab title', () => {
    expect(detectTerminalType({ shell: 'C:/Program Files/PowerShell/7/pwsh.exe', title: 'OpenCode' })).toBe('powershell');
    expect(detectTerminalType({ shell: 'C:\\Users\\me\\bin\\droid.exe', title: 'PowerShell' })).toBe('droid');
    expect(detectTerminalType({ isAgent: true, agentType: { custom: 'agy' } })).toBe('antigravity');
  });
});
