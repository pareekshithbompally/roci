import AppKit
import CoreServices
import Foundation

// MARK: - Apple Notes (in-process Apple Events; osascript is blocked by hardened runtime) — JSON C-string bridge

private let notesBundleId = "com.apple.Notes"
/// The app's name from its Info.plist (Tauri embeds one in dev builds too).
private let appName = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "This app"

/// `{"status": "authorized" | "denied" | "not_determined"}`; `ask` raises the macOS prompt while undecided.
@_cdecl("apple_notes_access")
public func appleNotesAccess(_ ask: Bool) -> UnsafeMutablePointer<CChar> {
    if ask { launchNotesIfNeeded() }
    return notesJSON(["status": automationStatus(ask: ask)])
}

/// Upserts a meeting's note `{"folder", "tag", "title", "html"}`, found later by its `tag` line; `{}` or `{"error"}`.
@_cdecl("apple_notes_upsert")
public func appleNotesUpsert(_ input: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard let data = String(cString: input).data(using: .utf8),
          let note = try? JSONDecoder().decode(NoteInput.self, from: data) else {
        return notesFailure("failed", "Invalid note input")
    }
    // Consent is only known for a running target, so start Notes first.
    launchNotesIfNeeded()
    guard automationStatus(ask: false) == "authorized" else {
        return notesFailure("not-authorized", "\(appName) isn't allowed to control Notes.")
    }
    return runOnMain { run(script: upsertScript(note)) }
}

@_cdecl("apple_notes_free_string")
public func appleNotesFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}

// MARK: - Automation consent

private func automationStatus(ask: Bool) -> String {
    var target = AEAddressDesc()
    let created = notesBundleId.withCString { id in
        AECreateDesc(DescType(typeApplicationBundleID), id, strlen(id), &target)
    }
    guard created == noErr else { return "not_determined" }
    defer { AEDisposeDesc(&target) }
    switch AEDeterminePermissionToAutomateTarget(&target, AEEventClass(typeWildCard), AEEventID(typeWildCard), ask) {
    case noErr: return "authorized"
    case OSStatus(errAEEventNotPermitted): return "denied"
    default: return "not_determined" // errAEEventWouldRequireUserConsent, or Notes not running yet
    }
}

/// Consent can only be determined against a running target; start Notes in the background.
private func launchNotesIfNeeded() {
    guard NSRunningApplication.runningApplications(withBundleIdentifier: notesBundleId).isEmpty,
          let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: notesBundleId) else { return }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    configuration.hides = true
    let semaphore = DispatchSemaphore(value: 0)
    NSWorkspace.shared.openApplication(at: url, configuration: configuration) { _, _ in semaphore.signal() }
    _ = semaphore.wait(timeout: .now() + 10)
}

// MARK: - Script

private struct NoteInput: Decodable {
    let folder: String
    let tag: String
    let title: String
    let html: String
}

/// AppleScript string literal (quotes and backslashes escaped).
private func literal(_ text: String) -> String {
    "\"" + text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
}

private func upsertScript(_ note: NoteInput) -> String {
    """
    tell application id "\(notesBundleId)"
        set targetAccount to default account
        if not (exists folder \(literal(note.folder)) of targetAccount) then
            make new folder at targetAccount with properties {name:\(literal(note.folder))}
        end if
        set targetFolder to folder \(literal(note.folder)) of targetAccount
        set existing to (notes of targetFolder whose body contains \(literal(note.tag)))
        if (count of existing) > 0 then
            set body of item 1 of existing to \(literal(note.html))
        else
            make new note at targetFolder with properties {name:\(literal(note.title)), body:\(literal(note.html))}
        end if
    end tell
    """
}

private func run(script source: String) -> UnsafeMutablePointer<CChar> {
    var error: NSDictionary?
    guard let script = NSAppleScript(source: source) else { return notesFailure("failed", "Invalid script") }
    script.executeAndReturnError(&error)
    guard let error else { return notesJSON([:]) }
    let code = error[NSAppleScript.errorNumber] as? Int ?? 0
    let message = error[NSAppleScript.errorMessage] as? String ?? "Notes refused the request."
    return notesFailure(code == Int(errAEEventNotPermitted) ? "not-authorized" : "failed", message)
}

/// NSAppleScript must run on the main thread.
private func runOnMain(_ work: @escaping () -> UnsafeMutablePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    if Thread.isMainThread { return work() }
    var result: UnsafeMutablePointer<CChar>!
    DispatchQueue.main.sync { result = work() }
    return result
}

private func notesFailure(_ kind: String, _ message: String) -> UnsafeMutablePointer<CChar> {
    notesJSON(["error": ["kind": kind, "message": message]])
}

private func notesJSON(_ dict: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = (try? JSONSerialization.data(withJSONObject: dict, options: [])) ?? Data("{}".utf8)
    let str = String(decoding: data, as: UTF8.self)
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}
