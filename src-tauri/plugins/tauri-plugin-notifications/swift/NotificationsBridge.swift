import Foundation
import UserNotifications

// MARK: - C-compatible JSON bridge for Rust FFI

/// `UNUserNotificationCenter` crashes without an app bundle; report `unsupported` instead.
private let supported = Bundle.main.bundleURL.pathExtension == "app"

private typealias ResponseCallback = @convention(c) (UnsafePointer<CChar>) -> Void

private final class Delegate: NSObject, UNUserNotificationCenterDelegate {
    var onResponse: ResponseCallback?

    /// Shown while Roci is in front too: the app only posts what must be seen.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let content = response.notification.request.content
        let payload: [String: Any] = [
            "id": response.notification.request.identifier,
            "action": actionName(response.actionIdentifier),
            "userInfo": content.userInfo.reduce(into: [String: String]()) { info, entry in
                if let key = entry.key as? String, let value = entry.value as? String { info[key] = value }
            },
        ]
        if let onResponse, let json = jsonString(payload) {
            json.withCString { onResponse($0) }
        }
        completionHandler()
    }
}

private let delegate = Delegate()

/// Installs the delegate early, so a response that wakes the app is not lost, and the callback to Rust.
@_cdecl("notifications_setup")
public func notificationsSetup(_ callback: @escaping @convention(c) (UnsafePointer<CChar>) -> Void) {
    guard supported else { return }
    delegate.onResponse = callback
    UNUserNotificationCenter.current().delegate = delegate
}

/// `{"status": "authorized" | "denied" | "not_determined" | "unsupported"}`
@_cdecl("notifications_status")
public func notificationsStatus() -> UnsafeMutablePointer<CChar> {
    reply(["status": currentStatus()])
}

/// Raises the macOS prompt when undecided; blocks its (non-main) caller until the user answers.
@_cdecl("notifications_request")
public func notificationsRequest() -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["status": "unsupported"]) }
    let done = DispatchSemaphore(value: 0)
    var failure: Error?
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, error in
        failure = error
        done.signal()
    }
    done.wait()
    var result: [String: Any] = ["status": currentStatus()]
    if let failure { result["error"] = String(describing: failure) }
    return reply(result)
}

/// Registers action categories: `[{"id","actions":[{"id","title"}]}]`.
@_cdecl("notifications_set_categories")
public func notificationsSetCategories(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["ok": false, "error": "unsupported"]) }
    guard let specs = decode([CategorySpec].self, json) else { return reply(["ok": false, "error": "Invalid categories"]) }
    let categories = specs.map { spec in
        UNNotificationCategory(
            identifier: spec.id,
            actions: spec.actions.map { UNNotificationAction(identifier: $0.id, title: $0.title, options: []) },
            intentIdentifiers: [],
            options: []
        )
    }
    UNUserNotificationCenter.current().setNotificationCategories(Set(categories))
    return reply(["ok": true])
}

/// Shows a notification now, or hands it to macOS for `atMs` (epoch ms); reusing an id replaces the earlier one.
@_cdecl("notifications_show")
public func notificationsShow(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["ok": false, "error": "unsupported"]) }
    guard let input = decode(ShowInput.self, json) else { return reply(["ok": false, "error": "Invalid notification"]) }
    let content = UNMutableNotificationContent()
    content.title = input.title
    content.body = input.body
    content.sound = .default
    content.categoryIdentifier = input.category ?? ""
    content.userInfo = input.userInfo ?? [:]

    let done = DispatchSemaphore(value: 0)
    var failure: String?
    let request = UNNotificationRequest(identifier: input.id, content: content, trigger: trigger(atMs: input.atMs))
    UNUserNotificationCenter.current().add(request) { error in
        failure = error?.localizedDescription
        done.signal()
    }
    done.wait()
    return failure.map { reply(["ok": false, "error": $0]) } ?? reply(["ok": true])
}

/// Withdraws notifications by id, shown or not yet shown: `["id", ...]`.
@_cdecl("notifications_remove")
public func notificationsRemove(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["ok": false, "error": "unsupported"]) }
    guard let ids = decode([String].self, json) else { return reply(["ok": false, "error": "Invalid ids"]) }
    let center = UNUserNotificationCenter.current()
    center.removeDeliveredNotifications(withIdentifiers: ids)
    center.removePendingNotificationRequests(withIdentifiers: ids)
    return reply(["ok": true])
}

/// Withdraws every notice still waiting with the system whose id starts with the prefix (`"meeting:"`), queued by an earlier run.
@_cdecl("notifications_remove_pending_prefix")
public func notificationsRemovePendingPrefix(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard supported else { return reply(["ok": false, "error": "unsupported"]) }
    guard let start = decode(String.self, json) else { return reply(["ok": false, "error": "Invalid prefix"]) }
    let center = UNUserNotificationCenter.current()
    // Waits, like `notifications_show`, so nothing queued right after can be caught by this removal.
    let done = DispatchSemaphore(value: 0)
    center.getPendingNotificationRequests { requests in
        center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier).filter { $0.hasPrefix(start) })
        done.signal()
    }
    done.wait()
    return reply(["ok": true])
}

/// Free a string returned by this bridge.
@_cdecl("notifications_free_string")
public func notificationsFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}

// MARK: - Internal helpers

private struct CategorySpec: Decodable {
    struct Action: Decodable {
        let id: String
        let title: String
    }
    let id: String
    let actions: [Action]
}

private struct ShowInput: Decodable {
    let id: String
    let title: String
    let body: String
    let category: String?
    let userInfo: [String: String]?
    let atMs: Double?
}

/// macOS delivers at that absolute moment (the components carry the time zone), through sleep and clock changes;
/// none, past, or under a second away (the trigger has whole seconds) shows now.
private func trigger(atMs: Double?) -> UNNotificationTrigger? {
    guard let atMs else { return nil }
    let date = Date(timeIntervalSince1970: atMs / 1000)
    guard date.timeIntervalSinceNow >= 1 else { return nil }
    let parts = Calendar.current.dateComponents([.timeZone, .year, .month, .day, .hour, .minute, .second], from: date)
    return UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
}

private func currentStatus() -> String {
    guard supported else { return "unsupported" }
    let done = DispatchSemaphore(value: 0)
    var status = UNAuthorizationStatus.notDetermined
    UNUserNotificationCenter.current().getNotificationSettings { settings in
        status = settings.authorizationStatus
        done.signal()
    }
    done.wait()
    switch status {
    case .authorized, .provisional: return "authorized"
    case .denied: return "denied"
    default: return "not_determined"
    }
}

private func actionName(_ identifier: String) -> String {
    switch identifier {
    case UNNotificationDefaultActionIdentifier: return "open"
    case UNNotificationDismissActionIdentifier: return "dismiss"
    default: return identifier
    }
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
