import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const RIGHT_PANEL_DEFAULTS = {
  width: 520,
  min: 360,
  max: 720,
};

type RightPanelStoreState = {
  width: number;
  setRightPanelWidth: (value: number) => void;
};

export const useRightPanel = create<RightPanelStoreState>()(
  persist(
    (set) => ({
      width: RIGHT_PANEL_DEFAULTS.width,
      setRightPanelWidth: (value) => set({
        width: Math.min(
          RIGHT_PANEL_DEFAULTS.max,
          Math.max(RIGHT_PANEL_DEFAULTS.min, value),
        ),
      }),
    }),
    {
      name: 'kasset-ai-right-panel',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
