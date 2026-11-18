// A choice menu at a point in the key window: section headers, two-line rows (title, grey subtitle) with an icon and a checkmark.

#import <AppKit/AppKit.h>

@interface RociChoiceTarget : NSObject
@property(nonatomic) NSInteger chosen;
- (void)pick:(NSMenuItem *)item;
@end

@implementation RociChoiceTarget
- (void)pick:(NSMenuItem *)item {
  self.chosen = item.tag;
}
@end

/// One row from its JSON entry: `header`, `separator`, or a row (`title`, optional `subtitle` and base64 `icon`, `checked`, `enabled`).
static NSMenuItem *rociChoiceItem(NSDictionary *entry, NSInteger index, RociChoiceTarget *target, CGFloat iconSize) {
  NSString *kind = entry[@"kind"];
  if ([kind isEqualToString:@"separator"]) return [NSMenuItem separatorItem];
  if ([kind isEqualToString:@"header"]) return [NSMenuItem sectionHeaderWithTitle:entry[@"title"]];
  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:entry[@"title"] action:@selector(pick:) keyEquivalent:@""];
  item.tag = index;
  item.target = target;
  item.enabled = [entry[@"enabled"] boolValue];
  item.state = [entry[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
  NSString *subtitle = entry[@"subtitle"];
  if ([subtitle isKindOfClass:[NSString class]] && subtitle.length > 0) item.subtitle = subtitle;
  NSString *icon = entry[@"icon"];
  if ([icon isKindOfClass:[NSString class]]) {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:icon options:0];
    NSImage *image = data ? [[NSImage alloc] initWithData:data] : nil;
    image.size = NSMakeSize(iconSize, iconSize);
    item.image = image;
    // macOS 27 hides menu item images unless the item asks for them (NSMenuItem.h, preferredImageVisibility).
    if (@available(macOS 27.0, *)) item.preferredImageVisibility = NSMenuItemImageVisibilityVisible;
  }
  return item;
}

/// Shows the menu with its top-left at (x, y) in the key window's content (top-left origin, points) and blocks until it closes.
/// Returns the chosen row's index, or -1 when dismissed. Call on the main thread.
int roci_choice_menu(const char *json, double x, double y, double iconSize) {
  NSData *data = [NSData dataWithBytes:json length:strlen(json)];
  NSArray *entries = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  NSView *view = NSApp.keyWindow.contentView;
  if (![entries isKindOfClass:[NSArray class]] || !view) return -1;

  RociChoiceTarget *target = [RociChoiceTarget new];
  target.chosen = -1;
  NSMenu *menu = [[NSMenu alloc] initWithTitle:@""];
  menu.autoenablesItems = NO;
  for (NSUInteger index = 0; index < entries.count; index++) {
    [menu addItem:rociChoiceItem(entries[index], (NSInteger)index, target, iconSize)];
  }

  CGFloat top = view.isFlipped ? y : view.bounds.size.height - y;
  [menu popUpMenuPositioningItem:nil atLocation:NSMakePoint(x, top) inView:view];
  return (int)target.chosen;
}
