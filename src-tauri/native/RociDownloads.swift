// Model downloads on the system's background URLSession, the Apple way on Mac, iPhone and iPad: a download carries on while
// Roci is in the background, the phone is locked or the network drops for a while, and picks up where it stopped. One that
// finishes while Roci isn't running is handed over when the session reconnects at the next launch.
// Called from Rust (src/models/transfer.rs) over C: JSON in, `{"ok":bool,"error":?}` out (freed by
// `roci_downloads_free_string`), and one callback for every task's events.

import Foundation

private typealias EventCallback = @convention(c) (UnsafePointer<CChar>) -> Void

/// What a task is for, kept in its `taskDescription` so it survives a relaunch.
private struct Job: Codable {
    let key: String
    let destination: String

    var resumeURL: URL { URL(fileURLWithPath: destination + ".resume") }

    init(key: String, destination: String) {
        self.key = key
        self.destination = destination
    }

    init?(_ task: URLSessionTask) {
        guard let data = task.taskDescription?.data(using: .utf8), let job = try? JSONDecoder().decode(Job.self, from: data) else { return nil }
        self = job
    }
}

private final class Downloads: NSObject, URLSessionDownloadDelegate {
    var onEvent: EventCallback?
    /// Each running task's last whole percent sent, so progress crosses the bridge once per percent (touched on `queue` only).
    private var sentPercent: [Int: Int64] = [:]
    /// Tasks Roci stopped itself: their end is a cancel, not a failure (touched on `queue` only).
    private var stopped: Set<Int> = []
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        return queue
    }()

    /// The one background session, made with this object (the global below is created once, thread-safely).
    private(set) var session: URLSession!

    override init() {
        super.init()
        let configuration = URLSessionConfiguration.background(withIdentifier: (Bundle.main.bundleIdentifier ?? "ai.roci.roci") + ".downloads")
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
    }

    func send(_ payload: [String: Any]) {
        guard let onEvent, let json = jsonString(payload) else { return }
        json.withCString { onEvent($0) }
    }

    /// The task already running for `key`, if any (a relaunch keeps the ones from before).
    func running(_ key: String) -> URLSessionTask? {
        var found: URLSessionTask?
        let done = DispatchSemaphore(value: 0)
        session.getAllTasks { tasks in
            found = tasks.first { Job($0)?.key == key && $0.state != .completed && $0.state != .canceling }
            done.signal()
        }
        done.wait()
        return found
    }

    /// Stops `key`'s task, keeping what arrived as resume data for the next start.
    func stop(_ key: String) {
        guard let task = running(key) as? URLSessionDownloadTask, let job = Job(task) else { return }
        queue.addOperation { self.stopped.insert(task.taskIdentifier) }
        task.cancel { data in try? data?.write(to: job.resumeURL) }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let job = Job(downloadTask) else { return }
        let percent = totalBytesExpectedToWrite > 0 ? totalBytesWritten * 100 / totalBytesExpectedToWrite : totalBytesWritten >> 20
        guard sentPercent[downloadTask.taskIdentifier] != percent else { return }
        sentPercent[downloadTask.taskIdentifier] = percent
        send(["key": job.key, "event": "progress", "received": totalBytesWritten])
    }

    /// The file must leave the system's temporary place before this returns.
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let job = Job(downloadTask) else { return }
        if let http = downloadTask.response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            send(["key": job.key, "event": "failed", "error": "the server answered \(http.statusCode)"])
            return
        }
        let destination = URL(fileURLWithPath: job.destination)
        do {
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: location, to: destination)
            try? FileManager.default.removeItem(at: job.resumeURL)
            send(["key": job.key, "event": "finished"])
        } catch {
            send(["key": job.key, "event": "failed", "error": error.localizedDescription])
        }
    }

    /// The end of every task: a success was already reported; a stop is a cancel; anything else keeps its resume data.
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        sentPercent[task.taskIdentifier] = nil
        let wasStopped = stopped.remove(task.taskIdentifier) != nil
        guard let job = Job(task), let error = error as NSError? else { return }
        if wasStopped {
            send(["key": job.key, "event": "cancelled"])
            return
        }
        if let data = error.userInfo[NSURLSessionDownloadTaskResumeData] as? Data {
            try? data.write(to: job.resumeURL)
        }
        send(["key": job.key, "event": "failed", "error": error.localizedDescription])
    }
}

private let downloads = Downloads()

/// Installs the event callback and reconnects the session, so tasks from before (and ones that finished meanwhile) report in.
@_cdecl("roci_downloads_connect")
public func rociDownloadsConnect(_ callback: @escaping @convention(c) (UnsafePointer<CChar>) -> Void) {
    downloads.onEvent = callback
    _ = downloads.session
}

private struct StartInput: Decodable {
    let key: String
    let url: String
    let destination: String
}

/// Starts `{key, url, destination}`: from its resume data when an earlier try left some, else from the start. A task already
/// running for the key carries on instead. Blocks its (non-main) caller briefly while the session lists its tasks.
@_cdecl("roci_downloads_start")
public func rociDownloadsStart(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard let input = decode(StartInput.self, json), let url = URL(string: input.url) else { return reply(["ok": false, "error": "invalid download"]) }
    if let task = downloads.running(input.key) {
        task.resume()
        return reply(["ok": true])
    }
    let job = Job(key: input.key, destination: input.destination)
    let task: URLSessionDownloadTask
    if let data = try? Data(contentsOf: job.resumeURL) {
        try? FileManager.default.removeItem(at: job.resumeURL)
        task = downloads.session.downloadTask(withResumeData: data)
    } else {
        task = downloads.session.downloadTask(with: url)
    }
    task.taskDescription = jsonString(["key": job.key, "destination": job.destination])
    task.resume()
    return reply(["ok": true])
}

/// Stops the download for `"key"`; what arrived is kept and resumed by the next start.
@_cdecl("roci_downloads_cancel")
public func rociDownloadsCancel(_ json: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    guard let key = decode(String.self, json) else { return reply(["ok": false, "error": "invalid key"]) }
    downloads.stop(key)
    return reply(["ok": true])
}

/// Frees a string returned by this bridge.
@_cdecl("roci_downloads_free_string")
public func rociDownloadsFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    free(ptr)
}

// MARK: - JSON over C

private func decode<T: Decodable>(_ type: T.Type, _ json: UnsafePointer<CChar>) -> T? {
    try? JSONDecoder().decode(type, from: Data(String(cString: json).utf8))
}

private func jsonString(_ payload: [String: Any]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
    return String(data: data, encoding: .utf8)
}

private func reply(_ payload: [String: Any]) -> UnsafeMutablePointer<CChar> {
    strdup(jsonString(payload) ?? #"{"ok":false,"error":"unencodable reply"}"#)!
}
