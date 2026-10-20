import React, { useEffect, useRef, useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useTerminalStore } from '../../stores/useTerminalStore';
import { errorMessage } from '../../lib/errors';
import { useDialog } from '../../lib/useDialog';
import { GitWorktree } from '../../types';
import { formatTabTitle } from '../../lib/shellIntegration';

export const CreateWorktreeModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [branchName, setBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [profileId, setProfileId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<GitWorktree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const launchedRef = useRef(false);
  const { createWorktree, repoPath } = useWorktreeStore();
  const { createSession, profiles, defaultProfileId } = useTerminalStore();
  const dialogRef = useDialog(isOpen, onClose, isSubmitting, () => !launchedRef.current);
  useEffect(() => {
    if (isOpen) {
      launchedRef.current = false;
      setBranchName('');
      setBaseBranch('');
      setCreated(null);
      setError(null);
      setProfileId(defaultProfileId);
    }
  }, [isOpen]);
  // Profiles can arrive after the modal opens; keep the selection valid.
  useEffect(() => {
    if (!isOpen || profiles.length === 0) return;
    if (!profiles.some((profile) => profile.id === profileId)) {
      setProfileId(profiles.find((profile) => profile.id === defaultProfileId)?.id ?? profiles[0].id);
    }
  }, [isOpen, profiles, profileId, defaultProfileId]);
  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setIsSubmitting(true);
    setError(null);
    let worktree = created;
    try {
      const profile = profiles.find((candidate) => candidate.id === profileId);
      if (!profile) throw new Error('Select an installed shell or agent before continuing.');
      if (!worktree) {
        worktree = await createWorktree(branchName.trim(), baseBranch.trim() || undefined);
        setCreated(worktree);
      }
      await createSession({
        title: formatTabTitle(profile.name, worktree.branch),
        shell: profile.executable,
        args: profile.args,
        cwd: worktree.path,
        worktreeId: worktree.id,
        isAgent: profile.is_agent,
        agentType: profile.agent_type,
      });
      launchedRef.current = true;
      onClose();
    } catch (error) {
      setError(
        `${worktree ? `Worktree was created at ${worktree.path}, but its terminal could not start. Retry launch without creating another worktree.\n` : ''}${errorMessage(error)}`
      );
    } finally {
      busyRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 text-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-worktree-title"
        aria-busy={isSubmitting}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-orca-darker border border-orca-border rounded-xl"
      >
        <header className="p-4 flex items-center justify-between gap-3">
          <h2 id="create-worktree-title" className="font-semibold flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            New isolated worktree
          </h2>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close worktree dialog"
            className="p-2 rounded hover:bg-orca-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <form onSubmit={handleSubmit} className="p-4 pt-0 space-y-4">
          <p className="text-orca-muted break-words select-text">Repository: {repoPath || 'No active repository'}</p>
          {error && (
            <p
              role="alert"
              className="p-3 rounded-md border border-orca-rose/40 whitespace-pre-wrap break-words select-text"
            >
              {error}
            </p>
          )}
          <fieldset disabled={isSubmitting} className="space-y-4 min-w-0">
            <label className="block">
              Branch name
              <input
                required={!created}
                disabled={Boolean(created)}
                maxLength={200}
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="feat/checkout-flow"
                className="mt-2 w-full p-2 rounded-md border border-orca-border bg-orca-darkest font-mono"
              />
            </label>
            <label className="block">
              Base branch or revision
              <input
                disabled={Boolean(created)}
                maxLength={250}
                value={baseBranch}
                onChange={(event) => setBaseBranch(event.target.value)}
                placeholder="HEAD (current commit)"
                className="mt-2 w-full p-2 rounded-md border border-orca-border bg-orca-darkest font-mono"
              />
            </label>
            <label className="block">
              Launch shell or agent
              <select
                value={profileId}
                onChange={(event) => setProfileId(event.target.value)}
                className="mt-2 w-full p-2 rounded-md border border-orca-border bg-orca-darkest"
              >
                <option value="" disabled>
                  Select an installed profile
                </option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-orca-muted">
              Agents keep their normal permission checks. A worktree isolates Git changes, not access to your computer.
            </p>
          </fieldset>
          <footer className="flex justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-3 py-2 rounded-md border border-orca-border hover:bg-orca-hover"
            >
              {created ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!created && (!branchName.trim() || !repoPath)) || !profileId}
              className="px-3 py-2 rounded-md bg-orca-accent hover:bg-orca-accentHover disabled:opacity-40 font-semibold"
            >
              {isSubmitting ? 'Working…' : created ? 'Retry terminal launch' : 'Create worktree'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
