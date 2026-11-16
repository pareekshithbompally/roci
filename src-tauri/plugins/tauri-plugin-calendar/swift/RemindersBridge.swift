import Foundation
import EventKit

// MARK: - Reminders (EventKit) — JSON C-string bridge; each reminder's URL `roci://todo/<id>` links it to its to-do

private let store = EKEventStore()
/// Labelled `<bundle id>.reminders`; bare dev binaries have no bundle id.
private let queue = DispatchQueue(label: "\(Bundle.main.bundleIdentifier ?? "app").reminders")
private let todoScheme = "roci://todo/"

/// Request full access to reminders. `{"granted": bool, "error"?: string}`
@_cdecl("reminders_request_access")
public func remindersRequestAccess() -> UnsafeMutablePointer<CChar> {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    var errorMsg: String?
    let done: (Bool, Error?) -> Void = { success, error in
        granted = success
        errorMsg = error?.localizedDescription
        semaphore.signal()
    }
    store.requestFullAccessToReminders(completion: done)
    semaphore.wait()
    var result: [String: Any] = ["granted": granted]
    if let errorMsg { result["error"] = errorMsg }
    return remindersJSON(result)
}

/// Current authorization. `{"status": "authorized" | "denied" | "not_determined" | "restricted"}`
@_cdecl("reminders_check_access")
public func remindersCheckAccess() -> UnsafeMutablePointer<CChar> {
    let status: String
    switch EKEventStore.authorizationStatus(for: .reminder) {
    case .fullAccess: status = "authorized"
    case .writeOnly, .denied: status = "denied"
    case .restricted: status = "restricted"
    case .notDetermined: status = "not_determined"
    @unknown default: status = "not_determined"
    }
    return remindersJSON(["status": status])
}

/// Every reminders list. `{"lists": [{"id", "title"}]}`
@_cdecl("reminders_lists")
public func remindersLists() -> UnsafeMutablePointer<CChar> {
    let lists = queue.sync {
        store.calendars(for: .reminder).map { ["id": $0.calendarIdentifier, "title": $0.title] }
    }
    return remindersJSON(["lists": lists])
}

/// The list titled `title`, created in the default reminders account when missing. `{"id"}` or `{"error"}`
@_cdecl("reminders_ensure_list")
public func remindersEnsureList(_ title: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let name = String(cString: title)
    return remindersJSON(queue.sync { () -> [String: Any] in
        if let existing = store.calendars(for: .reminder).first(where: { $0.title == name }) {
            return ["id": existing.calendarIdentifier]
        }
        guard let source = store.defaultCalendarForNewReminders()?.source else {
            return ["error": "No reminders account on this Mac"]
        }
        let list = EKCalendar(for: .reminder, eventStore: store)
        list.title = name
        list.source = source
        do {
            try store.saveCalendar(list, commit: true)
            return ["id": list.calendarIdentifier]
        } catch {
            return ["error": error.localizedDescription]
        }
    })
}

/// Updates a to-do's reminder; creates it only when `create`, so one deleted in Reminders never returns on edit.
@_cdecl("reminders_upsert")
public func remindersUpsert(_ input: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard let data = String(cString: input).data(using: .utf8),
          let item = try? JSONDecoder().decode(ReminderInput.self, from: data) else {
        return remindersJSON(["error": "Invalid reminder input"])
    }
    return remindersJSON(queue.sync { () -> [String: Any] in
        guard let list = store.calendar(withIdentifier: item.list_id) else {
            return ["error": "Reminders list not found"]
        }
        let existing = tagged(in: list)[item.todo_id]
        if existing == nil && !item.create { return [:] }
        let reminder = existing ?? EKReminder(eventStore: store)
        reminder.calendar = list
        reminder.title = item.title
        reminder.notes = item.notes
        reminder.url = URL(string: todoScheme + item.todo_id)
        reminder.dueDateComponents = item.due_date.flatMap(dayComponents)
        reminder.isCompleted = item.completed
        do {
            try store.save(reminder, commit: true)
            return [:]
        } catch {
            return ["error": error.localizedDescription]
        }
    })
}

/// Completion of every Roci-tagged reminder in a list. `{"items": [{"todo_id", "completed"}]}` or `{"error"}`
@_cdecl("reminders_states")
public func remindersStates(_ listId: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let id = String(cString: listId)
    return remindersJSON(queue.sync { () -> [String: Any] in
        guard let list = store.calendar(withIdentifier: id) else { return ["error": "Reminders list not found"] }
        let items = tagged(in: list).map { ["todo_id": $0.key, "completed": $0.value.isCompleted] }
        return ["items": items]
    })
}

/// Calls `callback` whenever the reminders database changes (any app). Register once.
@_cdecl("reminders_observe_changes")
public func remindersObserveChanges(_ callback: @escaping @convention(c) () -> Void) {
    NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: nil) { _ in
        callback()
    }
}

// MARK: - Internal helpers

private struct ReminderInput: Decodable {
    let list_id: String
    let todo_id: String
    let title: String
    let notes: String?
    let due_date: String?
    let completed: Bool
    let create: Bool
}

/// Roci-tagged reminders in `list`, keyed by to-do id. Runs on `queue`.
private func tagged(in list: EKCalendar) -> [String: EKReminder] {
    let semaphore = DispatchSemaphore(value: 0)
    var found: [EKReminder] = []
    store.fetchReminders(matching: store.predicateForReminders(in: [list])) { reminders in
        found = reminders ?? []
        semaphore.signal()
    }
    semaphore.wait()
    var byTodo: [String: EKReminder] = [:]
    for reminder in found {
        guard let url = reminder.url?.absoluteString, url.hasPrefix(todoScheme) else { continue }
        byTodo[String(url.dropFirst(todoScheme.count))] = reminder
    }
    return byTodo
}

/// "YYYY-MM-DD" → an all-day due date.
private func dayComponents(_ day: String) -> DateComponents? {
    let parts = day.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return DateComponents(year: parts[0], month: parts[1], day: parts[2])
}

private func remindersJSON(_ dict: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = (try? JSONSerialization.data(withJSONObject: dict, options: [])) ?? Data("{}".utf8)
    let str = String(decoding: data, as: UTF8.self)
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}
