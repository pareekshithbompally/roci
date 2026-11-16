import { QueryClient, focusManager } from '@tanstack/react-query';
import { isTauriEnvironment } from '@services/tauri';
import { windowService } from '@services/window.service';

// Focus is the window's native key state: the page stays "visible" behind System Settings, so visibility never changes.
if (isTauriEnvironment()) {
  focusManager.setEventListener((setFocused) => windowService.onFocusChanged(setFocused));
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
