//! The text of a document Roci keeps, for its search index: a PDF's pages through PDFKit (`swift/DocumentReader.swift`,
//! JSON over a C string freed by `document_reader_free_string`). Blocks; call it off the main thread.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::path::Path;

extern "C" {
    fn document_reader_pdf_pages(path: *const c_char) -> *mut c_char;
    fn document_reader_free_string(ptr: *mut c_char);
}

#[derive(serde::Deserialize)]
struct PagesReply {
    ok: bool,
    #[serde(default)]
    pages: Vec<String>,
    error: Option<String>,
}

/// The PDF's text, one entry per page (empty for a page with no text, such as a scan); an error when it can't be opened.
pub fn pdf_pages(path: &Path) -> Result<Vec<String>, String> {
    let path = CString::new(path.to_string_lossy().into_owned()).map_err(|e| e.to_string())?;
    let ptr = unsafe { document_reader_pdf_pages(path.as_ptr()) };
    if ptr.is_null() {
        return Err("Null pointer from the document reader".into());
    }
    let json = unsafe {
        let json = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        document_reader_free_string(ptr);
        json
    };
    let reply: PagesReply = serde_json::from_str(&json).map_err(|e| format!("Document reader reply: {e}"))?;
    if reply.ok {
        Ok(reply.pages)
    } else {
        Err(reply.error.unwrap_or_else(|| "The PDF couldn't be read".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A two-page PDF with a line of text on each page, written by hand.
    fn two_page_pdf() -> Vec<u8> {
        let page = |text: &str| format!("BT /F1 12 Tf 72 720 Td ({text}) Tj ET");
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>".to_string(),
            format!("<< /Length {} >>\nstream\n{}\nendstream", page("Pricing for Q3").len(), page("Pricing for Q3")),
            format!("<< /Length {} >>\nstream\n{}\nendstream", page("Priya leads the rollout").len(), page("Priya leads the rollout")),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        ];
        let mut pdf = String::from("%PDF-1.4\n");
        let mut offsets = Vec::new();
        for (i, object) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.push_str(&format!("{} 0 obj\n{object}\nendobj\n", i + 1));
        }
        let xref = pdf.len();
        pdf.push_str(&format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1));
        offsets.iter().for_each(|o| pdf.push_str(&format!("{o:010} 00000 n \n")));
        pdf.push_str(&format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objects.len() + 1));
        pdf.into_bytes()
    }

    #[test]
    fn a_pdf_is_read_page_by_page_and_a_file_that_is_not_one_says_so() {
        let dir = std::env::temp_dir().join(format!("document-reader-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let pdf = dir.join("q3.pdf");
        std::fs::write(&pdf, two_page_pdf()).unwrap();
        let pages = pdf_pages(&pdf).unwrap();
        assert_eq!(pages.len(), 2);
        assert!(pages[0].contains("Pricing for Q3") && pages[1].contains("Priya leads the rollout"), "{pages:?}");

        let not_pdf = dir.join("notes.pdf");
        std::fs::write(&not_pdf, b"just words").unwrap();
        assert!(pdf_pages(&not_pdf).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
