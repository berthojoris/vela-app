import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, session } from '../test/helpers';

const ipc = vi.hoisted(() => ({ spawnTerminal: vi.fn(), killTerminal: vi.fn(), getShellProfiles: vi.fn() }));
vi.mock('../lib/tauriIpc', () => ({ tauriIpc: ipc }));
import { useTerminalStore as store } from './useTerminalStore';

beforeEach(() => {
  store.setState(store.getInitialState());
  ipc.spawnTerminal.mockReset();
  ipc.killTerminal.mockReset();
  store.setState({
    sessions: [session('one'), session('two'), session('three')],
    activeSessionId: 'one',
    primarySessionId: 'one',
  });
});

describe('stable terminal panes', () => {
  it('does not reorder panes when selecting the current split mode again', () => {
    store.getState().setSplitMode('vertical');
    store.getState().setActiveSession('two');
    store.getState().setSplitMode('vertical');
    expect(store.getState().primarySessionId).toBe('one');
    expect(store.getState().secondarySessionId).toBe('two');
  });
  it('focuses the second pane without swapping or hiding either pane', () => {
    store.getState().setSplitMode('vertical');
    store.getState().setActiveSession('two');
    expect(store.getState().activeSessionId).toBe('two');
    expect(store.getState().primarySessionId).toBe('one');
    expect(store.getState().secondarySessionId).toBe('two');
    expect(store.getState().splitMode).toBe('vertical');
  });
  it('repairs the pane invariant when closing the primary tab', async () => {
    ipc.killTerminal.mockResolvedValue(undefined);
    store.getState().setSplitMode('horizontal');
    await store.getState().closeSession('one');
    const state = store.getState();
    expect(state.primarySessionId).not.toBe(state.secondarySessionId);
    expect(state.sessions.some((item) => item.id === state.activeSessionId)).toBe(true);
  });
  it('retains the tab when backend termination fails', async () => {
    ipc.killTerminal.mockRejectedValue('Access denied');
    await expect(store.getState().closeSession('one')).rejects.toBe('Access denied');
    expect(store.getState().sessions).toHaveLength(3);
  });
  it('does not send input or kill an already exited process when closing its tab', async () => {
    store.getState().markSessionExited('one');
    await store.getState().closeSession('one');
    expect(ipc.killTerminal).not.toHaveBeenCalled();
  });
  it('ignores nonexistent selections and clears explicit worktree association after cd', () => {
    store.getState().setActiveSession('missing');
    expect(store.getState().activeSessionId).toBe('one');
    store.setState({ sessions: [{ ...session('one'), worktree_id: 'old' }] });
    store.getState().updateSessionCwd('one', 'C:/new');
    expect(store.getState().sessions[0].worktree_id).toBeNull();
  });
});

describe('safe launch defaults', () => {
  it('never inherits PowerShell arguments for an unrelated custom binary', async () => {
    store.setState({
      profiles: [
        {
          id: 'pwsh',
          name: 'PowerShell',
          executable: 'pwsh.exe',
          args: ['-NoLogo'],
          is_agent: false,
          agent_type: null,
        },
      ],
    });
    ipc.spawnTerminal.mockImplementation(async (params) => ({ ...session(params.id), shell: params.shell }));
    await store.getState().createSession({ shell: 'claude', isAgent: true });
    expect(ipc.spawnTerminal.mock.calls[0][0].args).toEqual([]);
  });
  it('keeps a PowerShell tab from inheriting an agent profile that shares its executable', async () => {
    store.setState({
      profiles: [
        {
          id: 'agent-opencode',
          name: 'OpenCode',
          executable: 'powershell.exe',
          args: ['-NoLogo', '-NoExit', '-Command', 'opencode'],
          is_agent: true,
          agent_type: 'open_code',
        },
        {
          id: 'powershell',
          name: 'Windows PowerShell',
          executable: 'powershell.exe',
          args: ['-NoLogo'],
          is_agent: false,
          agent_type: null,
        },
      ],
    });
    ipc.spawnTerminal.mockImplementation(async (params) => ({ ...session(params.id), shell: params.shell }));
    await store
      .getState()
      .createSession({ shell: 'powershell.exe', args: ['-NoLogo'], isAgent: false, agentType: null });
    await store.getState().createSession({ shell: 'powershell.exe' });
    for (const [params] of ipc.spawnTerminal.mock.calls) {
      expect(params.agentType).toBeNull();
      expect(params.isAgent).toBe(false);
      expect(params.args).toEqual(['-NoLogo']);
    }
  });
  it('does not insert a phantom session after failed startup', async () => {
    ipc.spawnTerminal.mockRejectedValue('Directory missing');
    await expect(store.getState().createSession()).rejects.toBe('Directory missing');
    expect(store.getState().sessions).toHaveLength(3);
  });
  it('preserves sessions created concurrently', async () => {
    const a = deferred<ReturnType<typeof session>>();
    ipc.spawnTerminal.mockReturnValueOnce(a.promise).mockResolvedValueOnce(session('new-b'));
    const pending = store.getState().createSession();
    await store.getState().createSession();
    a.resolve(session('new-a'));
    await pending;
    expect(store.getState().sessions).toHaveLength(5);
  });
});
