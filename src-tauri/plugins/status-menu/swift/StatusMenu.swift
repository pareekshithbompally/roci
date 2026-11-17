// Roci's menu bar menu: Swift owns the status item and its native NSMenu; Rust drives it over a C bridge.
// Contract (mirrors the calendar bridge): replies are `{"ok":bool,"error":?}` C strings freed with `status_menu_free_string`;
// picked items go back to Rust as action ids through the callback given to `status_menu_install`.
// Rust owns every row and its words (`src-tauri/src/menubar/menu.rs`); this file only turns them into menu items.

import AppKit

/// The C callback Rust registers: one action id per picked item.
typealias ActionCallback = @convention(c) (UnsafePointer<CChar>) -> Void

// ── Contract (decoded from `menubar::MenuState`) ──

enum StatusLevel: String, Decodable {
    case available, starting, unavailable

    var color: NSColor {
        switch self {
        case .available: return .systemGreen
        case .starting: return .systemYellow
        case .unavailable: return .systemRed
        }
    }
}

struct MenuRow: Decodable {
    let label: String
    var action: String? = nil
    /// The key that, with ⌘, picks this row.
    var shortcut: String? = nil
    var dot: StatusLevel? = nil
    /// An image file shown before the label.
    var icon: String? = nil
    var checked: Bool = false
    /// Shown as this row's submenu.
    var children: [MenuRow] = []

    enum CodingKeys: String, CodingKey { case label, action, shortcut, dot, icon, checked, children }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        label = try c.decode(String.self, forKey: .label)
        action = try c.decodeIfPresent(String.self, forKey: .action)
        shortcut = try c.decodeIfPresent(String.self, forKey: .shortcut)
        dot = try c.decodeIfPresent(StatusLevel.self, forKey: .dot)
        icon = try c.decodeIfPresent(String.self, forKey: .icon)
        checked = try c.decodeIfPresent(Bool.self, forKey: .checked) ?? false
        children = try c.decodeIfPresent([MenuRow].self, forKey: .children) ?? []
    }
}

struct MenuState: Decodable {
    let visible: Bool
    let tooltip: String
    let icon: String
    let recording: Bool
    let sections: [[MenuRow]]
}

enum MenuMetrics {
    /// The status item image's height, as the menu bar draws template icons.
    static let statusIconHeight: CGFloat = 18
    static let dotSize: CGFloat = 8
    static let iconSize: CGFloat = 16
    /// The recording dot's size against the status icon's height, and the clear ring around it.
    static let recordingDotRatio: CGFloat = 0.34
    static let recordingDotGap: CGFloat = 1.5
    /// Space between a row's dot or icon and its label.
    static let imageGap: CGFloat = 6
}

// ── Menu ──

/// The status item and its menu for the app's lifetime. Items are updated in place, so a menu that is open
/// while the state changes (the recording timer, a download) keeps its highlight and the user's click.
final class StatusMenu: NSObject, NSMenuDelegate {
    static var shared: StatusMenu?
    /// Sent through the action callback as the menu opens, so rows that age (the next meeting's minutes) are fresh.
    /// Mirrors `menubar::item::MENU_OPENED`.
    static let openedAction = "menu_opened"

    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let menu = StatusMenu.makeMenu()
    private let callback: ActionCallback
    private var iconPath = ""
    private var iconRecording = false
    /// Row images (dots by level, icons by path), made once.
    private var images: [String: NSImage] = [:]

    init(callback: @escaping ActionCallback) {
        self.callback = callback
        super.init()
        menu.delegate = self
        item.menu = menu
    }

    func menuWillOpen(_ menu: NSMenu) {
        StatusMenu.openedAction.withCString { callback($0) }
    }

    /// Items are enabled by the rows (picked rows and submenus), not by AppKit's responder-chain validation.
    private static func makeMenu() -> NSMenu {
        let menu = NSMenu()
        menu.autoenablesItems = false
        return menu
    }

