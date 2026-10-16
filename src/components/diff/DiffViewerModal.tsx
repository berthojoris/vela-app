import React from 'react';
import { useDiffStore } from '../../stores/useDiffStore';
import { X, GitCommit, FileCode2, Check, AlertCircle } from 'lucide-react';

export const DiffViewerModal: React.FC = () => {
  const {
    isOpen,
    diffs,
    selectedFile,
    isLoading,
    commitMessage,
    closeDiffModal,
    selectFile,
    setCommitMessage,
    commit,
  } = useDiffStore();

  if (!isOpen) return null;

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;
    try {
      await commit();
    } catch (err: any) {
      alert(`Commit failed: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 select-none text-xs">
      <div className="w-full max-w-5xl h-[85vh] bg-orca-darker border border-orca-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-orca-border flex items-center justify-between bg-orca-card/50">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-orca-accent" />
            <h3 className="font-semibold text-white text-sm">Visual Diff & Review</h3>
            <span className="text-[11px] font-mono text-orca-muted bg-orca-card px-2 py-0.5 rounded border border-orca-border">
              {diffs.length} changed file{diffs.length !== 1 ? 's' : ''}
            </span>
          </div>

          <button
            onClick={closeDiffModal}
            className="w-7 h-7 rounded hover:bg-orca-hover text-orca-muted hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Files List */}
          <div className="w-72 border-r border-orca-border bg-orca-card/20 flex flex-col overflow-y-auto p-2">
            <span className="text-[10px] uppercase font-mono font-semibold text-orca-muted px-2 py-1 mb-1">
              Modified Files
            </span>

            {diffs.map((file) => {
              const isSelected = selectedFile?.path === file.path;

              return (
                <div
                  key={file.path}
                  onClick={() => selectFile(file)}
                  className={`px-2.5 py-1.5 rounded-md flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-orca-accent/20 border border-orca-accent/40 text-white font-medium'
                      : 'hover:bg-orca-hover text-orca-text'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={`text-[10px] font-mono font-bold w-4 text-center ${
                        file.status.includes('M')
                          ? 'text-orca-amber'
                          : file.status.includes('A')
                          ? 'text-orca-emerald'
                          : 'text-orca-rose'
                      }`}
                    >
                      {file.status}
                    </span>
                    <span className="truncate text-[11px]" title={file.path}>
                      {file.path}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    {file.additions > 0 && (
                      <span className="text-orca-emerald">+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-orca-rose">-{file.deletions}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {diffs.length === 0 && (
              <div className="p-4 text-center text-orca-muted text-xs">
                No modified files found in this worktree.
              </div>
            )}
          </div>

          {/* Right: Diff Code View */}
          <div className="flex-1 flex flex-col bg-orca-darkest overflow-hidden">
            {selectedFile ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-8 px-4 border-b border-orca-border bg-orca-card/30 flex items-center justify-between font-mono text-[11px]">
                  <span className="text-orca-text font-semibold">{selectedFile.path}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-orca-emerald">+{selectedFile.additions} lines</span>
                    <span className="text-orca-rose">-{selectedFile.deletions} lines</span>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed">
                  {selectedFile.diff_content ? (
                    selectedFile.diff_content.split('\n').map((line, idx) => {
                      const isAdd = line.startsWith('+') && !line.startsWith('+++');
                      const isDel = line.startsWith('-') && !line.startsWith('---');
                      const isHeader = line.startsWith('@@') || line.startsWith('diff ');

                      return (
                        <div
                          key={idx}
                          className={`whitespace-pre px-2 py-0.5 rounded-sm ${
                            isAdd
                              ? 'bg-orca-emerald/15 text-emerald-300'
                              : isDel
                              ? 'bg-orca-rose/15 text-rose-300'
                              : isHeader
                              ? 'text-orca-muted font-bold bg-orca-card/50'
                              : 'text-orca-text'
                          }`}
                        >
                          {line}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-orca-muted italic p-4">
                      No diff preview available or binary file.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-orca-muted">
                Select a file on the left to view diff preview
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer: Commit Action Bar */}
        <form
          onSubmit={handleCommit}
          className="h-12 px-4 border-t border-orca-border bg-orca-card/40 flex items-center gap-3"
        >
          <div className="flex-1 flex items-center gap-2 bg-orca-darkest px-3 py-1.5 rounded-md border border-orca-border">
            <GitCommit className="w-4 h-4 text-orca-muted" />
            <input
              type="text"
              placeholder="Enter commit message for this worktree..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={isLoading || diffs.length === 0}
              className="flex-1 bg-transparent border-none outline-none text-white text-xs placeholder:text-orca-muted"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || diffs.length === 0 || !commitMessage.trim()}
            className="h-8 px-4 rounded-md bg-orca-accent hover:bg-orca-accentHover disabled:opacity-40 text-white font-medium flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Commit to Worktree</span>
          </button>
        </form>
      </div>
    </div>
  );
};
