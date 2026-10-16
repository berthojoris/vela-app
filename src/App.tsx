import React, { useEffect, useState } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { TabBar } from './components/tabs/TabBar';
import { TerminalGrid } from './components/terminal/TerminalGrid';
import { StatusBar } from './components/layout/StatusBar';
import { WorktreeSidebar } from './components/sidebar/WorktreeSidebar';
import { DiffViewerModal } from './components/diff/DiffViewerModal';
import { CreateWorktreeModal } from './components/modals/CreateWorktreeModal';
import { OpenTerminalModal } from './components/modals/OpenTerminalModal';
import { SplashScreen } from './components/splash/SplashScreen';
import { useTerminalStore } from './stores/useTerminalStore';
import { useWorktreeStore } from './stores/useWorktreeStore';

export const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [isCreateWorktreeOpen, setIsCreateWorktreeOpen] = useState(false);
  const [isOpenTerminalModalOpen, setIsOpenTerminalModalOpen] = useState(false);
  const { fetchProfiles, createSession, sessions } = useTerminalStore();
  const { setRepoPath } = useWorktreeStore();

  useEffect(() => {
    // 1. Fetch available shells and agents
    fetchProfiles();

    // 2. Try to detect current workspace directory as Git repo
    setRepoPath(window.location.pathname || '.');

    // 3. Open initial default terminal if none exists
    if (sessions.length === 0) {
      createSession();
    }
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-orca-darkest text-orca-text overflow-hidden select-none font-sans relative">
      {/* 🌌 Cosmic Space Splash Screen (3.5s smooth intro) */}
      {showSplash && (
        <SplashScreen onComplete={() => setShowSplash(false)} />
      )}

      {/* Frameless Top Window Bar */}
      <TitleBar />

      {/* Main App Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Worktree Project Navigator */}
        <WorktreeSidebar onOpenCreateModal={() => setIsCreateWorktreeOpen(true)} />

        {/* Right: Terminal Multiplexer Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-orca-darkest">
          {/* Tab Navigation Bar with "+" Button & Split Toggles */}
          <TabBar onOpenTerminalModal={() => setIsOpenTerminalModalOpen(true)} />

          {/* Active Terminal Panes / Split Grid */}
          <div className="flex-1 relative overflow-hidden">
            <TerminalGrid
              onOpenCreateWorktree={() => setIsCreateWorktreeOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Native-style Status Bar at bottom */}
      <StatusBar />

      {/* Global Modals */}
      <OpenTerminalModal
        isOpen={isOpenTerminalModalOpen}
        onClose={() => setIsOpenTerminalModalOpen(false)}
      />
      <CreateWorktreeModal
        isOpen={isCreateWorktreeOpen}
        onClose={() => setIsCreateWorktreeOpen(false)}
      />
      <DiffViewerModal />
    </div>
  );
};

export default App;
