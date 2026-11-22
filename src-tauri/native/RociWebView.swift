// iOS / iPadOS: the app's web view behaves like a native screen around the keyboard.
// - The page never scrolls as a whole (screens scroll inside it), so the top bar stays put, even when a field takes focus.
// - The web view sits above the keyboard (resized with it, on the keyboard's own curve), so the composer rides on it.
// - No form toolbar (˄ ˅ ✓) above the keyboard: a chat field has nothing to step between.
// - The area behind the web view takes the page colour, so no black strip shows as the keyboard moves.

import UIKit
import WebKit
import ObjectiveC

/// Resizes the web view to the area above the keyboard as the keyboard moves, and keeps the page itself from scrolling:
/// WebKit scrolls a focused field into view on its own, which fought the resize and bounced the whole screen.
private final class KeyboardFollower: NSObject {
    private weak var webView: WKWebView?
    private var offsetLock: NSKeyValueObservation?

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        // Screens scroll inside the page, never the page: any offset WebKit sets is put back before it is drawn.
        offsetLock = webView.scrollView.observe(\.contentOffset, options: [.new]) { scrollView, _ in
            if scrollView.contentOffset != .zero { scrollView.contentOffset = .zero }
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
        let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        let curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? 7
        // The live page colour (follows light/dark), so nothing black shows below or around the keyboard.
        container.backgroundColor = webView.underPageBackgroundColor
        UIView.animate(withDuration: duration, delay: 0, options: UIView.AnimationOptions(rawValue: curve << 16)) {
            webView.frame = CGRect(x: 0, y: 0, width: container.bounds.width, height: container.bounds.height - covered)
        }
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
