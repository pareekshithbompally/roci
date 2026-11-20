import Foundation
import EventKit

// MARK: - Reminders (EventKit) — JSON C-string bridge; each reminder's URL `roci://todo/<id>` links it to its to-do

private let todoScheme = "roci://todo/"

/// Request full access to reminders. `{"granted": bool, "error"?: string}`
@_cdecl("reminders_request_access")
public func remindersRequestAccess() -> UnsafeMutablePointer<CChar> {
    jsonPointer(requestEventKitAccess(.reminder))
}

/// Current authorization. `{"status": "authorized" | "denied" | "not_determined" | "restricted"}`
@_cdecl("reminders_check_access")
public func remindersCheckAccess() -> UnsafeMutablePointer<CChar> {
    jsonPointer(eventKitAccessStatus(.reminder))
}

/// Every reminders list. `{"lists": [{"id", "title"}]}`
@_cdecl("reminders_lists")
public func remindersLists() -> UnsafeMutablePointer<CChar> {
    let lists = eventStoreQueue.sync {
        eventStore.calendars(for: .reminder).map { ["id": $0.calendarIdentifier, "title": $0.title] }
    }
    return jsonPointer(["lists": lists])
}

/// The list titled `title`, created in the default reminders account when missing. `{"id"}` or `{"error"}`
@_cdecl("reminders_ensure_list")
public func remindersEnsureList(_ title: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let name = String(cString: title)
    return jsonPointer(eventStoreQueue.sync { () -> [String: Any] in
        if let existing = eventStore.calendars(for: .reminder).first(where: { $0.title == name }) {
            return ["id": existing.calendarIdentifier]
        }
        guard let source = eventStore.defaultCalendarForNewReminders()?.source else {
            return ["error": "No reminders account on this device"]
        }
        let list = EKCalendar(for: .reminder, eventStore: eventStore)
        list.title = name
        list.source = source
        do {
            try eventStore.saveCalendar(list, commit: true)
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
        return jsonPointer(["error": "Invalid reminder input"])
    }
    return jsonPointer(eventStoreQueue.sync { () -> [String: Any] in
        guard let list = eventStore.calendar(withIdentifier: item.list_id) else {
            return ["error": "Reminders list not found"]
        }
        let existing = tagged(in: list)[item.todo_id]
        if existing == nil && !item.create { return [:] }
        let reminder = existing ?? EKReminder(eventStore: eventStore)
        reminder.calendar = list
        reminder.title = item.title
        reminder.notes = item.notes
        reminder.url = URL(string: todoScheme + item.todo_id)
        reminder.dueDateComponents = item.due_date.flatMap(dayComponents)
        reminder.isCompleted = item.completed
        do {
            try eventStore.save(reminder, commit: true)
            return [:]
        } catch {
            return ["error": error.localizedDescription]
        }
    })
}

/// Deletes the reminders of to-dos Roci removed (`{"list_id", "todo_ids"}`), found by their tag like upsert finds them;
/// ones already gone are skipped. `{}` or `{"error"}`
@_cdecl("reminders_remove")
public func remindersRemove(_ input: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard let data = String(cString: input).data(using: .utf8),
          let request = try? JSONDecoder().decode(ReminderRemoval.self, from: data) else {
        return jsonPointer(["error": "Invalid reminder removal"])
    }
    return jsonPointer(eventStoreQueue.sync { () -> [String: Any] in
        guard let list = eventStore.calendar(withIdentifier: request.list_id) else {
            return ["error": "Reminders list not found"]
        }
        let byTodo = tagged(in: list)
        do {
            for reminder in request.todo_ids.compactMap({ byTodo[$0] }) {
                try eventStore.remove(reminder, commit: true)
            }
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
    return jsonPointer(eventStoreQueue.sync { () -> [String: Any] in
        guard let list = eventStore.calendar(withIdentifier: id) else { return ["error": "Reminders list not found"] }
        let items = tagged(in: list).map { ["todo_id": $0.key, "completed": $0.value.isCompleted] }
        return ["items": items]
    })
}

/// Calls `callback` whenever the reminders database changes (any app). Register once.
@_cdecl("reminders_observe_changes")
public func remindersObserveChanges(_ callback: @escaping @convention(c) () -> Void) {
    NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: eventStore, queue: nil) { _ in
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

private struct ReminderRemoval: Decodable {
    let list_id: String
    let todo_ids: [String]
}

/// Roci-tagged reminders in `list`, keyed by to-do id. Runs on `eventStoreQueue`.
private func tagged(in list: EKCalendar) -> [String: EKReminder] {
    let semaphore = DispatchSemaphore(value: 0)
    var found: [EKReminder] = []
    eventStore.fetchReminders(matching: eventStore.predicateForReminders(in: [list])) { reminders in
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
