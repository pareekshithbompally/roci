//! Compiles the Swift document reader (PDFKit, macOS and iOS) into a static library.

fn main() {
    apple_build::SwiftLibrary {
        name: "document_reader",
        module: "DocumentReader",
        sources: &["swift/DocumentReader.swift"],
        frameworks: &["PDFKit", "Foundation"],
    }
    .build();
}
