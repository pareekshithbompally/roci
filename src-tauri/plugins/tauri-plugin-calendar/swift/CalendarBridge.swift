import Foundation
import EventKit
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

// MARK: - C-compatible JSON bridge for Rust FFI

/// Requests full calendar access: `{"granted": bool, "error"?}`.
@_cdecl("calendar_request_access")
public func calendarRequestAccess() -> UnsafeMutablePointer<CChar> {
    let result = requestEventKitAccess(.event)
    // Readers reread now that events can be read.
    if result["granted"] as? Bool == true { onChange?() }
    return jsonPointer(result)
}

/// `{"status": "authorized" | "denied" | "not_determined" | "restricted"}` without prompting.
@_cdecl("calendar_check_access")
public func calendarCheckAccess() -> UnsafeMutablePointer<CChar> {
    jsonPointer(eventKitAccessStatus(.event))
}

/// Events in an ISO 8601 date range.
@_cdecl("calendar_get_events_in_range")
public func calendarGetEventsInRange(
    _ startISO: UnsafePointer<CChar>,
    _ endISO: UnsafePointer<CChar>
) -> UnsafeMutablePointer<CChar> {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

    let startStr = String(cString: startISO)
    let endStr = String(cString: endISO)

    guard let start = formatter.date(from: startStr) ?? ISO8601DateFormatter().date(from: startStr),
          let end = formatter.date(from: endStr) ?? ISO8601DateFormatter().date(from: endStr) else {
        return jsonPointer(["events": [Any](), "error": "Invalid ISO 8601 dates"])
    }
    return jsonPointer(fetchEvents(start: start, end: end))
}

// MARK: - Changes

private var onChange: (@convention(c) () -> Void)?

/// Calls `callback` whenever upcoming events may differ: the calendar changed (any app), a new day, a clock or time-zone
/// change, the Mac woke, or (iOS) the app came back to the foreground. Register once.
@_cdecl("calendar_observe_changes")
public func calendarObserveChanges(_ callback: @escaping @convention(c) () -> Void) {
    onChange = callback
    let center = NotificationCenter.default
    center.addObserver(forName: .EKEventStoreChanged, object: eventStore, queue: nil) { _ in callback() }
    for name in [Notification.Name.NSCalendarDayChanged, .NSSystemClockDidChange, .NSSystemTimeZoneDidChange] {
        center.addObserver(forName: name, object: nil, queue: nil) { _ in callback() }
    }
    // Back from sleep or the background: synced accounts catch up (their new data posts `EKEventStoreChanged`).
    let resumed: (Notification) -> Void = { _ in
        refreshEventSources()
        callback()
    }
    #if os(macOS)
    NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.didWakeNotification, object: nil, queue: nil, using: resumed
    )
    #elseif os(iOS)
    center.addObserver(forName: UIApplication.significantTimeChangeNotification, object: nil, queue: nil) { _ in callback() }
    center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil, using: resumed)
    #endif
}

/// Events between two epoch-millisecond times, for schedulers that keep epoch time.
@_cdecl("calendar_get_events_between_ms")
public func calendarGetEventsBetweenMs(_ startMs: Double, _ endMs: Double) -> UnsafeMutablePointer<CChar> {
    let start = Date(timeIntervalSince1970: startMs / 1000)
    let end = Date(timeIntervalSince1970: endMs / 1000)
    return jsonPointer(fetchEvents(start: start, end: end))
}

/// Free a string pointer previously returned by this bridge.
@_cdecl("calendar_free_string")
public func calendarFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}

// MARK: - Internal helpers

/// `{"events": [...]}`, read on the store's queue (`events(matching:)` is synchronous).
private func fetchEvents(start: Date, end: Date) -> [String: Any] {
    eventStoreQueue.sync {
        // `calendars: nil` reads every event calendar.
        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
        return ["events": eventStore.events(matching: predicate).map(eventJSON)]
    }
}

/// Event times as ISO 8601 (seconds), made once: used only on `eventStoreQueue`.
private let eventDateFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

private func eventJSON(_ event: EKEvent) -> [String: Any] {
    let formatter = eventDateFormatter
    var dict: [String: Any] = [
        // Stable across reads (a meeting recorded from it links back): never a random stand-in.
        "event_id": event.eventIdentifier ?? event.calendarItemIdentifier,
        "title": event.title ?? "Untitled",
        "start_date": formatter.string(from: event.startDate),
        "end_date": formatter.string(from: event.endDate),
        "start_ms": event.startDate.timeIntervalSince1970 * 1000,
        "end_ms": event.endDate.timeIntervalSince1970 * 1000,
        "is_all_day": event.isAllDay,
        "is_cancelled": event.status == .canceled,
        "is_free": event.availability == .free,
        "calendar_name": event.calendar?.title ?? "Unknown",
    ]
    if let color = event.calendar.flatMap({ hexColor($0.cgColor) }) { dict["calendar_color"] = color }

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
            "is_current_user": participant.isCurrentUser,
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

/// `#rrggbb` from a calendar's colour (sRGB), or nil when it can't be converted.
private func hexColor(_ color: CGColor?) -> String? {
    guard let color, let srgb = CGColorSpace(name: CGColorSpace.sRGB),
          let rgb = color.converted(to: srgb, intent: .defaultIntent, options: nil),
          let c = rgb.components, c.count >= 3 else { return nil }
    let byte = { (v: CGFloat) in Int((min(max(v, 0), 1) * 255).rounded()) }
    return String(format: "#%02x%02x%02x", byte(c[0]), byte(c[1]), byte(c[2]))
}
