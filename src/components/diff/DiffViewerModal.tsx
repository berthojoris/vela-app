import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDiffStore } from '../../stores/useDiffStore';
import { useWorktreeStore } from '../../stores/useWorktreeStore';
import { useDialog } from '../../lib/useDialog';
import { FileDiff } from '../../types';
import {
  X,
  GitCommit,
  FileCode2,
  Check,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  Copy,
  Loader2,
  FolderGit2,
  RotateCcw,
} from 'lucide-react';

export const DiffViewerModal: React.FC = () => {
  const {
    isOpen,
    worktreePath,
    diffs,
    selectedFile,
    isLoading,
    isCommitting,
    isRollingBack,
    rollingBackFile,
    error,
    commitError,
    rollbackError,
    commitMessage,
    commitResult,
    closeDiffModal,
    selectFile,
    setCommitMessage,
    refreshDiffs,
    commit,
    rollbackFile,
    resetAll,
    clearCommitError,
    clearRollbackError,
  } = useDiffStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [fileToRollback, setFileToRollback] = useState<FileDiff | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dialogRef = useDialog(isOpen, closeDiffModal, isCommitting || isRollingBack);
  useEffect(() => () => clearTimeout(copyTimer.current), []);


  // Reset search and confirmation modals when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setCopied(false);
      setFileToRollback(null);
      setConfirmResetAll(false);
    }
  }, [isOpen]);

  // Intercept Escape key when a confirmation dialog is active
  useEffect(() => {
    if (!fileToRollback && !confirmResetAll) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setFileToRollback(null);
        setConfirmResetAll(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [fileToRollback, confirmResetAll]);

  // Filter diffs based on search query
  const filteredDiffs = useMemo(() => {
    if (!searchQuery.trim()) return diffs;
    const q = searchQuery.toLowerCase();
    return diffs.filter((f) => f.path.toLowerCase().includes(q));
  }, [diffs, searchQuery]);

  // Total additions & deletions
  const totalAdditions = useMemo(() => diffs.reduce((sum, d) => sum + d.additions, 0), [diffs]);
  const totalDeletions = useMemo(() => diffs.reduce((sum, d) => sum + d.deletions, 0), [diffs]);

  // Worktree folder name
  const worktreeName = useMemo(() => {
    if (!worktreePath) return '';
    const parts = worktreePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || worktreePath;
  }, [worktreePath]);

  if (!isOpen) return null;

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || isCommitting || isLoading) return;
    try {
      await commit();
    } catch {
      // Error is set in store and displayed in modal banner
    }
  };

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.trim();
    if (s.includes('M')) return { text: 'MOD', color: 'text-orca-amber border-orca-amber/30 bg-orca-amber/10' };
    if (s.includes('A')) return { text: 'ADD', color: 'text-orca-emerald border-orca-emerald/30 bg-orca-emerald/10' };
    if (s.includes('D')) return { text: 'DEL', color: 'text-orca-rose border-orca-rose/30 bg-orca-rose/10' };
    if (s.includes('R')) return { text: 'REN', color: 'text-sky-400 border-sky-400/30 bg-sky-400/10' };
    if (s.includes('?')) return { text: 'UNT', color: 'text-purple-400 border-purple-400/30 bg-purple-400/10' };
    return { text: s || 'MOD', color: 'text-orca-muted border-orca-border bg-orca-card' };
  };

  // Diff lines truncation limit
  const MAX_DIFF_LINES = 2000;
  const diffLines = selectedFile?.diff_content ? selectedFile.diff_content.split('\n') : [];
  const isDiffTruncated = diffLines.length > MAX_DIFF_LINES;
  const visibleDiffLines = isDiffTruncated ? diffLines.slice(0, MAX_DIFF_LINES) : diffLines;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-6 select-none text-xs">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Visual diff and review" aria-busy={isCommitting} className="w-full max-w-5xl h-[85vh] bg-orca-darker border border-orca-border rounded-xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-orca-border flex items-center justify-between bg-orca-card/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileCode2 className="w-4 h-4 text-orca-accent shrink-0" />
            <h3 className="font-semibold text-white text-sm shrink-0">Visual Diff & Review</h3>

            {worktreeName && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-orca-border bg-orca-darkest/70 text-orca-muted text-[11px] truncate max-w-xs font-mono">
                <FolderGit2 className="w-3 h-3 text-orca-accent shrink-0" />
                <span className="truncate" title={worktreePath || ''}>{worktreeName}</span>
              </div>
            )}

            {!isLoading && !error && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-orca-muted bg-orca-darkest px-2 py-0.5 rounded border border-orca-border">
                  {diffs.length} file{diffs.length !== 1 ? 's' : ''}
                </span>
                {totalAdditions > 0 && (
                  <span className="text-[11px] font-mono text-orca-emerald bg-orca-emerald/10 px-2 py-0.5 rounded border border-orca-emerald/20">
                    +{totalAdditions}
                  </span>
                )}
                {totalDeletions > 0 && (
                  <span className="text-[11px] font-mono text-orca-rose bg-orca-rose/10 px-2 py-0.5 rounded border border-orca-rose/20">
                    -{totalDeletions}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setConfirmResetAll(true)}
              disabled={isLoading || isCommitting || isRollingBack || diffs.length === 0}
              className="h-7 px-2.5 rounded hover:bg-orca-rose/15 text-orca-rose/85 hover:text-orca-rose flex items-center gap-1.5 transition-colors border border-orca-rose/30 hover:border-orca-rose/50 disabled:opacity-30 disabled:pointer-events-none"
              title="Reset / rollback all changes in this worktree"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRollingBack && !rollingBackFile ? 'animate-spin' : ''}`} />
              <span className="text-[11px] font-medium hidden sm:inline">Reset All</span>
            </button>

            <button
              onClick={() => refreshDiffs()}
              disabled={isLoading || isCommitting || isRollingBack}
              className="h-7 px-2 rounded hover:bg-orca-hover text-orca-muted hover:text-white flex items-center gap-1 transition-colors border border-transparent hover:border-orca-border disabled:opacity-40"
              title="Refresh changes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orca-accent' : ''}`} />
              <span className="text-[11px] font-medium hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={closeDiffModal}
              disabled={isCommitting || isRollingBack}
              className="w-7 h-7 rounded hover:bg-orca-hover text-orca-muted hover:text-white flex items-center justify-center transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {commitResult && <p role="status" className="px-4 py-3 text-sm text-orca-emerald bg-orca-darker">Commit created successfully.{error ? ' Refresh failed; do not submit the same commit again.' : ''}</p>}

        {/* Global Error Banner */}
        {error && (
          <div className="px-4 py-3 bg-orca-rose/10 border-b border-orca-rose/30 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-orca-rose shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-rose-300 text-[11px]">Git Inspection Error</div>
              <div className="text-orca-muted font-mono text-[11px] break-all mt-0.5 whitespace-pre-wrap">{error}</div>
            </div>
            <button
              onClick={() => refreshDiffs()}
              className="px-2.5 py-1 rounded bg-orca-rose/20 hover:bg-orca-rose/30 text-rose-200 border border-orca-rose/40 font-medium text-[10px] shrink-0 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Commit Error Banner */}
        {commitError && (
          <div className="px-4 py-2 bg-orca-rose/15 border-b border-orca-rose/30 flex items-center gap-2.5 justify-between">
            <div className="flex items-center gap-2 truncate">
              <AlertCircle className="w-4 h-4 text-orca-rose shrink-0" />
              <span className="font-mono text-[11px] text-rose-300 truncate" title={commitError}>
                Commit failed: {commitError}
              </span>
            </div>
            <button
              onClick={clearCommitError}
              className="text-orca-muted hover:text-white p-1 rounded"
              title="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Rollback Error Banner */}
        {rollbackError && (
          <div className="px-4 py-2 bg-orca-rose/15 border-b border-orca-rose/30 flex items-center gap-2.5 justify-between">
            <div className="flex items-center gap-2 truncate">
              <AlertCircle className="w-4 h-4 text-orca-rose shrink-0" />
              <span className="font-mono text-[11px] text-rose-300 truncate" title={rollbackError}>
                Rollback failed: {rollbackError}
              </span>
            </div>
            <button
              onClick={clearRollbackError}
              className="text-orca-muted hover:text-white p-1 rounded"
              title="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          {isLoading && diffs.length === 0 ? (
            /* Loading State */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              <Loader2 className="w-8 h-8 text-orca-accent animate-spin" />
              <div className="text-sm font-medium text-white">Inspecting Repository Changes...</div>
              <div className="text-orca-muted text-xs">
                Scanning working tree, index, and status in worktree.
              </div>
            </div>
          ) : error && diffs.length === 0 ? (
            /* Fatal Error State */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 max-w-md mx-auto text-center">
              <AlertTriangle className="w-10 h-10 text-orca-rose" />
              <div className="text-base font-semibold text-white">Unable to Load Diffs</div>
              <p className="text-orca-muted text-xs leading-relaxed">
                Vela could not read the git status or diff for this worktree directory.
              </p>
              <div className="w-full bg-orca-darkest border border-orca-border rounded p-3 font-mono text-[11px] text-rose-400 text-left overflow-auto max-h-36">
                {error}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => refreshDiffs()}
                  className="px-4 py-1.5 rounded bg-orca-accent hover:bg-orca-accentHover text-white font-medium text-xs flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Inspection</span>
                </button>
                <button
                  onClick={closeDiffModal}
                  className="px-4 py-1.5 rounded bg-orca-card hover:bg-orca-hover text-orca-text border border-orca-border font-medium text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Left Column: File List with Search */}
              <div className="w-80 border-r border-orca-border bg-orca-card/30 flex flex-col overflow-hidden">
                {/* Search Bar */}
                <div className="p-2 border-b border-orca-border">
                  <div className="flex items-center gap-2 bg-orca-darkest px-2.5 py-1 rounded border border-orca-border focus-within:border-orca-accent">
                    <Search className="w-3.5 h-3.5 text-orca-muted shrink-0" />
                    <input
                      type="text"
                      placeholder="Filter files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent border-none outline-none text-white text-[11px] placeholder:text-orca-muted"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-orca-muted hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* File Count / Subheader */}
                <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-mono font-medium text-orca-muted border-b border-orca-border/50 bg-orca-darkest/40">
                  <span>
                    {searchQuery
                      ? `FILTERED (${filteredDiffs.length}/${diffs.length})`
                      : `CHANGED FILES (${diffs.length})`}
                  </span>
                  <div className="flex items-center gap-2">
                    {diffs.length > 0 && !searchQuery && (
                      <button
                        type="button"
                        onClick={() => setConfirmResetAll(true)}
                        disabled={isLoading || isCommitting || isRollingBack}
                        className="text-[10px] text-orca-muted hover:text-orca-rose flex items-center gap-1 transition-colors disabled:opacity-40"
                        title="Reset all changes in worktree"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>reset all</span>
                      </button>
                    )}
                    {isLoading && (
                      <span className="flex items-center gap-1 text-orca-accent">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        updating
                      </span>
                    )}
                  </div>
                </div>

                {/* File List Items */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {filteredDiffs.map((file) => {
                    const isSelected = selectedFile?.path === file.path;
                    const badge = getStatusBadge(file.status);
                    const pathParts = file.path.split('/');
                    const fileName = pathParts.pop();
                    const dirPath = pathParts.join('/');

                    return (
                      <div
                        key={file.path}
                        onClick={() => selectFile(file)}
                        className={`group px-2 py-1.5 rounded flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-orca-accent/20 border border-orca-accent/40 text-white font-medium'
                            : 'hover:bg-orca-hover text-orca-text border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1 flex-1">
                          <span
                            className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded border leading-none shrink-0 ${badge.color}`}
                            title={`Status: ${file.status}`}
                          >
                            {badge.text}
                          </span>
                          <div className="min-w-0 truncate text-[11px]">
                            {dirPath && (
                              <span className="text-orca-muted font-normal text-[10px]">{dirPath}/</span>
                            )}
                            <span className={isSelected ? 'text-white' : 'text-orca-text'}>{fileName}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-[10px] shrink-0">
                          {file.additions > 0 && (
                            <span className="text-orca-emerald">+{file.additions}</span>
                          )}
                          {file.deletions > 0 && (
                            <span className="text-orca-rose">-{file.deletions}</span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFileToRollback(file);
                            }}
                            disabled={isLoading || isCommitting || isRollingBack}
                            className="w-5 h-5 rounded flex items-center justify-center text-orca-muted hover:text-orca-rose hover:bg-orca-rose/20 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all border border-transparent hover:border-orca-rose/30 disabled:opacity-30"
                            title={`Rollback changes in ${fileName}`}
                          >
                            {isRollingBack && rollingBackFile === file.path ? (
                              <Loader2 className="w-3 h-3 animate-spin text-orca-rose" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {diffs.length === 0 && (
                    <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-orca-emerald/80" />
                      <div className="font-semibold text-white text-xs">Working Tree Clean</div>
                      <p className="text-orca-muted text-[11px]">
                        No modified, staged, or untracked files detected in this worktree.
                      </p>
                    </div>
                  )}

                  {diffs.length > 0 && filteredDiffs.length === 0 && (
                    <div className="p-4 text-center text-orca-muted text-xs">
                      No files matching &quot;{searchQuery}&quot;
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Diff Preview Pane */}
              <div className="flex-1 flex flex-col bg-orca-darkest overflow-hidden">
                {selectedFile ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Diff Header Bar */}
                    <div className="h-9 px-4 border-b border-orca-border bg-orca-card/40 flex items-center justify-between font-mono text-[11px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${getStatusBadge(selectedFile.status).color}`}
                        >
                          {getStatusBadge(selectedFile.status).text}
                        </span>
                        <span className="text-orca-text font-semibold truncate" title={selectedFile.path}>
                          {selectedFile.path}
                        </span>
                        <button
                          onClick={() => handleCopyPath(selectedFile.path)}
                          className="text-orca-muted hover:text-white p-1 rounded transition-colors"
                          title="Copy file path"
                        >
                          {copied ? <Check className="w-3 h-3 text-orca-emerald" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFileToRollback(selectedFile)}
                          disabled={isLoading || isCommitting || isRollingBack}
                          className="h-5 px-1.5 rounded text-orca-rose/90 hover:text-orca-rose hover:bg-orca-rose/15 flex items-center gap-1 transition-colors border border-orca-rose/30 hover:border-orca-rose/50 disabled:opacity-40 ml-1 text-[10px] font-sans font-medium"
                          title={`Rollback changes in ${selectedFile.path}`}
                        >
                          {isRollingBack && rollingBackFile === selectedFile.path ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-2.5 h-2.5" />
                          )}
                          <span>Rollback</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 font-mono shrink-0">
                        {selectedFile.additions > 0 && (
                          <span className="text-orca-emerald">+{selectedFile.additions} added</span>
                        )}
                        {selectedFile.deletions > 0 && (
                          <span className="text-orca-rose">-{selectedFile.deletions} deleted</span>
                        )}
                      </div>
                    </div>

                    {/* Diff Code Viewer */}
                    <div className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed">
                      {isDiffTruncated && (
                        <div className="mb-2 p-2 bg-orca-amber/10 border border-orca-amber/30 rounded text-amber-300 text-[11px]">
                          Note: This diff is large ({diffLines.length} lines). Displaying the first {MAX_DIFF_LINES} lines for optimal performance.
                        </div>
                      )}

                      {visibleDiffLines.length > 0 ? (
                        visibleDiffLines.map((line, idx) => {
                          const isAdd = line.startsWith('+') && !line.startsWith('+++');
                          const isDel = line.startsWith('-') && !line.startsWith('---');
                          const isHeader = line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ');

                          return (
                            <div
                              key={idx}
                              className={`whitespace-pre px-2 py-0.5 rounded-sm ${
                                isAdd
                                  ? 'bg-orca-emerald/15 text-emerald-300'
                                  : isDel
                                  ? 'bg-orca-rose/15 text-rose-300'
                                  : isHeader
                                  ? 'text-orca-muted font-bold bg-orca-card/60'
                                  : 'text-orca-text'
                              }`}
                            >
                              {line}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-orca-muted italic p-6 text-center">
                          {selectedFile.diff_content || 'No diff content available for this file.'}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-orca-muted p-8 text-center">
                    <FileCode2 className="w-10 h-10 mb-2 opacity-30 text-orca-muted" />
                    <div className="font-medium text-white text-xs mb-1">
                      {diffs.length > 0 ? 'Select a file to view diff' : 'No changes to display'}
                    </div>
                    <div className="text-[11px] max-w-xs">
                      {diffs.length > 0
                        ? 'Click any changed file from the left panel to inspect modifications.'
                        : 'Your worktree working copy is currently clean.'}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer: Commit Action Bar */}
        <form
          onSubmit={handleCommitSubmit}
          className="min-h-12 px-4 py-2 border-t border-orca-border bg-orca-card/50 flex flex-col items-stretch gap-1.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-orca-darkest px-3 py-1.5 rounded-md border border-orca-border focus-within:border-orca-accent">
              <GitCommit className="w-4 h-4 text-orca-muted shrink-0" />
              <input
                type="text"
                placeholder="Enter commit message for this worktree (Ctrl+Enter to commit)..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleCommitSubmit(e);
                  }
                }}
                disabled={isLoading || isCommitting || Boolean(error) || diffs.length === 0}
                maxLength={16000}
                className="flex-1 bg-transparent border-none outline-none text-white text-xs placeholder:text-orca-muted disabled:opacity-40"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || isCommitting || Boolean(error) || diffs.length === 0 || !commitMessage.trim()}
              className="h-8 px-4 rounded-md bg-orca-accent hover:bg-orca-accentHover disabled:opacity-40 text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Committing...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Commit to Worktree</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] leading-none text-orca-muted">
            Commit mencakup semua perubahan di worktree ini: file tracked, perubahan staged/unstaged, dan file untracked yang tidak di-ignore.
          </p>
        </form>

        {/* Rollback File Confirmation Modal */}
        {fileToRollback && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="rollback-file-title"
              className="w-full max-w-md p-5 bg-orca-darker border border-orca-border rounded-xl text-xs space-y-3.5"
            >
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span id="rollback-file-title">Rollback File Changes</span>
              </div>
              <p className="text-orca-text leading-relaxed">
                Apakah Anda yakin ingin membatalkan semua perubahan pada file ini?
              </p>
              <div className="p-2 rounded bg-orca-darkest border border-orca-border font-mono text-[11px] text-white truncate" title={fileToRollback.path}>
                {fileToRollback.path}
              </div>
              <p className="text-orca-muted text-[11px] leading-relaxed">
                Perubahan pada file yang sudah dimodifikasi akan dikembalikan ke status commit terakhir (HEAD), dan file baru yang belum pernah di-commit akan dihapus permanen. Tindakan ini <strong className="text-rose-400 font-medium">tidak dapat dibatalkan</strong>.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isRollingBack}
                  onClick={() => setFileToRollback(null)}
                  className="px-3 py-1.5 rounded-md border border-orca-border hover:bg-orca-hover text-orca-text transition-colors disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isRollingBack}
                  onClick={async () => {
                    const target = fileToRollback.path;
                    try {
                      await rollbackFile(target);
                      setFileToRollback(null);
                      void useWorktreeStore.getState().refreshWorktrees(true);
                    } catch {
                      // Error is captured in store and displayed in banner
                    }
                  }}
                  className="px-3 py-1.5 rounded-md border border-orca-rose/50 bg-orca-rose/25 hover:bg-orca-rose/35 text-rose-200 font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isRollingBack ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengembalikan...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rollback File</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reset All Changes Confirmation Modal */}
        {confirmResetAll && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reset-all-title"
              className="w-full max-w-md p-5 bg-orca-darker border border-orca-border rounded-xl text-xs space-y-3.5"
            >
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span id="reset-all-title">Reset / Rollback Semua Perubahan</span>
              </div>
              <p className="text-orca-text leading-relaxed">
                Apakah Anda yakin ingin membatalkan semua perubahan pada seluruh <strong className="text-white">{diffs.length} file</strong> di worktree ini?
              </p>
              <p className="text-orca-muted text-[11px] leading-relaxed">
                Semua perubahan file tracked (staged maupun unstaged) akan di-reset ke HEAD, dan semua untracked file akan dihapus permanen. Tindakan ini <strong className="text-rose-400 font-medium">tidak dapat dibatalkan</strong>.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isRollingBack}
                  onClick={() => setConfirmResetAll(false)}
                  className="px-3 py-1.5 rounded-md border border-orca-border hover:bg-orca-hover text-orca-text transition-colors disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isRollingBack}
                  onClick={async () => {
                    try {
                      await resetAll();
                      setConfirmResetAll(false);
                      void useWorktreeStore.getState().refreshWorktrees(true);
                    } catch {
                      // Error is captured in store and displayed in banner
                    }
                  }}
                  className="px-3 py-1.5 rounded-md border border-orca-rose/50 bg-orca-rose/25 hover:bg-orca-rose/35 text-rose-200 font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isRollingBack ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mereset...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Semua Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
