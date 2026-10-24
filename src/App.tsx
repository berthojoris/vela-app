import React, { useEffect, useState } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { TabBar } from './components/tabs/TabBar';
import { TerminalGrid } from './components/terminal/TerminalGrid';
import { StatusBar } from './components/layout/StatusBar';
import { WorktreeSidebar } from './components/sidebar/WorktreeSidebar';
import { DiffViewerModal } from './components/diff/DiffViewerModal';
import { CreateWorktreeModal } from './components/modals/CreateWorktreeModal';
import { OpenTerminalModal } from './components/modals/OpenTerminalModal';
import { NoticeRegion } from './components/common/NoticeRegion';
import { useNoticeStore } from './stores/useNoticeStore';
import { tauriIpc } from './lib/tauriIpc';
import { useTerminalStore } from './stores/useTerminalStore';
import { useWorktreeStore } from './stores/useWorktreeStore';
import { useDiffStore } from './stores/useDiffStore';
import { EditorWorkspace } from './components/editor/EditorWorkspace';
import { useEditorStore } from './stores/useEditorStore';
import { Files, Terminal } from 'lucide-react';

export const App: React.FC = () => {
  const [isCreateWorktreeOpen, setIsCreateWorktreeOpen] = useState(false);
  const [isOpenTerminalModalOpen, setIsOpenTerminalModalOpen] = useState(false);
  const [modalInitialProfileId, setModalInitialProfileId] = useState<string | undefined>(undefined);
  const { fetchProfiles, sessions, activeSessionId } = useTerminalStore();
  const { initRepo, syncWithSession, refreshWorktrees, refreshWorktreeBranches, autoGitStatus } = useWorktreeStore();
  const isDiffOpen = useDiffStore((state) => state.isOpen);
  const workspaceView = useEditorStore((state) => state.workspaceView);
  const editorDocumentCount = useEditorStore((state) => state.documents.length);
  const setWorkspaceView = useEditorStore((state) => state.setWorkspaceView);
  const activeSessionCwd = sessions.find((session) => session.id === activeSessionId)?.cwd;

  const handleOpenTerminalModal = (profileId?: string) => {
    setWorkspaceView('terminal');
    setModalInitialProfileId(profileId);
    setIsOpenTerminalModalOpen(true);
  };

  useEffect(() => {
    // 1. Fetch available shells and agents
    fetchProfiles();

    // 2. Ensure initial worktree panel is empty with no leftover history
    initRepo();
  }, [fetchProfiles, initRepo]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void tauriIpc
      .onAppError((message) => useNoticeStore.getState().report('Vela', message))
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => useNoticeStore.getState().report('Unable to subscribe to application errors', error));
    const handleRejection = (event: PromiseRejectionEvent) =>
      useNoticeStore.getState().report('An operation could not finish', event.reason);
    const handleError = (event: ErrorEvent) =>
      useNoticeStore.getState().report('An interface operation failed', event.error ?? event.message);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Sync active worktree/repo whenever active terminal tab changes
  useEffect(() => {
    if (activeSessionCwd !== undefined) {
      syncWithSession({ cwd: activeSessionCwd });
    } else if (sessions.length === 0) {
      syncWithSession(null);
    }
  }, [activeSessionId, sessions.length, activeSessionCwd, syncWithSession]);

  // Auto-refresh worktrees periodically and on window focus (paused while modals are open or autoGitStatus is OFF)
  useEffect(() => {
    const handleFocus = () => {
      if (!isOpenTerminalModalOpen && !isCreateWorktreeOpen && !isDiffOpen && autoGitStatus) {
        refreshWorktrees(true);
      }
    };
    window.addEventListener('focus', handleFocus);

    const interval = setInterval(() => {
      if (!document.hidden && !isOpenTerminalModalOpen && !isCreateWorktreeOpen && !isDiffOpen && autoGitStatus) {
        refreshWorktrees(true);
      }
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [isOpenTerminalModalOpen, isCreateWorktreeOpen, isDiffOpen, autoGitStatus, refreshWorktrees]);

  // Branch labels must follow `git switch`/`git checkout` even while Git auto-check is OFF:
  // the backend reads each worktree's HEAD file, so this poll spawns no Git process and does
  // not compete with Vela's own Git writes. It also keeps header/footer labels current while a
  // modal is open, and runs on focus for the case where the window was in the background.
  useEffect(() => {
    const check = () => {
      if (!document.hidden) void refreshWorktreeBranches();
    };
    const interval = setInterval(check, 2000);
    window.addEventListener('focus', check);
    return () => {
      window.removeEventListener('focus', check);
      clearInterval(interval);
    };
  }, [refreshWorktreeBranches]);

  return (
    <div className="h-screen w-screen flex flex-col bg-orca-darkest text-orca-text overflow-hidden select-none font-sans relative">
      {/* Frameless Top Window Bar */}
      <TitleBar />
      <NoticeRegion />

      {/* Main App Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Worktree Project Navigator */}
        <WorktreeSidebar onOpenCreateModal={() => setIsCreateWorktreeOpen(true)} />

        {/* Right: Terminal Multiplexer Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-orca-darkest">
          <div
            className="h-8 shrink-0 flex items-center gap-1 px-2 border-b border-orca-border bg-orca-darker text-[11px]"
            role="group"
            aria-label="Workspace view"
          >
            <button
              aria-pressed={workspaceView === 'terminal'}
              onClick={() => setWorkspaceView('terminal')}
              className={`h-6 px-2 rounded flex items-center gap-1.5 ${workspaceView === 'terminal' ? 'bg-orca-hover text-white' : 'text-orca-muted hover:text-white'}`}
            >
              <Terminal className="w-3 h-3" />
              Terminal
            </button>
            {/* The Editor tab only exists while at least one file is open */}
            {editorDocumentCount > 0 && (
              <button
                aria-pressed={workspaceView === 'editor'}
                onClick={() => setWorkspaceView('editor')}
                className={`h-6 px-2 rounded flex items-center gap-1.5 ${workspaceView === 'editor' ? 'bg-orca-hover text-white' : 'text-orca-muted hover:text-white'}`}
              >
                <Files className="w-3 h-3" />
                Editor<span className="text-orca-muted">{editorDocumentCount}</span>
              </button>
            )}
          </div>
          <EditorWorkspace />
          <div className={workspaceView === 'terminal' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
            {/* Tab Navigation Bar with "+" Button & Split Toggles */}
            <TabBar onOpenTerminalModal={() => handleOpenTerminalModal()} />

            {/* Active Terminal Panes / Split Grid */}
            <div className="flex-1 relative overflow-hidden">
              <TerminalGrid
                onOpenCreateWorktree={() => setIsCreateWorktreeOpen(true)}
                onOpenTerminalModal={handleOpenTerminalModal}
                isWorkspaceActive={workspaceView === 'terminal'}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Native-style Status Bar at bottom */}
      <StatusBar />

      {/* Global Modals */}
      <OpenTerminalModal
        isOpen={isOpenTerminalModalOpen}
        initialProfileId={modalInitialProfileId}
        onClose={() => {
          setIsOpenTerminalModalOpen(false);
          setModalInitialProfileId(undefined);
        }}
      />
      <CreateWorktreeModal isOpen={isCreateWorktreeOpen} onClose={() => setIsCreateWorktreeOpen(false)} />
      <DiffViewerModal />
    </div>
  );
};

export default App;
