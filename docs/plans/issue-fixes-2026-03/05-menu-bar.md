# Phase 5: Application Menu Bar

> **Prerequisite:** Phase 2 (CORS/Tauri HTTP) is complete (commit `593aa09`). That phase added `.plugin(tauri_plugin_http::init())` to `lib.rs`. This phase adds `mod menu` and `.on_menu_event()` to the same file — additive, no conflict.

## Problem

The app has no application-level menu bar. Only the system tray menu exists (`services/tauri/tray.service.ts`). Users expect standard macOS/Windows menu bar actions (Edit → Copy/Paste/Undo, Window → Minimize, etc.) and app-specific actions (File → New Chat, View → Toggle Sidebar). These don't exist, causing "menu actions don't always work" — because there are no menu actions to work.

## Current State

- **System tray:** `services/tauri/tray.service.ts` — fully implemented with Show, Start/Stop Recording, Quit
- **Rust entry:** `src-tauri/src/lib.rs` — `.run()` closure only handles `RunEvent::Reopen`, no menu event handler
- **Permissions:** `src-tauri/capabilities/default.json` includes `core:menu:default` — menu API is already permitted
- **Keyboard shortcuts:** `services/shortcuts.service.ts` — handles global shortcuts (registered via Tauri's global shortcut plugin), not menu accelerators

## Design

### Menu Structure

```
Kasset.ai
  ├─ About Kasset.ai          (system-provided on macOS)
  ├─ ──────────
  ├─ Settings...         ⌘,
  ├─ ──────────
  ├─ Hide Kasset.ai      ⌘H   (system-provided on macOS)
  ├─ Hide Others         ⌥⌘H  (system-provided on macOS)
  ├─ ──────────
  └─ Quit Kasset.ai      ⌘Q

Edit
  ├─ Undo                ⌘Z
  ├─ Redo                ⇧⌘Z
  ├─ ──────────
  ├─ Cut                 ⌘X
  ├─ Copy                ⌘C
  ├─ Paste               ⌘V
  ├─ Select All          ⌘A
  └─ ──────────

View
  ├─ Toggle Sidebar      ⌘\
  ├─ Toggle Chat Panel   ⌘⇧L
  ├─ ──────────
  ├─ Actual Size         ⌘0
  ├─ Zoom In             ⌘+
  ├─ Zoom Out            ⌘-
  └─ ──────────
  └─ Toggle Full Screen  ⌃⌘F  (system-provided on macOS)

Window
  ├─ Minimize            ⌘M
  ├─ Zoom                      (system-provided on macOS)
  └─ ──────────
```

### Implementation Approach: Rust-side menu

Build the menu in Rust (`src-tauri/src/lib.rs` or a new `src-tauri/src/menu.rs` module) using Tauri v2's menu API. This is the correct pattern because:

1. **Edit menu actions (Copy/Paste/Undo) require native handling** — they must route to the webview's native text editing, not JavaScript
2. **macOS menu bar is native** — must be created before the window
3. **Tauri v2 provides `PredefinedMenuItem`** for About, Hide, Quit, Copy, Paste, etc. — these "just work" without custom handlers

### Step 1: Create `src-tauri/src/menu.rs`

New module that builds and returns the app menu:

```rust
use tauri::menu::{Menu, MenuBuilder, Submenu, SubmenuBuilder, PredefinedMenuItem, MenuItem};
use tauri::{AppHandle, Wry};

pub fn create_app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    // App submenu (macOS only — Tauri handles platform differences)
    let app_submenu = SubmenuBuilder::new(app, "Kasset.ai")
        .about(None)              // PredefinedMenuItem::About
        .separator()
        .item(&MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?)
        .separator()
        .hide()                   // PredefinedMenuItem::Hide
        .hide_others()            // PredefinedMenuItem::HideOthers
        .separator()
        .quit()                   // PredefinedMenuItem::Quit
        .build()?;

    // Edit submenu — all predefined, native text editing
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // View submenu — custom items that emit events to the frontend
    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&MenuItem::with_id(app, "toggle_sidebar", "Toggle Sidebar", true, Some("CmdOrCtrl+\\"))?)
        .item(&MenuItem::with_id(app, "toggle_chat_panel", "Toggle Chat Panel", true, Some("CmdOrCtrl+Shift+L"))?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    // Window submenu
    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .close_window()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .build()
}
```

### Step 2: Register menu in `lib.rs`

**File:** `src-tauri/src/lib.rs`

Add `mod menu;` at the top (line 1-5 area).

In the `.setup()` closure, after `window::setup_window_handlers`, set the app menu:

```rust
.setup(|app| {
    // ... existing setup ...

    // Build and set the application menu
    let menu = menu::create_app_menu(&app.handle())?;
    app.set_menu(menu)?;

    Ok(())
})
```

### Step 3: Handle custom menu events

For the custom menu items (`settings`, `toggle_sidebar`, `toggle_chat_panel`), add a menu event handler in the `.run()` closure or via `.on_menu_event()`:

```rust
.on_menu_event(|app, event| {
    match event.id().as_ref() {
        "settings" => {
            // Emit to frontend
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("menu-action", "settings");
            }
        }
        "toggle_sidebar" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("menu-action", "toggle_sidebar");
            }
        }
        "toggle_chat_panel" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("menu-action", "toggle_chat_panel");
            }
        }
        _ => {}
    }
})
```

### Step 4: Listen for menu events on the frontend

**File:** Create `services/tauri/menu.service.ts` (following the existing service pattern in `services/tauri/`)

```typescript
import { listen } from '@tauri-apps/api/event';

type MenuAction = 'settings' | 'toggle_sidebar' | 'toggle_chat_panel';
type MenuEventCallback = (action: MenuAction) => void;

let unlisten: (() => void) | null = null;

export async function initMenuListener(onAction: MenuEventCallback): Promise<void> {
  if (unlisten) unlisten();
  unlisten = await listen<string>('menu-action', (event) => {
    onAction(event.payload as MenuAction);
  });
}

export function destroyMenuListener(): void {
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
}
```

### Step 5: Wire up menu actions in the app

In the root component or `App.tsx` (wherever tray and shortcuts are initialized), add:

```typescript
import { initMenuListener } from '@services/tauri/menu.service';

// In useEffect or init:
initMenuListener((action) => {
  switch (action) {
    case 'settings':
      // Navigate to settings view
      app.setCurrentView('settings');
      break;
    case 'toggle_sidebar':
      // Toggle sidebar state
      app.toggleSidebar();
      break;
    case 'toggle_chat_panel':
      // Toggle chat panel state
      app.toggleChatPanel();
      break;
  }
});
```

The exact method names (`toggleSidebar`, `toggleChatPanel`) depend on what's exposed by `AppContext`. Check the existing context API and wire accordingly.

### Step 6: Keyboard shortcut deduplication

The existing `shortcuts.service.ts` may already register some of these shortcuts globally. Menu accelerators and global shortcuts can conflict. Review:

- If a shortcut is handled by the menu (e.g., `⌘,` for Settings), remove it from `shortcuts.service.ts`
- Menu accelerators only work when the app window is focused. Global shortcuts work even when the app is in the background. Keep global shortcuts for recording toggle (which needs to work globally) but move in-app shortcuts to the menu.

## Verification

1. **macOS menu bar:** App menu should appear in the system menu bar with all submenus.
2. **Edit actions:** Copy/Paste/Undo should work in text inputs and the chat composer without any custom handling.
3. **View → Toggle Sidebar:** Should toggle the sidebar. Keyboard shortcut `⌘\` should also work.
4. **Settings shortcut:** `⌘,` should open settings.
5. **No shortcut conflicts:** Verify that global shortcuts from `shortcuts.service.ts` don't fire simultaneously with menu accelerators.
6. **Windows/Linux:** Menu should appear as a window menu bar (not system-level). Edit actions should still work.

## Notes

- The `PredefinedMenuItem` items (Copy, Paste, Undo, etc.) are handled entirely by Tauri/the OS. No Rust or JS handler needed.
- The Tauri v2 menu API may differ from v1. Check `tauri::menu` module docs for the exact builder syntax.
- If `SubmenuBuilder` is not available in your Tauri version, use `Submenu::with_items()` instead.
