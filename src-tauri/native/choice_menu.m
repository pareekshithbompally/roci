// A native menu at a point in the key window: section headers, two-line rows (icon, title, grey subtitle) that pick and close,
// switch rows that toggle and keep the menu open, and fan-out submenus. Returns what was picked and switched as JSON.

#import <AppKit/AppKit.h>

@interface RociMenuTarget : NSObject
@property(nonatomic, copy) NSString *chosen;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *toggled;
- (void)pick:(NSMenuItem *)item;
- (void)flip:(NSSwitch *)control;
@end

@implementation RociMenuTarget
- (void)pick:(NSMenuItem *)item {
  self.chosen = item.representedObject;
}
- (void)flip:(NSSwitch *)control {
  self.toggled[control.identifier] = @(control.state == NSControlStateValueOn);
}
@end

static const CGFloat kRowPadding = 14;
static const CGFloat kGap = 8;

/// An image from base64 PNG (`icon`) or an SF Symbol name (`symbol`), at the menu's icon size; nil when neither is given.
/// `template` glyphs (monochrome app icons) are tinted by AppKit to match the menu's light or dark appearance.
static NSImage *rociImage(NSDictionary *entry, CGFloat size) {
  NSImage *image = nil;
  NSString *icon = entry[@"icon"];
  NSString *symbol = entry[@"symbol"];
  if ([icon isKindOfClass:[NSString class]]) {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:icon options:0];
    image = data ? [[NSImage alloc] initWithData:data] : nil;
  } else if ([symbol isKindOfClass:[NSString class]]) {
    image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:nil];
  }
  image.size = NSMakeSize(size, size);
  image.template = [entry[@"template"] boolValue];
  return image;
}

static NSString *rociString(id value) {
  return [value isKindOfClass:[NSString class]] && [value length] > 0 ? value : nil;
}

static NSTextField *rociLabel(NSString *text, CGFloat size, NSColor *color) {
  NSTextField *label = [NSTextField labelWithString:text];
  label.font = [NSFont menuFontOfSize:size];
  label.textColor = color;
  return label;
}

/// A switch row: icon, title over a grey subtitle, a switch at the trailing edge; clicking the switch keeps the menu open.
static NSMenuItem *rociSwitchItem(NSDictionary *entry, RociMenuTarget *target, CGFloat iconSize) {
  BOOL enabled = [entry[@"enabled"] boolValue];
  NSString *subtitle = rociString(entry[@"subtitle"]);
  NSTextField *title = rociLabel(entry[@"title"], 0, enabled ? NSColor.labelColor : NSColor.tertiaryLabelColor);
  NSTextField *detail = subtitle ? rociLabel(subtitle, [NSFont smallSystemFontSize], NSColor.secondaryLabelColor) : nil;
  NSImage *image = rociImage(entry, iconSize);

  NSSwitch *control = [[NSSwitch alloc] initWithFrame:NSZeroRect];
  control.controlSize = NSControlSizeMini;
  [control sizeToFit];
  control.state = [entry[@"on"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
  control.enabled = enabled;
  control.identifier = entry[@"id"];
  control.target = target;
  control.action = @selector(flip:);

  CGFloat textX = kRowPadding + (image ? iconSize + kGap : 0);
  CGFloat textWidth = MAX(title.intrinsicContentSize.width, detail.intrinsicContentSize.width);
  CGFloat height = detail ? 40 : 28;
  CGFloat width = textX + textWidth + kGap * 3 + NSWidth(control.frame) + kRowPadding;
  NSView *row = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, width, height)];

  if (image) {
    NSImageView *view = [NSImageView imageViewWithImage:image];
    view.frame = NSMakeRect(kRowPadding, (height - iconSize) / 2, iconSize, iconSize);
    [row addSubview:view];
  }
  CGFloat titleHeight = title.intrinsicContentSize.height;
  title.frame = NSMakeRect(textX, detail ? height / 2 : (height - titleHeight) / 2, textWidth, titleHeight);
  [row addSubview:title];
  if (detail) {
    CGFloat detailHeight = detail.intrinsicContentSize.height;
    detail.frame = NSMakeRect(textX, height / 2 - detailHeight, textWidth, detailHeight);
    [row addSubview:detail];
  }
  control.frame = NSMakeRect(width - kRowPadding - NSWidth(control.frame), (height - NSHeight(control.frame)) / 2,
                             NSWidth(control.frame), NSHeight(control.frame));
  [row addSubview:control];

  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:entry[@"title"] action:nil keyEquivalent:@""];
  item.view = row;
  return item;
}

static NSMenu *rociMenu(NSArray *entries, RociMenuTarget *target, CGFloat iconSize);

/// One entry: `header`, `separator`, `toggle` (switch row), `submenu`, or a row that picks (`id`, `title`, `subtitle`, `checked`, `enabled`).
static NSMenuItem *rociItem(NSDictionary *entry, RociMenuTarget *target, CGFloat iconSize) {
  NSString *kind = entry[@"kind"];
  if ([kind isEqualToString:@"separator"]) return [NSMenuItem separatorItem];
  if ([kind isEqualToString:@"header"]) return [NSMenuItem sectionHeaderWithTitle:entry[@"title"]];
  if ([kind isEqualToString:@"toggle"]) return rociSwitchItem(entry, target, iconSize);

  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:entry[@"title"] action:nil keyEquivalent:@""];
  item.subtitle = rociString(entry[@"subtitle"]);
  item.image = rociImage(entry, iconSize);
  // macOS 27 hides menu item images unless the item asks for them (NSMenuItem.h, preferredImageVisibility).
  if (@available(macOS 27.0, *)) item.preferredImageVisibility = NSMenuItemImageVisibilityVisible;
  if ([kind isEqualToString:@"submenu"]) {
    item.submenu = rociMenu(entry[@"items"], target, iconSize);
    return item;
  }
  item.action = @selector(pick:);
  item.target = target;
  item.representedObject = entry[@"id"];
  item.enabled = [entry[@"enabled"] boolValue];
  item.state = [entry[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
  return item;
}

static NSMenu *rociMenu(NSArray *entries, RociMenuTarget *target, CGFloat iconSize) {
  NSMenu *menu = [[NSMenu alloc] initWithTitle:@""];
  menu.autoenablesItems = NO;
  for (NSDictionary *entry in entries) [menu addItem:rociItem(entry, target, iconSize)];
  return menu;
}

/// Shows the menu with its top-left at (x, y) in the key window's content (top-left origin, points); blocks until it closes.
/// Returns `{"chosen": id | null, "toggled": {id: bool}}` as a C string freed with `roci_menu_free_string`. Main thread only.
char *roci_menu(const char *json, double x, double y, double iconSize) {
  NSData *data = [NSData dataWithBytes:json length:strlen(json)];
  NSArray *entries = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  NSView *view = NSApp.keyWindow.contentView;
  RociMenuTarget *target = [RociMenuTarget new];
  target.toggled = [NSMutableDictionary dictionary];
  if ([entries isKindOfClass:[NSArray class]] && view) {
    NSMenu *menu = rociMenu(entries, target, iconSize);
    CGFloat top = view.isFlipped ? y : view.bounds.size.height - y;
    [menu popUpMenuPositioningItem:nil atLocation:NSMakePoint(x, top) inView:view];
  }
  NSDictionary *result = @{@"chosen": target.chosen ?: [NSNull null], @"toggled": target.toggled};
  NSData *out = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
  return strdup([[NSString alloc] initWithData:out encoding:NSUTF8StringEncoding].UTF8String);
}

void roci_menu_free_string(char *value) {
  free(value);
}
