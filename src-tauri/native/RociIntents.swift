// Roci's actions for Spotlight, Siri and Shortcuts. They run in the app and hand Rust the roci:// action they stand for.

import AppIntents
import Foundation

/// Ask a question: Roci opens a new chat with it.
struct AskRoci: AppIntent {
    static let title: LocalizedStringResource = "Ask Roci"
    static let description = IntentDescription("Ask a question in a new Roci chat.")
    static let supportedModes: IntentModes = .foreground

    @Parameter(title: "Question", requestValueDialog: "What do you want to ask Roci?")
    var question: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Roci \(\.$question)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        run(rociLink("ask", query: question))
        return .result()
    }
}

/// Start recording a meeting; the menu bar icon turns red.
struct StartRecording: AppIntent {
    static let title: LocalizedStringResource = "Start Recording"
    static let description = IntentDescription("Record a meeting in Roci.")

    @MainActor
    func perform() async throws -> some IntentResult {
        run(rociLink("record"))
        return .result()
    }
}

/// Stop the meeting Roci is recording; Roci transcribes it.
struct StopRecording: AppIntent {
    static let title: LocalizedStringResource = "Stop Recording"
    static let description = IntentDescription("Stop the meeting Roci is recording and transcribe it.")

    @MainActor
    func perform() async throws -> some IntentResult {
        run(rociLink("stop"))
        return .result()
    }
}

/// Open Roci's settings.
struct OpenSettings: AppIntent {
    static let title: LocalizedStringResource = "Roci Settings"
    static let description = IntentDescription("Open Roci's settings.")
    static let supportedModes: IntentModes = .foreground

    @MainActor
    func perform() async throws -> some IntentResult {
        run(rociLink("settings"))
        return .result()
    }
}

/// The actions offered without any setup, with the phrases that find them.
struct RociShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskRoci(), phrases: ["Ask \(.applicationName)"],
            shortTitle: "Ask Roci", systemImageName: "bubble.left.and.text.bubble.right")
        AppShortcut(
            intent: StartRecording(), phrases: ["Start recording in \(.applicationName)", "Record a meeting in \(.applicationName)"],
            shortTitle: "Start Recording", systemImageName: "record.circle")
        AppShortcut(
            intent: StopRecording(), phrases: ["Stop recording in \(.applicationName)"],
            shortTitle: "Stop Recording", systemImageName: "stop.circle")
        AppShortcut(
            intent: OpenSettings(), phrases: ["Open \(.applicationName) settings"],
            shortTitle: "Roci Settings", systemImageName: "gearshape")
    }
}

// MARK: - Rust bridge

/// Rust's handler for an action: its roci:// URL as a NUL-terminated UTF-8 string.
private typealias ActionHandler = @convention(c) (UnsafePointer<CChar>) -> Void

/// Main-thread only: the handler, and the actions that ran before Rust set it (an intent can launch Roci).
private var handler: ActionHandler?
private var waiting: [URL] = []

/// Rust's handler for every action from now on, and the ones that were waiting for it; called once at startup.
@_cdecl("roci_intents_setup")
public func rociIntentsSetup(_ callback: @escaping @convention(c) (UnsafePointer<CChar>) -> Void) {
    DispatchQueue.main.async {
        handler = callback
        waiting.forEach(deliver)
        waiting.removeAll()
    }
}

@MainActor
private func run(_ url: URL) {
    guard handler != nil else {
        waiting.append(url)
        return
    }
    deliver(url)
}

private func deliver(_ url: URL) {
    url.absoluteString.withCString { handler?($0) }
}

/// `roci://<action>`, with the question as `q` when there is one (url_actions.rs reads it).
private func rociLink(_ action: String, query: String? = nil) -> URL {
    var link = URLComponents()
    link.scheme = "roci"
    link.host = action
    link.queryItems = query.map { [URLQueryItem(name: "q", value: $0)] }
    guard let url = link.url else { preconditionFailure("roci://\(action) is a valid URL") }
    return url
}
