// A native menu at a point in the key window: section headers, two-line rows (icon, title, grey subtitle) that pick and close,
// switch rows that toggle and keep the menu open (highlighted under the pointer like any row; a leading switch flips the
// others in its menu), and fan-out submenus. Returns what was picked and switched as JSON.

#import <AppKit/AppKit.h>

// Switch-row metrics, in points, matched to AppKit's own menu rows (icon column, title inset, row heights) and to the
// macOS 27 switch the Settings rows show (WebKit's system switch): a 41×18 track with a 24×15 capsule knob.
static const CGFloat kRowPadding = 14;
static const CGFloat kIconGap = 6;
static const CGFloat kSwitchGap = 24;
static const CGFloat kOneLineHeight = 26;
static const CGFloat kTwoLineHeight = 38;
static const CGFloat kSwitchWidth = 41;
static const CGFloat kSwitchHeight = 18;
static const CGFloat kKnobWidth = 24;
static const CGFloat kKnobInset = 1.5;
/// An off switch's track: the label colour, faint (light on a dark menu, dark on a light one), like AppKit's.
static const CGFloat kSwitchOffAlpha = 0.15;
/// On a highlighted row the track is the selected-text colour (white), faint when off and stronger when on.
static const CGFloat kSwitchSelectedOffAlpha = 0.25;
static const CGFloat kSwitchSelectedOnAlpha = 0.5;
/// The row highlight, matched to AppKit's own: inset from the menu's sides, rounded.
static const CGFloat kHighlightInset = 5;
static const CGFloat kHighlightRadius = 5;

/// The system switch's look, drawn: AppKit's NSSwitch draws grey in a menu (a menu is never the key window). On in the
/// app accent, like the kit Switch in Settings. Drawing only: its row takes the clicks.
@interface RociMenuSwitch : NSView
@property(nonatomic) BOOL on;
@property(nonatomic, strong) NSColor *accent;
@property(nonatomic) BOOL enabled;
@property(nonatomic) NSBackgroundStyle backgroundStyle;
@end

@implementation RociMenuSwitch
- (BOOL)isFlipped {
  return NO;
}
- (void)drawRect:(NSRect)dirtyRect {
  NSRect track = NSInsetRect(self.bounds, 0.5, 0.5);
  CGFloat radius = NSHeight(track) / 2;
  CGFloat alpha = self.enabled ? 1 : 0.4;
  NSColor *trackColor = self.backgroundStyle == NSBackgroundStyleEmphasized
    ? [NSColor.selectedMenuItemTextColor colorWithAlphaComponent:self.on ? kSwitchSelectedOnAlpha : kSwitchSelectedOffAlpha]
    : (self.on ? self.accent : [NSColor.labelColor colorWithAlphaComponent:kSwitchOffAlpha]);
  [[trackColor colorWithAlphaComponent:trackColor.alphaComponent * alpha] setFill];
  [[NSBezierPath bezierPathWithRoundedRect:track xRadius:radius yRadius:radius] fill];
  NSRect knob = NSMakeRect(self.on ? NSMaxX(track) - kKnobInset - kKnobWidth : NSMinX(track) + kKnobInset,
                           NSMinY(track) + kKnobInset, kKnobWidth, NSHeight(track) - kKnobInset * 2);
  CGFloat knobRadius = NSHeight(knob) / 2;
  NSShadow *shadow = [NSShadow new];
  shadow.shadowColor = [NSColor colorWithWhite:0 alpha:0.25];
  shadow.shadowBlurRadius = 1;
  shadow.shadowOffset = NSMakeSize(0, -0.5);
  [NSGraphicsContext saveGraphicsState];
  [shadow set];
  [[NSColor.whiteColor colorWithAlphaComponent:alpha] setFill];
  [[NSBezierPath bezierPathWithRoundedRect:knob xRadius:knobRadius yRadius:knobRadius] fill];
  [NSGraphicsContext restoreGraphicsState];
}
- (void)setBackgroundStyle:(NSBackgroundStyle)style {
  _backgroundStyle = style;
  self.needsDisplay = YES;
}
@end

/// A switch row. AppKit leaves a custom-view item to highlight itself, so the row shows the system selection material
/// while the pointer is over it and gives its labels, icon and switch the emphasized background style, as a selected
/// table row does. A click anywhere on it flips the switch; the menu stays open.
@interface RociMenuRow : NSControl
@property(nonatomic, strong) RociMenuSwitch *toggle;
/// Leads the other switch rows in its menu: flipping it flips them; it shows on while any of them is.
@property(nonatomic) BOOL leads;
@property(nonatomic, strong) NSVisualEffectView *highlight;
@end

