import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ChevronDown, Sparkles, FolderOpen } from 'lucide-react';
import { TerminalIcon } from '../terminal/TerminalIcon';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useNoticeStore } from '../../stores/useNoticeStore';
import { ShellProfile } from '../../types';
import { formatTabTitle } from '../../lib/shellIntegration';

interface NewTabDropdownProps {
  onOpenTerminalModal: () => void;
}

export const NewTabDropdown: React.FC<NewTabDropdownProps> = ({ onOpenTerminalModal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const launchRef = useRef(false);
  const [launching, setLaunching] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const { profiles, createSession } = useTerminalStore();
  const { repoPath, worktrees, activeWorktreeId } = useWorktreeStore();

  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId);
  const defaultCwd = activeWorktree?.path || repoPath || '';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = () => setIsOpen(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        dropdownRef.current?.querySelectorAll('button')[1]?.focus();
      }
    };
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', key);
    };
  }, [isOpen]);

  const handleSelectProfile = (profile: ShellProfile) => {
    if (launchRef.current) return;
    launchRef.current = true;
    setLaunching(true);
    const title = formatTabTitle(profile.name, activeWorktree?.branch);
    void createSession({
      shell: profile.executable,
      args: profile.args,
      title,
      cwd: defaultCwd,
      worktreeId: activeWorktree?.id,
      isAgent: profile.is_agent,
      agentType: profile.agent_type,
    })
      .catch((error) => useNoticeStore.getState().report(`Unable to launch ${profile.name}`, error))
      .finally(() => {
        launchRef.current = false;
        setLaunching(false);
      });
    setIsOpen(false);
  };

  const standardProfiles = profiles.filter((p) => !p.is_agent);
  const agentProfiles = profiles.filter((p) => p.is_agent);

  return (
    <div className="relative flex items-center h-full" ref={dropdownRef}>
      {/* Primary "+" button: Opens Directory & Preset Launch Modal */}
      <button
        onClick={onOpenTerminalModal}
        className="h-7 px-2 flex items-center justify-center text-orca-muted hover:text-white hover:bg-orca-hover rounded-l border-y border-l border-orca-border transition-colors text-xs gap-1"
        title="Open New Tab in Directory (Ctrl+T)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* Dropdown toggle for instant shell presets */}
      <button
        onClick={() => {
          const rect = dropdownRef.current?.getBoundingClientRect();
          if (rect)
            setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)), top: rect.bottom + 4 });
          setIsOpen(!isOpen);
        }}
        disabled={launching}
        aria-expanded={isOpen}
        aria-label="Quick shell options"
        className="h-7 px-1 flex items-center justify-center text-orca-muted hover:text-white hover:bg-orca-hover rounded-r border border-orca-border transition-colors text-xs"
        title="Quick Shell Options"
      >
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Dropdown Menu */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={position}
            className="fixed w-60 max-h-[70vh] overflow-y-auto bg-orca-card border border-orca-border rounded-lg py-1 z-50 text-xs"
          >
            {/* Quick Option to Open in Directory */}
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenTerminalModal();
              }}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-orca-hover hover:text-white text-orca-accent font-medium transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Choose Directory First...</span>
              <span className="ml-auto text-[9px] text-orca-muted font-mono">Ctrl+T</span>
            </button>

            <div className="my-1 border-t border-orca-border" />

            {/* AI Coding Agents Section */}
            <div className="px-2 py-1 text-[10px] font-semibold text-orca-muted uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-orca-accent" />
              <span>AI Coding Agents</span>
            </div>

            {agentProfiles.length > 0 ? (
              agentProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProfile(p)}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-orca-hover hover:text-white text-orca-text transition-colors"
                >
                  <TerminalIcon
                    shell={p.executable}
                    title={p.name}
                    isAgent={p.is_agent}
                    agentType={p.agent_type}
                    className="w-3.5 h-3.5"
                  />
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-auto text-[10px] text-orca-emerald font-mono bg-orca-emerald/10 px-1 rounded">
                    Agent
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-1 text-[11px] text-orca-muted italic">No CLI agents detected in PATH</div>
            )}

            <div className="my-1 border-t border-orca-border" />

            {/* Standard Shells Section */}
            <div className="px-2 py-1 text-[10px] font-semibold text-orca-muted uppercase tracking-wider flex items-center gap-1">
              <span className="text-[10px] text-orca-muted">Direct Shells</span>
            </div>

            {standardProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectProfile(p)}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-orca-hover hover:text-white text-orca-text transition-colors"
              >
                <TerminalIcon
                  shell={p.executable}
                  title={p.name}
                  isAgent={p.is_agent}
                  agentType={p.agent_type}
                  className="w-3.5 h-3.5"
                />
                <span>{p.name}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
