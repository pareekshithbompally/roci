// The system alert with the app icon, a title, one line, Cancel and the action; a destructive one is red, takes no Return, Escape cancels.

#import <AppKit/AppKit.h>
#include <stdbool.h>

typedef void (*RociAlertDone)(void *context, bool confirmed);

/// Shows the alert and calls `done(context, confirmed)` once it is answered. Main thread only.
void roci_alert(const char *title, const char *message, const char *confirmLabel, const char *cancelLabel, bool destructive,
                RociAlertDone done, void *context) {
  NSAlert *alert = [NSAlert new];
  alert.messageText = @(title);
  alert.informativeText = @(message);
  NSButton *confirm = [alert addButtonWithTitle:@(confirmLabel)];
  NSButton *cancel = [alert addButtonWithTitle:@(cancelLabel)];
  cancel.keyEquivalent = @"\033";
  if (destructive) {
    confirm.hasDestructiveAction = YES;
    confirm.keyEquivalent = @"";
  }
  // App-modal, not a sheet: macOS 26 draws a sheet alert without the app icon.
  done(context, [alert runModal] == NSAlertFirstButtonReturn);
}
