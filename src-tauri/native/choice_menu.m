// A native menu at a point in the key window: section headers, two-line rows (icon, title, grey subtitle) that pick and close,
// switch rows that toggle and keep the menu open, and fan-out submenus. Returns what was picked and switched as JSON.

#import <AppKit/AppKit.h>

// Switch-row metrics, in points, matched to AppKit's own menu rows (icon column, title inset, row heights).
static const CGFloat kRowPadding = 14;
static const CGFloat kIconGap = 6;
static const CGFloat kSwitchGap = 24;
static const CGFloat kOneLineHeight = 26;
static const CGFloat kTwoLineHeight = 38;
static const CGFloat kSwitchWidth = 32;
static const CGFloat kSwitchHeight = 18;
/// An off switch's track: the label colour, faint (light on a dark menu, dark on a light one), like AppKit's.
static const CGFloat kSwitchOffAlpha = 0.15;

/// A switch drawn in the system accent colour whatever window is key: AppKit's NSSwitch greys out in a menu whose submenu
/// has focus, so a menu's switches would lose their colour as soon as one fans out. Sized like AppKit's small switch.
@interface RociMenuSwitch : NSControl
@property(nonatomic) BOOL on;
@end

@implementation RociMenuSwitch
- (BOOL)isFlipped {
  return NO;
}
- (void)drawRect:(NSRect)dirtyRect {
  NSRect track = NSInsetRect(self.bounds, 0.5, 0.5);
  CGFloat radius = NSHeight(track) / 2;
  CGFloat alpha = self.enabled ? 1 : 0.4;
  NSColor *trackColor = self.on ? NSColor.controlAccentColor : [NSColor.labelColor colorWithAlphaComponent:kSwitchOffAlpha];
  [[trackColor colorWithAlphaComponent:trackColor.alphaComponent * alpha] setFill];
  [[NSBezierPath bezierPathWithRoundedRect:track xRadius:radius yRadius:radius] fill];
  CGFloat inset = 1.5;
  CGFloat knob = NSHeight(track) - inset * 2;
  CGFloat x = self.on ? NSMaxX(track) - inset - knob : NSMinX(track) + inset;
  NSShadow *shadow = [NSShadow new];
  shadow.shadowColor = [NSColor colorWithWhite:0 alpha:0.25];
  shadow.shadowBlurRadius = 1;
  shadow.shadowOffset = NSMakeSize(0, -0.5);
  [NSGraphicsContext saveGraphicsState];
  [shadow set];
  [[NSColor.whiteColor colorWithAlphaComponent:alpha] setFill];
  [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(x, NSMinY(track) + inset, knob, knob)] fill];
  [NSGraphicsContext restoreGraphicsState];
}
- (void)mouseDown:(NSEvent *)event {
  if (!self.enabled) return;
  self.on = !self.on;
  [self setNeedsDisplay:YES];
  [self sendAction:self.action to:self.target];
}
@end

@interface RociMenuTarget : NSObject
@property(nonatomic, copy) NSString *chosen;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *toggled;
- (void)pick:(NSMenuItem *)item;
- (void)flip:(RociMenuSwitch *)control;
@end

@implementation RociMenuTarget
- (void)pick:(NSMenuItem *)item {
  self.chosen = item.representedObject;
}
- (void)flip:(RociMenuSwitch *)control {
  self.toggled[control.identifier] = @(control.on);
}
@end

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

/// A switch row: icon, title over a grey subtitle, a switch pinned to the trailing edge; clicking the switch keeps the menu open.
/// The row stretches to the menu's width (flexible width), so every switch lines up; its own width is the least it needs.
static NSMenuItem *rociSwitchItem(NSDictionary *entry, RociMenuTarget *target, CGFloat iconSize) {
  BOOL enabled = [entry[@"enabled"] boolValue];
  NSString *subtitle = rociString(entry[@"subtitle"]);
  NSTextField *title = rociLabel(entry[@"title"], 0, enabled ? NSColor.labelColor : NSColor.tertiaryLabelColor);
  NSTextField *detail = subtitle ? rociLabel(subtitle, [NSFont smallSystemFontSize], NSColor.secondaryLabelColor) : nil;
  [title sizeToFit];
  [detail sizeToFit];
  NSImage *image = rociImage(entry, iconSize);

  RociMenuSwitch *control = [[RociMenuSwitch alloc] initWithFrame:NSMakeRect(0, 0, kSwitchWidth, kSwitchHeight)];
  control.on = [entry[@"on"] boolValue];
  control.enabled = enabled;
  control.identifier = entry[@"id"];
  control.target = target;
  control.action = @selector(flip:);

  CGFloat textX = kRowPadding + (image ? iconSize + kIconGap : 0);
  CGFloat textWidth = MAX(NSWidth(title.frame), NSWidth(detail.frame));
  CGFloat height = detail ? kTwoLineHeight : kOneLineHeight;
  CGFloat width = textX + textWidth + kSwitchGap + NSWidth(control.frame) + kRowPadding;
  NSView *row = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, width, height)];
  row.autoresizingMask = NSViewWidthSizable;

  if (image) {
    NSImageView *view = [NSImageView imageViewWithImage:image];
    view.frame = NSMakeRect(kRowPadding, (height - iconSize) / 2, iconSize, iconSize);
    view.contentTintColor = enabled ? NSColor.labelColor : NSColor.tertiaryLabelColor;
    [row addSubview:view];
  }
  CGFloat block = NSHeight(title.frame) + (detail ? NSHeight(detail.frame) : 0);
  CGFloat bottom = (height - block) / 2;
  if (detail) {
    detail.frame = NSMakeRect(textX, bottom, NSWidth(detail.frame), NSHeight(detail.frame));
    [row addSubview:detail];
  }
  title.frame = NSMakeRect(textX, bottom + (detail ? NSHeight(detail.frame) : 0), NSWidth(title.frame), NSHeight(title.frame));
  [row addSubview:title];
  control.frame = NSMakeRect(width - kRowPadding - NSWidth(control.frame), (height - NSHeight(control.frame)) / 2,
                             NSWidth(control.frame), NSHeight(control.frame));
  control.autoresizingMask = NSViewMinXMargin;
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
  // macOS 27 hides menu item images unless the item asks for them (NSMenuItem.h, preferredImageVisibility). Only an app
  // built with the macOS 27 SDK opts into that: one built with an older SDK (the release runner's Xcode 26) keeps them.
#if defined(MAC_OS_VERSION_27_0) && __MAC_OS_X_VERSION_MAX_ALLOWED >= MAC_OS_VERSION_27_0
  if (@available(macOS 27.0, *)) item.preferredImageVisibility = NSMenuItemImageVisibilityVisible;
#endif
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
