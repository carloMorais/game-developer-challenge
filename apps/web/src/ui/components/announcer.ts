import { create } from 'zustand';

interface AnnouncerState {
  message: string;
  /** Alternates so repeating the same text is still announced. */
  nonce: number;
  announce(message: string): void;
}

/** Text for the app-wide polite live region (screen readers). */
export const useAnnouncer = create<AnnouncerState>((set) => ({
  message: '',
  nonce: 0,
  announce: (message) => set((s) => ({ message, nonce: s.nonce + 1 })),
}));

export const announce = (message: string) => useAnnouncer.getState().announce(message);
