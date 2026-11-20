import Foundation
import EventKit

// MARK: - The app's one EventKit store, shared by the calendar and reminders bridges

/// One store for the app's lifetime (Apple: a store is slow to create and holds a calendar-daemon connection).
let eventStore = EKEventStore()
/// Every read and write of `eventStore` runs here, off the main thread and one at a time.
let eventStoreQueue = DispatchQueue(label: "\(Bundle.main.bundleIdentifier ?? "app").eventkit")

/// Entity types granted in this run, touched only on `eventStoreQueue`: the status read can lag a grant until relaunch.
private var grantedThisRun: Set<UInt> = []

/// Asks for full access (macOS prompts only while undecided). `{"granted": bool, "error"?}`
/// Apple: a store made before the grant is reset to read with it. The answer is the truth, so it is remembered.
func requestEventKitAccess(_ type: EKEntityType) -> [String: Any] {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    var errorMsg: String?
    let done: EKEventStoreRequestAccessCompletionHandler = { success, error in
        granted = success
        errorMsg = error?.localizedDescription
        semaphore.signal()
    }
    if type == .event {
        eventStore.requestFullAccessToEvents(completion: done)
    } else {
        eventStore.requestFullAccessToReminders(completion: done)
    }
    semaphore.wait()
    if granted {
        eventStoreQueue.sync {
            grantedThisRun.insert(type.rawValue)
            eventStore.reset()
        }
    }
    var result: [String: Any] = ["granted": granted]
    if let errorMsg { result["error"] = errorMsg }
    return result
}

/// `{"status": "authorized" | "denied" | "not_determined" | "restricted"}`, without prompting.
func eventKitAccessStatus(_ type: EKEntityType) -> [String: Any] {
    let grantedHere = eventStoreQueue.sync { grantedThisRun.contains(type.rawValue) }
    return ["status": statusName(EKEventStore.authorizationStatus(for: type), grantedHere: grantedHere)]
}

/// An answered prompt never becomes undecided again, so a lagging `notDetermined` after a grant reads as granted.
private func statusName(_ status: EKAuthorizationStatus, grantedHere: Bool) -> String {
    switch status {
    case .fullAccess: return "authorized"
    case .notDetermined: return grantedHere ? "authorized" : "not_determined"
    case .writeOnly, .denied: return "denied"
    case .restricted: return "restricted"
    @unknown default: return "not_determined"
    }
}

/// Asks the store to pull remote accounts (iCloud, Exchange, Google) if stale; `EKEventStoreChanged` follows new data.
func refreshEventSources() {
    eventStoreQueue.async { eventStore.refreshSourcesIfNecessary() }
}

/// A JSON C string for Rust, freed with `calendar_free_string`.
func jsonPointer(_ dict: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = (try? JSONSerialization.data(withJSONObject: dict, options: [])) ?? Data("{}".utf8)
    let str = String(decoding: data, as: UTF8.self)
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}