    func apply(_ state: MenuState) {
        sync(menu, state.sections)
        item.isVisible = state.visible
        item.button?.toolTip = state.tooltip
        setIcon(state.icon, recording: state.recording)
    }

    @objc private func pick(_ sender: NSMenuItem) {
        guard let action = sender.representedObject as? String else { return }
        action.withCString { callback($0) }
    }

    // ── Items ──

    /// Make `menu` show `sections`, separated, reusing the items already there.
    private func sync(_ menu: NSMenu, _ sections: [[MenuRow]]) {
        let entries: [MenuRow?] = sections.enumerated().flatMap { index, rows in (index > 0 ? [nil] : []) + rows.map(Optional.some) }
        for (index, row) in entries.enumerated() {
            let item = reusableItem(in: menu, at: index, separator: row == nil)
            if let row { configure(item, row) }
        }
        while menu.numberOfItems > entries.count { menu.removeItem(at: menu.numberOfItems - 1) }
    }

    /// The item at `index` when it is the right kind (separator or row), else a new one put in its place.
    private func reusableItem(in menu: NSMenu, at index: Int, separator: Bool) -> NSMenuItem {
        if index < menu.numberOfItems, menu.items[index].isSeparatorItem == separator { return menu.items[index] }
        if index < menu.numberOfItems { menu.removeItem(at: index) }
        let item = separator ? NSMenuItem.separator() : NSMenuItem()
        menu.insertItem(item, at: index)
        return item
    }

    private func configure(_ item: NSMenuItem, _ row: MenuRow) {
        if item.title != row.label { item.title = row.label }
        item.isEnabled = row.action != nil || !row.children.isEmpty
        item.attributedTitle = image(for: row).map { titled(row.label, after: $0, enabled: item.isEnabled) }
        item.state = row.checked ? .on : .off
        item.keyEquivalent = row.shortcut ?? ""
        item.keyEquivalentModifierMask = .command
        item.representedObject = row.action
        item.target = row.action == nil ? nil : self
        item.action = row.action == nil ? nil : #selector(pick(_:))
        setSubmenu(of: item, row.children)
    }

    private func setSubmenu(of item: NSMenuItem, _ rows: [MenuRow]) {
        guard !rows.isEmpty else {
            item.submenu = nil
            return
        }
        let submenu = item.submenu ?? StatusMenu.makeMenu()
        sync(submenu, [rows])
        if item.submenu !== submenu { item.submenu = submenu }
    }

    // ── Images ──

    /// macOS decides whether menu item images show (it can hide them system-wide), so a row's dot or icon
    /// is drawn as part of its title instead: it always shows, and the item stays a plain native item.
    private func titled(_ label: String, after image: NSImage, enabled: Bool) -> NSAttributedString {
        let font = NSFont.menuFont(ofSize: 0)
        let attachment = NSTextAttachment()
        attachment.image = image
        attachment.bounds = NSRect(x: 0, y: (font.capHeight - image.size.height) / 2, width: image.size.width, height: image.size.height)
        let title = NSMutableAttributedString(attachment: attachment)
        // A styled title draws in the enabled colour unless told otherwise.
        var attributes: [NSAttributedString.Key: Any] = [.font: font]
        if !enabled { attributes[.foregroundColor] = NSColor.disabledControlTextColor }
        title.append(NSAttributedString(string: label, attributes: attributes))
        return title
    }

    private func image(for row: MenuRow) -> NSImage? {
        if let dot = row.dot { return cachedImage(dot.rawValue) { StatusMenu.dot(dot.color) } }
        if let path = row.icon { return cachedImage(path) { StatusMenu.icon(path) } }
        return nil
    }

    /// The row image under `key`, made once, with the gap before the label built in (menu titles ignore kerning).
    private func cachedImage(_ key: String, make: () -> NSImage?) -> NSImage? {
        if let image = images[key] { return image }
        let image = make().map(StatusMenu.withTrailingGap)
        images[key] = image
        return image
    }

