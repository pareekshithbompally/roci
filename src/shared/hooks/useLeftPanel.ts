import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UI_CONFIG } from '@config/ui.config';

type LeftPanelStoreState = {
  open: boolean;
  width: number;
  setLeftPanel: (value: boolean) => void;
  setLeftPanelWidth: (value: number) => void;
};

export const useLeftPanel = create<LeftPanelStoreState>()(
  persist(
    (set) => ({
      open: false,
      width: UI_CONFIG.layout.sidebarWidth.default,
      setLeftPanel: (value) => set({ open: value }),
      setLeftPanelWidth: (value) => set({
        width: Math.min(
          UI_CONFIG.layout.sidebarWidth.max,
          Math.max(UI_CONFIG.layout.sidebarWidth.min, value),
        ),
      }),
    }),
    {
      name: 'kasset-ai-left-panel',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
