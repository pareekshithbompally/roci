// iOS / iPadOS: the app's web view behaves like a native screen around the keyboard.
// - The page never scrolls as a whole (screens scroll inside it), so the top bar stays put, even when a field takes focus.
// - The keyboard floats over the page, as over a native screen: the web view keeps the whole screen (its content shows
//   beside the keyboard's rounded corners) and the page is told the keyboard's height (`--keyboard-inset`), so the
//   composer and sheets lift above it on the app's own spring.
// - No form toolbar (˄ ˅ ✓) above the keyboard: a chat field has nothing to step between.
// - The area behind the web view, and the window, take the page colour from launch and on every light/dark change, so
//   nothing black shows beside the keyboard's rounded corners or as it moves.

import UIKit
import WebKit
import ObjectiveC

/// Tells the page how much of the screen the keyboard covers as it moves, and keeps the page itself from scrolling: WebKit
/// scrolls a focused field into view on its own, which would bounce the whole screen.
private final class KeyboardFollower: NSObject {
    private weak var webView: WKWebView?
    private var offsetLock: NSKeyValueObservation?
    private var pageColour: NSKeyValueObservation?

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        // Screens scroll inside the page, never the page: any offset WebKit sets is put back before it is drawn.
        offsetLock = webView.scrollView.observe(\.contentOffset, options: [.new]) { scrollView, _ in
            if scrollView.contentOffset != .zero { scrollView.contentOffset = .zero }
        }
        // WebKit's page colour (the page's background; it follows light/dark) paints what is behind the web view.
        pageColour = webView.observe(\.underPageBackgroundColor, options: [.initial, .new]) { webView, _ in
            Self.paintBehind(webView)
        }
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillChange(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillChange(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillChange(_ note: Notification) {
        guard let webView, let container = webView.superview, let info = note.userInfo else { return }
        let hiding = note.name == UIResponder.keyboardWillHideNotification
        let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect) ?? .zero
        let keyboard = container.convert(end, from: nil)
        let covered = hiding ? 0 : max(0, container.bounds.maxY - keyboard.minY)
        Self.paintBehind(webView)
        let script = "document.documentElement.style.setProperty('--keyboard-inset','\(Int(covered.rounded()))px');"
        webView.evaluateJavaScript(script) { _, error in
            if let error { NSLog("[RociWebView] keyboard inset failed: %@", error.localizedDescription) }
        }
    }
}

extension KeyboardFollower {
    /// The web view's container and window in the page colour (the web view may not be in a window yet at launch; the
    /// next colour change or keyboard move paints it).
    static func paintBehind(_ webView: WKWebView) {
        let colour = webView.underPageBackgroundColor
        webView.superview?.backgroundColor = colour
        webView.window?.backgroundColor = colour
    }
}

/// Followers live as long as the app (one web view).
private var followers: [KeyboardFollower] = []

/// Gives this web view's content view a subclass whose `inputAccessoryView` is nil (only this instance changes).
private func hideFormAccessoryBar(_ webView: WKWebView) {
    guard let content = webView.scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else { return }
    let base: AnyClass = type(of: content)
    let name = "\(NSStringFromClass(base))_RociNoAccessory"
    var subclass: AnyClass? = NSClassFromString(name)
    if subclass == nil, let made = objc_allocateClassPair(base, name, 0) {
        let none: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        class_addMethod(made, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(none), "@@:")
        objc_registerClassPair(made)
        subclass = made
    }
    if let subclass { object_setClass(content, subclass) }
}

/// Called once from Rust (`mobile::setup`) with the main window's WKWebView.
@_cdecl("roci_webview_configure")
public func rociWebViewConfigure(_ pointer: UnsafeMutableRawPointer) {
    let webView = Unmanaged<WKWebView>.fromOpaque(pointer).takeUnretainedValue()
    webView.scrollView.isScrollEnabled = false
    webView.scrollView.bounces = false
    // The page lays out its own safe areas (env(safe-area-inset-*)); UIKit adds no insets for them or the keyboard.
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    hideFormAccessoryBar(webView)
    followers.append(KeyboardFollower(webView: webView))
}
