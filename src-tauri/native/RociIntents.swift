// Roci's actions for Spotlight, Siri and Shortcuts: each opens the roci:// link that runs it in the app.

import AppIntents
import Foundation

/// Ask a question: Roci opens a new chat with it.
struct AskRoci: AppIntent {
    static let title: LocalizedStringResource = "Ask Roci"
    static let description = IntentDescription("Ask a question in a new Roci chat.")

    @Parameter(title: "Question", requestValueDialog: "What do you want to ask Roci?")
    var question: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask Roci \(\.$question)")
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(rociLink("ask", query: question)))
    }
}

/// Start recording a meeting.
struct StartRecording: AppIntent {
    static let title: LocalizedStringResource = "Start Recording"
    static let description = IntentDescription("Record a meeting in Roci.")

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(rociLink("record")))
    }
}

/// Stop the meeting Roci is recording; Roci transcribes it.
struct StopRecording: AppIntent {
    static let title: LocalizedStringResource = "Stop Recording"
    static let description = IntentDescription("Stop the meeting Roci is recording and transcribe it.")

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(rociLink("stop")))
    }
}

/// Open Roci's settings.
struct OpenSettings: AppIntent {
    static let title: LocalizedStringResource = "Roci Settings"
    static let description = IntentDescription("Open Roci's settings.")

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(rociLink("settings")))
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

/// The symbol the link asks for, so the intents (which nothing calls) come into the app (apple-build `build_with_app_intents`).
@_cdecl("roci_intents_linked")
public func rociIntentsLinked() {}

/// `roci://<action>`, with the question as `q` when there is one (url_actions.rs reads it).
private func rociLink(_ action: String, query: String? = nil) -> URL {
    var link = URLComponents()
    link.scheme = "roci"
    link.host = action
    link.queryItems = query.map { [URLQueryItem(name: "q", value: $0)] }
    guard let url = link.url else { preconditionFailure("roci://\(action) is a valid URL") }
    return url
}
