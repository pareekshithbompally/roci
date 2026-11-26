import Foundation
import PDFKit

// MARK: - C-compatible JSON bridge for Rust FFI

/// A PDF's text, page by page, as PDFKit reads it: `{"ok":true,"pages":["…"]}`, or `{"ok":false,"error":"…"}` when it can't
/// be opened. A scanned page has no text (an empty string); reading it needs Vision, a later entry here.
@_cdecl("document_reader_pdf_pages")
public func documentReaderPdfPages(_ path: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let url = URL(fileURLWithPath: String(cString: path))
    guard let document = PDFDocument(url: url) else { return reply(["ok": false, "error": "PDFKit can't open it"]) }
    guard !document.isLocked else { return reply(["ok": false, "error": "It's locked with a password"]) }
    let pages = (0..<document.pageCount).map { document.page(at: $0)?.string ?? "" }
    return reply(["ok": true, "pages": pages])
}

@_cdecl("document_reader_free_string")
public func documentReaderFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}

private func reply(_ object: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = try? JSONSerialization.data(withJSONObject: object)
    let str = data.flatMap { String(data: $0, encoding: .utf8) } ?? #"{"ok":false,"error":"Encoding failed"}"#
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}
