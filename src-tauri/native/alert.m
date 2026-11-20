// The system alert as a sheet on the key window: the app icon, a title and one line, Cancel and the action. A destructive
// action's button is red (hasDestructiveAction) and takes no Return, so a stray Return never deletes; Escape cancels.

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
  void (^answer)(NSModalResponse) = ^(NSModalResponse response) {
    done(context, response == NSAlertFirstButtonReturn);
  };
  NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
  if (window) {
    [alert beginSheetModalForWindow:window completionHandler:answer];
  } else {
    answer([alert runModal]);
  }
}
