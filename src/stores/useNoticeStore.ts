import { create } from 'zustand';
import { errorMessage } from '../lib/errors';
import { tauriIpc } from '../lib/tauriIpc';

interface Notice {
  id: number;
  message: string;
}

let sequence = 0;
export const useNoticeStore = create<{
  notices: Notice[];
  report: (context: string, error: unknown) => void;
  dismiss: (id: number) => void;
}>((set) => ({
  notices: [],
  report: (context, error) => {
    const message = `${context}: ${errorMessage(error)}`;
    console.error(context, error);
    // Diagnostic failures stay in the console, not another notification loop.
    if (!useNoticeStore.getState().notices.some((notice) => notice.message === message)) {
      void tauriIpc.reportError?.(message).catch((error) => console.error('Unable to write diagnostic log', error));
    }
    set((state) => state.notices.some((notice) => notice.message === message)
      ? state
      : { notices: [...state.notices.slice(-3), { id: ++sequence, message }] });
  },
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
}));
