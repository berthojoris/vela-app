import React, { useState } from 'react';
import { GitBranch, X, Plus, Bot, Sparkles } from 'lucide-react';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';

interface CreateWorktreeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateWorktreeModal: React.FC<CreateWorktreeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [branchName, setBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [autoLaunchAgent, setAutoLaunchAgent] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState('claude');

  const { createWorktree, isLoading } = useWorktreeStore();
  const { createSession } = useTerminalStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;

    try {
      const wt = await createWorktree(branchName.trim(), baseBranch.trim() || undefined);

      // Automatically launch agent in the new worktree if selected
      if (autoLaunchAgent) {
        await createSession({
          title: `${selectedAgent} (${branchName})`,
          shell: selectedAgent,
          cwd: wt.path,
          isAgent: true,
          worktreeId: wt.id,
        });
      } else {
        await createSession({
          title: branchName,
          cwd: wt.path,
          worktreeId: wt.id,
        });
      }

      setBranchName('');
      onClose();
    } catch (err: any) {
      alert(`Failed to create worktree: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none text-xs">
      <div className="w-full max-w-md bg-orca-darker border border-orca-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="h-11 px-4 border-b border-orca-border flex items-center justify-between bg-orca-card/50">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-orca-accent" />
            <h3 className="font-semibold text-white text-sm">New Isolated Worktree</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-orca-hover text-orca-muted hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-orca-muted mb-1 font-medium">
              Task or Branch Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. feat/checkout-flow or agent-refactor"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className="w-full bg-orca-darkest px-3 py-2 rounded-md border border-orca-border focus:border-orca-accent outline-none text-white text-xs font-mono"
              autoFocus
            />
            <p className="text-[10px] text-orca-muted mt-1">
              A dedicated folder and git branch will be created without touching your current files.
            </p>
          </div>

          <div>
            <label className="block text-orca-muted mb-1 font-medium">
              Base Branch
            </label>
            <input
              type="text"
              placeholder="main"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              className="w-full bg-orca-darkest px-3 py-1.5 rounded-md border border-orca-border focus:border-orca-accent outline-none text-white text-xs font-mono"
            />
          </div>

          <div className="p-3 bg-orca-card/40 border border-orca-border rounded-lg space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLaunchAgent}
                onChange={(e) => setAutoLaunchAgent(e.target.checked)}
                className="rounded border-orca-border text-orca-accent bg-orca-darkest focus:ring-0"
              />
              <span className="font-medium text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orca-emerald" />
                Launch AI Coding Agent in new worktree
              </span>
            </label>

            {autoLaunchAgent && (
              <div className="pt-2 pl-6 flex items-center gap-2">
                <span className="text-orca-muted">Select Agent:</span>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="bg-orca-darkest px-2 py-1 rounded border border-orca-border text-orca-text text-xs outline-none"
                >
                  <option value="claude">Claude Code (claude)</option>
                  <option value="gemini">Gemini CLI (gemini)</option>
                  <option value="aider">Aider (aider)</option>
                  <option value="powershell.exe">PowerShell (interactive)</option>
                </select>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-md hover:bg-orca-hover text-orca-muted hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !branchName.trim()}
              className="h-8 px-4 rounded-md bg-orca-accent hover:bg-orca-accentHover disabled:opacity-40 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Worktree</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