    private static func withTrailingGap(_ image: NSImage) -> NSImage {
        let size = NSSize(width: image.size.width + MenuMetrics.imageGap, height: image.size.height)
        return NSImage(size: size, flipped: false) { _ in
            image.draw(in: NSRect(origin: .zero, size: image.size))
            return true
        }
    }

    private static func dot(_ color: NSColor) -> NSImage {
        let size = NSSize(width: MenuMetrics.dotSize, height: MenuMetrics.dotSize)
        return NSImage(size: size, flipped: false) { rect in
            color.setFill()
            NSBezierPath(ovalIn: rect).fill()
            return true
        }
    }

    private static func icon(_ path: String) -> NSImage? {
        guard let image = NSImage(contentsOfFile: path) else { return nil }
        image.size = NSSize(width: MenuMetrics.iconSize, height: MenuMetrics.iconSize)
        return image
    }

    /// The status item image, 18 pt tall with its aspect kept: the template, or while recording the same mark with a red
    /// dot at its lower right; rebuilt only when the file or the recording state changes.
    private func setIcon(_ path: String, recording: Bool) {
        guard path != iconPath || recording != iconRecording,
              let image = NSImage(contentsOfFile: path), image.size.height > 0 else { return }
        iconPath = path
        iconRecording = recording
        let height = MenuMetrics.statusIconHeight
        image.size = NSSize(width: image.size.width * height / image.size.height, height: height)
        image.isTemplate = true
        item.button?.image = recording ? Self.withRecordingDot(image) : image
    }

    /// The template drawn in the menu bar's own text colour (resolved at draw time, so light and dark bars both work),
    /// with a red dot cut clear of it at the lower right.
    private static func withRecordingDot(_ template: NSImage) -> NSImage {
        let size = template.size
        let image = NSImage(size: size, flipped: false) { rect in
            template.draw(in: rect)
            NSColor.labelColor.setFill()
            rect.fill(using: .sourceAtop)
            let diameter = (size.height * MenuMetrics.recordingDotRatio).rounded()
            let dot = NSRect(x: rect.maxX - diameter, y: rect.minY, width: diameter, height: diameter)
            let context = NSGraphicsContext.current
            context?.compositingOperation = .clear
            NSBezierPath(ovalIn: dot.insetBy(dx: -MenuMetrics.recordingDotGap, dy: -MenuMetrics.recordingDotGap)).fill()
            context?.compositingOperation = .sourceOver
            NSColor.systemRed.setFill()
            NSBezierPath(ovalIn: dot).fill()
            return true
        }
        image.isTemplate = false
        return image
    }
}

// ── C bridge ──

private func reply(_ error: String? = nil) -> UnsafeMutablePointer<CChar> {
    let object: [String: Any] = error.map { ["ok": false, "error": $0] } ?? ["ok": true]
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{\"ok\":false}".utf8)
    return strdup(String(decoding: data, as: UTF8.self))!
}

@_cdecl("status_menu_install")
public func statusMenuInstall(_ callback: @escaping @convention(c) (UnsafePointer<CChar>) -> Void) -> UnsafeMutablePointer<CChar> {
    let install = { if StatusMenu.shared == nil { StatusMenu.shared = StatusMenu(callback: callback) } }
    if Thread.isMainThread { install() } else { DispatchQueue.main.sync(execute: install) }
    return reply()
}

/// Decodes the state now (so a bad payload is reported) and applies it on the main queue, in the order received.
/// The main queue also runs while the menu is open, so an open menu updates live.
@_cdecl("status_menu_update")
public func statusMenuUpdate(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let data = Data(String(cString: json).utf8)
    do {
        let state = try JSONDecoder().decode(MenuState.self, from: data)
        DispatchQueue.main.async { StatusMenu.shared?.apply(state) }
        return reply()
    } catch {
        return reply("could not read the menu state: \(error)")
    }
}

@_cdecl("status_menu_free_string")
public func statusMenuFreeString(_ pointer: UnsafeMutablePointer<CChar>) {
    free(pointer)
}
