import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type LeftPanelStoreState = {
  open: boolean;
  size: number;
  setLeftPanel: (value: boolean) => void;
  setLeftPanelSize: (value: number) => void;
};

export const useLeftPanel = create<LeftPanelStoreState>()(
  persist(
    (set) => ({
      open: false, // Start closed to test if ResizablePanelGroup is the issue
      size: 20, // Default size of 20%
      setLeftPanel: (value) => set({ open: value }),
      setLeftPanelSize: (value) => set({ size: value }),
    }),
    {
      name: 'kasset-ai-left-panel',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
