import React from 'react';
import { X } from 'lucide-react';
import { useNoticeStore } from '../../stores/useNoticeStore';

export const NoticeRegion: React.FC = () => {
  const { notices, dismiss } = useNoticeStore();
  return (
    <div aria-live="polite" className="shrink-0 max-h-40 overflow-y-auto">
      {notices.map((notice) => (
        <div key={notice.id} role="alert" className="m-2 p-3 flex items-start gap-3 border border-orca-rose/40 rounded-md bg-orca-darker text-orca-text text-sm">
          <span className="flex-1 min-w-0 whitespace-pre-wrap break-words select-text">{notice.message}</span>
          <button type="button" onClick={() => dismiss(notice.id)} aria-label="Dismiss error" className="p-1 rounded hover:bg-orca-hover"><X className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
};
