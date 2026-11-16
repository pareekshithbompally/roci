import AppKit
import CoreSpotlight
import Foundation
import ObjectiveC
import UniformTypeIdentifiers

// MARK: - C-compatible JSON bridge for Rust FFI

/// Core Spotlight needs an app bundle; without one every call reports `unsupported`.
private let supported = Bundle.main.bundleURL.pathExtension == "app"

/// `<bundle id>.meetings`: every item lives here, so `remove_all` clears only meetings (only used inside a bundle).
private let domain = "\(Bundle.main.bundleIdentifier ?? "app").meetings"

private typealias OpenCallback = @convention(c) (UnsafePointer<CChar>) -> Void
private typealias RestorationHandler = @convention(block) ([Any]?) -> Void
private typealias ContinueIMP = @convention(c) (AnyObject, Selector, NSApplication, NSUserActivity, @escaping RestorationHandler) -> Bool
private typealias WillContinueIMP = @convention(c) (AnyObject, Selector, NSApplication, String) -> Bool

private let continueSelector = NSSelectorFromString("application:continueUserActivity:restorationHandler:")
private let willContinueSelector = NSSelectorFromString("application:willContinueUserActivityWithType:")

/// Main-thread only.
private var installed = false
private var onOpen: OpenCallback?
private var originalContinue: ContinueIMP?
private var originalWillContinue: WillContinueIMP?

/// Routes Spotlight opens to `callback`, installing the app-delegate hooks once on the main thread.
@_cdecl("core_spotlight_setup")
public func coreSpotlightSetup(_ callback: @escaping @convention(c) (UnsafePointer<CChar>) -> Void) {
    guard supported else { return }
    if Thread.isMainThread {
        install(callback)
    } else {
        DispatchQueue.main.async { install(callback) }
    }
}

@_cdecl("core_spotlight_supported")
public func coreSpotlightSupported() -> Bool {
    supported
}

/// Adds or replaces items by id; blocks its (non-main) caller until Core Spotlight answers.
@_cdecl("core_spotlight_index")
public func coreSpotlightIndex(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["ok": false, "error": "unsupported"]) }
    guard let inputs = decode([ItemInput].self, json) else { return reply(["ok": false, "error": "Invalid items"]) }
    let items = inputs.map(searchableItem)
    return awaitIndex { CSSearchableIndex.default().indexSearchableItems(items, completionHandler: $0) }
}

/// Removes items by id: `["id", ...]`. Blocks its (non-main) caller.
@_cdecl("core_spotlight_remove")
public func coreSpotlightRemove(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["ok": false, "error": "unsupported"]) }
    guard let ids = decode([String].self, json) else { return reply(["ok": false, "error": "Invalid ids"]) }
    return awaitIndex { CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: ids, completionHandler: $0) }
}

/// Removes every item in the meetings domain. Blocks its (non-main) caller.
@_cdecl("core_spotlight_remove_all")
public func coreSpotlightRemoveAll() -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["ok": false, "error": "unsupported"]) }
    return awaitIndex { CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domain], completionHandler: $0) }
}

/// Free a string returned by this bridge.
@_cdecl("core_spotlight_free_string")
public func coreSpotlightFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}

// MARK: - App-delegate hooks

private func install(_ callback: @escaping OpenCallback) {
    guard !installed, let delegate = NSApp.delegate, let cls = object_getClass(delegate) else { return }
    installed = true
    onOpen = callback
    swizzleContinue(cls)
    swizzleWillContinue(cls)
}

/// A Spotlight open goes to Rust; every other activity to the original handler.
private func swizzleContinue(_ cls: AnyClass) {
    guard let method = class_getInstanceMethod(cls, continueSelector) else { return }
    originalContinue = unsafeBitCast(method_getImplementation(method), to: ContinueIMP.self)
    let block: @convention(block) (AnyObject, NSApplication, NSUserActivity, @escaping RestorationHandler) -> Bool = {
        me, app, activity, handler in
        guard activity.activityType == CSSearchableItemActionType else {
            return originalContinue?(me, continueSelector, app, activity, handler) ?? false
        }
        if let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
            id.withCString { onOpen?($0) }
        }
        return true
    }
    method_setImplementation(method, imp_implementationWithBlock(block))
}

/// Accept Spotlight activities; ask the original handler about the rest.
private func swizzleWillContinue(_ cls: AnyClass) {
    guard let method = class_getInstanceMethod(cls, willContinueSelector) else { return }
    originalWillContinue = unsafeBitCast(method_getImplementation(method), to: WillContinueIMP.self)
    let block: @convention(block) (AnyObject, NSApplication, String) -> Bool = { me, app, type in
        guard type != CSSearchableItemActionType else { return true }
        return originalWillContinue?(me, willContinueSelector, app, type) ?? false
    }
    method_setImplementation(method, imp_implementationWithBlock(block))
}

// MARK: - Internal helpers

private struct ItemInput: Decodable {
    let id: String
    let title: String
    let description: String?
    let text: String
    let keywords: [String]
    let createdMs: Int64
}

private func searchableItem(_ input: ItemInput) -> CSSearchableItem {
    let attributes = CSSearchableItemAttributeSet(contentType: .text)
    attributes.title = input.title
    attributes.contentDescription = input.description
    attributes.textContent = input.text
    attributes.keywords = input.keywords
    attributes.contentCreationDate = Date(timeIntervalSince1970: Double(input.createdMs) / 1000)
    let item = CSSearchableItem(uniqueIdentifier: input.id, domainIdentifier: domain, attributeSet: attributes)
    item.expirationDate = .distantFuture
    return item
}

/// Run a Core Spotlight call and block until its completion handler fires.
private func awaitIndex(_ call: (@escaping (Error?) -> Void) -> Void) -> UnsafeMutablePointer<CChar> {
    let done = DispatchSemaphore(value: 0)
    var failure: String?
    call { error in
        failure = error?.localizedDescription
        done.signal()
    }
    done.wait()
    return failure.map { reply(["ok": false, "error": $0]) } ?? reply(["ok": true])
}

private func decode<T: Decodable>(_ type: T.Type, _ json: UnsafePointer<CChar>) -> T? {
    try? JSONDecoder().decode(type, from: Data(String(cString: json).utf8))
}

private func jsonString(_ object: [String: Any]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
    return String(data: data, encoding: .utf8)
}

private func reply(_ object: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let str = jsonString(object) ?? #"{"ok":false,"error":"Encoding failed"}"#
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}