@implementation RociMenuRow
- (instancetype)initWithFrame:(NSRect)frame {
  self = [super initWithFrame:frame];
  _highlight = [[NSVisualEffectView alloc] initWithFrame:NSInsetRect(self.bounds, kHighlightInset, 0)];
  _highlight.material = NSVisualEffectMaterialSelection;
  _highlight.state = NSVisualEffectStateActive;
  _highlight.emphasized = YES;
  _highlight.wantsLayer = YES;
  _highlight.layer.cornerRadius = kHighlightRadius;
  _highlight.autoresizingMask = NSViewWidthSizable;
  _highlight.hidden = YES;
  [self addSubview:_highlight];
  NSTrackingAreaOptions options = NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect;
  [self addTrackingArea:[[NSTrackingArea alloc] initWithRect:NSZeroRect options:options owner:self userInfo:nil]];
  return self;
}
- (void)setHighlighted:(BOOL)highlighted {
  self.highlight.hidden = !highlighted;
  NSBackgroundStyle style = highlighted ? NSBackgroundStyleEmphasized : NSBackgroundStyleNormal;
  for (NSView *view in self.subviews) {
    if ([view isKindOfClass:[NSControl class]]) ((NSControl *)view).cell.backgroundStyle = style;
  }
  self.toggle.backgroundStyle = style;
}
- (void)mouseEntered:(NSEvent *)event {
  if (self.enabled) self.highlighted = YES;
}
- (void)mouseExited:(NSEvent *)event {
  self.highlighted = NO;
}
- (void)mouseDown:(NSEvent *)event {
  if (!self.enabled) return;
  [self setOn:!self.toggle.on];
  [self sendAction:self.action to:self.target];
}
- (void)setOn:(BOOL)on {
  self.toggle.on = on;
  self.toggle.needsDisplay = YES;
}
@end

/// The other switch rows in `row`'s menu.
static NSArray<RociMenuRow *> *rociSiblingRows(RociMenuRow *row) {
  NSMutableArray<RociMenuRow *> *rows = [NSMutableArray array];
  for (NSMenuItem *item in row.enclosingMenuItem.menu.itemArray) {
    if ([item.view isKindOfClass:[RociMenuRow class]] && item.view != row) [rows addObject:(RociMenuRow *)item.view];
  }
  return rows;
}

/// One open menu's shared state: what its rows report back, and the accent its switches turn on in.
@interface RociMenuTarget : NSObject
@property(nonatomic, strong) NSColor *accent;
@property(nonatomic, copy) NSString *chosen;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *toggled;
- (void)pick:(NSMenuItem *)item;
- (void)flip:(RociMenuRow *)row;
@end

@implementation RociMenuTarget
- (void)pick:(NSMenuItem *)item {
  self.chosen = item.representedObject;
}
/// A flipped switch is reported; a leading one is not, only the rows it flipped, so the result never contradicts them.
- (void)flip:(RociMenuRow *)row {
  NSArray<RociMenuRow *> *siblings = rociSiblingRows(row);
  if (row.leads) {
    for (RociMenuRow *sibling in siblings) {
      if (!sibling.enabled || sibling.toggle.on == row.toggle.on) continue;
      [sibling setOn:row.toggle.on];
      self.toggled[sibling.identifier] = @(row.toggle.on);
    }
    return;
  }
  self.toggled[row.identifier] = @(row.toggle.on);
  [self followLeader:[siblings arrayByAddingObject:row]];
}
/// The leading switch among `rows`, if any, shows on while any other row is on.
- (void)followLeader:(NSArray<RociMenuRow *> *)rows {
  RociMenuRow *leader = nil;
  BOOL anyOn = NO;
  for (RociMenuRow *row in rows) {
    if (row.leads) leader = row;
    else anyOn = anyOn || row.toggle.on;
  }
  [leader setOn:anyOn];
}
@end

/// An image from base64 PNG (`icon`) or an SF Symbol name (`symbol`), at the menu's icon size; nil when neither is given.
/// SF Symbols and `template` glyphs (monochrome app icons) are tinted by AppKit to match the menu's light or dark appearance.
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
  image.template = image.template || [entry[@"template"] boolValue];
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

/// A switch row: icon, title over a grey subtitle, a switch pinned to the trailing edge; clicking the row keeps the menu open.
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
  control.accent = target.accent;

  CGFloat textX = kRowPadding + (image ? iconSize + kIconGap : 0);
  CGFloat textWidth = MAX(NSWidth(title.frame), NSWidth(detail.frame));
  CGFloat height = detail ? kTwoLineHeight : kOneLineHeight;
  CGFloat width = textX + textWidth + kSwitchGap + NSWidth(control.frame) + kRowPadding;
  RociMenuRow *row = [[RociMenuRow alloc] initWithFrame:NSMakeRect(0, 0, width, height)];
  row.autoresizingMask = NSViewWidthSizable;
  row.enabled = enabled;
  row.identifier = entry[@"id"];
  row.target = target;
  row.action = @selector(flip:);
  row.toggle = control;
  row.leads = [entry[@"leads"] boolValue];

  if (image) {
    NSImageView *view = [NSImageView imageViewWithImage:image];
    view.frame = NSMakeRect(kRowPadding, (height - iconSize) / 2, iconSize, iconSize);
    if (!enabled) view.contentTintColor = NSColor.tertiaryLabelColor;
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

/// Shows the menu with its top-left at (x, y) in the key window's content (top-left origin, points), switches on in the app
/// accent (sRGB 0–1); blocks until it closes. Returns `{"chosen": id | null, "toggled": {id: bool}}` as a C string freed with `roci_menu_free_string`. Main thread only.
char *roci_menu(const char *json, double x, double y, double iconSize, double red, double green, double blue) {
  NSData *data = [NSData dataWithBytes:json length:strlen(json)];
  NSArray *entries = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  NSView *view = NSApp.keyWindow.contentView;
  RociMenuTarget *target = [RociMenuTarget new];
  target.toggled = [NSMutableDictionary dictionary];
  target.accent = [NSColor colorWithSRGBRed:red green:green blue:blue alpha:1];
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
