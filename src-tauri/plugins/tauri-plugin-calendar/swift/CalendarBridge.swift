import Foundation
import EventKit

// MARK: - C-compatible JSON bridge for Rust FFI

/// Request full access to calendar events.
/// Returns a JSON string: `{"granted": true}` or `{"granted": false, "error": "..."}`
@_cdecl("calendar_request_access")
public func calendarRequestAccess() -> UnsafeMutablePointer<CChar> {
    let store = EKEventStore()
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    var errorMsg: String?

    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { success, error in
            granted = success
            errorMsg = error?.localizedDescription
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .event) { success, error in
            granted = success
            errorMsg = error?.localizedDescription
            semaphore.signal()
        }
    }

    semaphore.wait()

    var result: [String: Any] = ["granted": granted]
    if let err = errorMsg { result["error"] = err }
    return jsonToPtr(result)
}

/// Check current authorization status.
/// Returns a JSON string: `{"status": "authorized" | "denied" | "not_determined" | "restricted"}`
@_cdecl("calendar_check_access")
public func calendarCheckAccess() -> UnsafeMutablePointer<CChar> {
    let status: String
    if #available(macOS 14.0, *) {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess: status = "authorized"
        case .writeOnly: status = "denied"
        case .denied: status = "denied"
        case .notDetermined: status = "not_determined"
        case .restricted: status = "restricted"
        @unknown default: status = "not_determined"
        }
    } else {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .authorized: status = "authorized"
        case .denied: status = "denied"
        case .notDetermined: status = "not_determined"
        case .restricted: status = "restricted"
        @unknown default: status = "not_determined"
        }
    }
    return jsonToPtr(["status": status])
}

/// Fetch events starting within the next `minutesAhead` minutes.
/// Parameter: minutesAhead (Int32)
/// Returns JSON array of CalendarEvent objects.
@_cdecl("calendar_get_upcoming_events")
public func calendarGetUpcomingEvents(_ minutesAhead: Int32) -> UnsafeMutablePointer<CChar> {
    let store = EKEventStore()
    let now = Date()
    guard let end = Calendar.current.date(byAdding: .minute, value: Int(minutesAhead), to: now) else {
        return jsonToPtr(["events": [Any](), "error": "Invalid time range"])
    }
    return fetchEventsJSON(store: store, start: now, end: end)
}

/// Fetch events in an ISO 8601 date range.
/// Parameters: startISO, endISO (C strings)
/// Returns JSON array of CalendarEvent objects.
@_cdecl("calendar_get_events_in_range")
public func calendarGetEventsInRange(
    _ startISO: UnsafePointer<CChar>,
    _ endISO: UnsafePointer<CChar>
) -> UnsafeMutablePointer<CChar> {
    let store = EKEventStore()
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

    let startStr = String(cString: startISO)
    let endStr = String(cString: endISO)

    guard let start = formatter.date(from: startStr) ?? ISO8601DateFormatter().date(from: startStr),
          let end = formatter.date(from: endStr) ?? ISO8601DateFormatter().date(from: endStr) else {
        return jsonToPtr(["events": [Any](), "error": "Invalid ISO 8601 dates"])
    }
    return fetchEventsJSON(store: store, start: start, end: end)
}

/// Free a string pointer previously returned by this bridge.
@_cdecl("calendar_free_string")
public func calendarFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}

// MARK: - Internal helpers

private func fetchEventsJSON(store: EKEventStore, start: Date, end: Date) -> UnsafeMutablePointer<CChar> {
    let calendars = store.calendars(for: .event)
    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
    let events = store.events(matching: predicate)
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]

    let mapped: [[String: Any]] = events.map { event in
        var dict: [String: Any] = [
            "event_id": event.eventIdentifier ?? UUID().uuidString,
            "title": event.title ?? "Untitled",
            "start_date": formatter.string(from: event.startDate),
            "end_date": formatter.string(from: event.endDate),
            "is_all_day": event.isAllDay,
            "calendar_name": event.calendar?.title ?? "Unknown",
        ]

        if let loc = event.location, !loc.isEmpty { dict["location"] = loc }
        if let notes = event.notes, !notes.isEmpty { dict["notes"] = notes }
        if let url = event.url { dict["url"] = url.absoluteString }

        // Organizer
        if let organizer = event.organizer {
            if let name = organizer.name { dict["organizer_name"] = name }
            // emailAddress may not always be available
            if organizer.responds(to: NSSelectorFromString("emailAddress")),
               let email = organizer.value(forKey: "emailAddress") as? String {
                dict["organizer_email"] = email
            }
        }

        // Attendees
        let attendees: [[String: Any]] = (event.attendees ?? []).compactMap { participant in
            // Skip resource rooms and unknown types
            guard participant.participantType == .person else { return nil }

            var att: [String: Any] = [
                "is_organizer": participant.isCurrentUser && event.organizer?.isCurrentUser == true,
            ]
            if let name = participant.name { att["name"] = name }
            if participant.responds(to: NSSelectorFromString("emailAddress")),
               let email = participant.value(forKey: "emailAddress") as? String {
                att["email"] = email
            }

            switch participant.participantStatus {
            case .accepted: att["status"] = "accepted"
            case .declined: att["status"] = "declined"
            case .tentative: att["status"] = "tentative"
            case .pending: att["status"] = "pending"
            default: att["status"] = "pending"
            }

            return att
        }
        dict["attendees"] = attendees

        return dict
    }

    return jsonToPtr(["events": mapped])
}

private func jsonToPtr(_ dict: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = try! JSONSerialization.data(withJSONObject: dict, options: [])
    let str = String(data: data, encoding: .utf8)!
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { cStr in
        ptr.initialize(from: cStr, count: str.utf8.count + 1)
    }
    return ptr
}
