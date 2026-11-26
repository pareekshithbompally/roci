//! How meetings, chats and documents are split into search pieces: sentence pieces with overlap for long text, a meeting's
//! title and summary as one piece and its notes and to-dos as another, a chat's turns (a long answer split like a
//! transcript), and a document page by page (each piece keeps its page).

use tauri_plugin_store::index::{ChatLine, MeetingText, ChunkData};

/// Longest piece, in characters; long text is cut at sentence ends below it.
const MAX_PIECE_CHARS: usize = 2000;
/// Characters each long-text piece repeats from the one before, so no thought is cut in half.
const OVERLAP_CHARS: usize = 200;
/// Notes and to-dos shorter than this together aren't worth a piece.
const MIN_NOTES_CHARS: usize = 20;
/// Chat turns shorter than this ("ok", "thanks") aren't indexed.
const MIN_TURN_CHARS: usize = 30;

/// One stretch of text with where it sits in its source (in characters).
#[derive(Debug, Clone, PartialEq)]
pub struct Span {
    pub text: String,
    pub start: usize,
    pub end: usize,
}

/// Length in characters (not bytes).
fn chars(s: &str) -> usize {
    s.chars().count()
}

/// The text split after every char in `ends` that is followed by whitespace; each part but the last keeps one space.
fn split_after(text: &str, ends: &[char]) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut iter = text.chars().peekable();
    while let Some(c) = iter.next() {
        current.push(c);
        if ends.contains(&c) && iter.peek().is_some_and(|n| n.is_whitespace()) {
            while iter.peek().is_some_and(|n| n.is_whitespace()) {
                iter.next();
            }
            current.push(' ');
            parts.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() || parts.is_empty() {
        parts.push(current);
    }
    parts
}

/// A run with no sentence or clause break cut into `max`-character parts, at a space when there is one.
fn hard_split(text: &str, max: usize) -> Vec<String> {
    let all: Vec<char> = text.chars().collect();
    let mut parts = Vec::new();
    let mut start = 0;
    while start < all.len() {
        if start + max >= all.len() {
            parts.push(all[start..].iter().collect());
            break;
        }
        let mut end = start + max;
        if let Some(space) = all[start + 1..=end].iter().rposition(|c| *c == ' ') {
            end = start + 1 + space + 1;
        }
        parts.push(all[start..end].iter().collect());
        start = end;
    }
    parts
}

/// A sentence too long for a piece, cut at commas and semicolons, else at spaces.
fn clause_parts(sentence: &str, max: usize) -> Vec<String> {
    let parts = split_after(sentence, &[',', ';']);
    if parts.len() <= 1 { hard_split(sentence, max) } else { parts }
}

/// The last `n` characters of `s`.
fn tail(s: &str, n: usize) -> String {
    let len = chars(s);
    s.chars().skip(len.saturating_sub(n)).collect()
}

/// Long text as pieces of at most [`MAX_PIECE_CHARS`] cut at sentence ends (then clauses, then spaces); each piece
/// repeats [`OVERLAP_CHARS`] of the one before. Short text is one piece; empty text none.
pub fn split_long(text: &str) -> Vec<Span> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }
    if chars(text) <= MAX_PIECE_CHARS {
        return vec![Span { text: text.to_string(), start: 0, end: chars(text) }];
    }
    let mut spans = Vec::new();
    let mut current = String::new();
    let mut start = 0;
    let mut pos = 0;
    let mut add = |part: String, current: &mut String, start: &mut usize, pos: &mut usize| {
        if chars(current) + chars(&part) > MAX_PIECE_CHARS && !current.is_empty() {
            spans.push(Span { text: current.trim().to_string(), start: *start, end: *pos });
            let overlap = tail(current, OVERLAP_CHARS);
            *start = *pos - chars(&overlap);
            *current = overlap;
        }
        *pos += chars(&part);
        current.push_str(&part);
    };
    for sentence in split_after(text, &['.', '!', '?']) {
        if chars(&sentence) > MAX_PIECE_CHARS {
            for part in clause_parts(&sentence, MAX_PIECE_CHARS) {
                add(part, &mut current, &mut start, &mut pos);
            }
        } else {
            add(sentence, &mut current, &mut start, &mut pos);
        }
    }
    if !current.trim().is_empty() {
        spans.push(Span { text: current.trim().to_string(), start, end: pos });
    }
    spans
}

/// One piece to save; its vector is added later, when it needs one.
fn piece(index: usize, text: String, kind: &str, span: Option<&Span>) -> ChunkData {
    ChunkData {
        chunk_index: index as i32,
        chunk_text: text,
        chunk_type: kind.into(),
        embedding: None,
        start_pos: span.map(|s| s.start as i32),
        end_pos: span.map(|s| s.end as i32),
        page: None,
    }
}

/// A document's pieces: each page split like long text, every piece with its page (from 1) and where it sits on it. A
/// file without pages (text, Markdown) is one page; pages with no text add nothing.
pub fn document(pages: &[String], kind: &str) -> Vec<ChunkData> {
    let mut pieces = Vec::new();
    for (number, text) in (1..).zip(pages) {
        for span in split_long(text) {
            let mut p = piece(pieces.len(), span.text.clone(), kind, Some(&span));
            p.page = Some(number);
            pieces.push(p);
        }
    }
    pieces
}

/// A transcript stretch's pieces, numbered from 0.
pub fn transcript(text: &str) -> Vec<ChunkData> {
    split_long(text).iter().enumerate().map(|(i, s)| piece(i, s.text.clone(), "transcript", Some(s))).collect()
}

/// A meeting's pieces: its title and summary first, then its transcript, then its notes and to-dos.
pub fn meeting(text: &MeetingText) -> Vec<ChunkData> {
    let mut pieces = Vec::new();
    let head = [text.title.as_str(), text.summary.as_str()].iter().filter(|s| !s.is_empty()).copied().collect::<Vec<_>>().join(". ");
    if !head.trim().is_empty() {
        pieces.push(piece(0, head.trim().to_string(), "title_summary", None));
    }
    for span in split_long(&text.transcript) {
        pieces.push(piece(pieces.len(), span.text.clone(), "transcript", Some(&span)));
    }
    let notes = text.notes.iter().filter(|n| !n.is_empty()).cloned().collect::<Vec<_>>().join(". ");
    if chars(&notes) > MIN_NOTES_CHARS {
        pieces.push(piece(pieces.len(), notes, "notes", None));
    }
    pieces
}

/// A chat's pieces: each question with the answer after it; a long answer is split, each part with its question.
pub fn chat(lines: &[ChatLine]) -> Vec<ChunkData> {
    let mut pieces = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if !lines[i].from_user {
            i += 1;
            continue;
        }
        let question = lines[i].text.trim();
        let answer = lines.get(i + 1).filter(|l| !l.from_user);
        let parts: Vec<String> = answer.map(|a| split_long(&a.text).into_iter().map(|s| s.text).collect()).unwrap_or_default();
        for part in if parts.is_empty() { vec![String::new()] } else { parts } {
            let turn = if part.is_empty() { format!("User: {question}") } else { format!("User: {question}\nAssistant: {part}") };
            if chars(&turn) >= MIN_TURN_CHARS {
                pieces.push(piece(pieces.len(), turn, "turn", None));
            }
        }
        i += if answer.is_some() { 2 } else { 1 };
    }
    pieces
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meeting_of(title: &str, summary: &str, transcript: &str, notes: &[&str]) -> MeetingText {
        MeetingText {
            title: title.into(),
            summary: summary.into(),
            transcript: transcript.into(),
            notes: notes.iter().map(|n| n.to_string()).collect(),
            waiting: false,
        }
    }

    fn kinds(pieces: &[ChunkData], kind: &str) -> Vec<String> {
        pieces.iter().filter(|p| p.chunk_type == kind).map(|p| p.chunk_text.clone()).collect()
    }

    #[test]
    fn a_meetings_title_and_summary_lead_as_one_piece() {
        let pieces = meeting(&meeting_of("Test Meeting", "A test summary.", "", &[]));
        assert_eq!(pieces[0].chunk_type, "title_summary");
        assert_eq!(pieces[0].chunk_text, "Test Meeting. A test summary.");
        assert_eq!(meeting(&meeting_of("Test Meeting", "", "", &[]))[0].chunk_text, "Test Meeting");
        assert!(meeting(&meeting_of("", "", "", &[])).is_empty());
    }

    #[test]
    fn a_short_transcript_is_one_piece_and_a_long_one_is_cut_at_sentences_with_overlap() {
        let short = meeting(&meeting_of("t", "", "Hello world. This is a short transcript.", &[]));
        assert_eq!(kinds(&short, "transcript"), vec!["Hello world. This is a short transcript."]);
        assert!(kinds(&meeting(&meeting_of("t", "", "   ", &[])), "transcript").is_empty());

        let long = "This is one sentence of a long meeting. ".repeat(120);
        let pieces = transcript(&long);
        assert!(pieces.len() > 1);
        assert!(pieces.iter().all(|p| chars(&p.chunk_text) <= MAX_PIECE_CHARS));
        assert!(pieces.iter().all(|p| p.chunk_text.ends_with('.')), "cut at sentence ends");
        let first_end: String = pieces[0].chunk_text.chars().rev().take(30).collect::<Vec<_>>().into_iter().rev().collect();
        assert!(pieces[1].chunk_text.contains(&first_end), "the next piece repeats the end of the one before");
        assert!(pieces.iter().all(|p| p.start_pos.is_some() && p.end_pos.is_some()));
    }

    #[test]
    fn a_run_with_no_sentence_end_is_cut_at_clauses_then_spaces() {
        // A piece is a full run plus the overlap it repeats from the one before.
        let bound = MAX_PIECE_CHARS + OVERLAP_CHARS;
        let clauses = "one clause, ".repeat(300);
        assert!(split_long(&clauses).iter().all(|s| chars(&s.text) <= bound));
        let words = "word ".repeat(1000);
        let spans = split_long(&words);
        assert!(spans.len() > 1 && spans.iter().all(|s| chars(&s.text) <= bound && !s.text.contains("wor d")));
    }

    #[test]
    fn a_documents_pieces_keep_their_pages_and_a_blank_page_adds_nothing() {
        let long = "A sentence on the second page of the proposal. ".repeat(60);
        let pieces = document(&["Pricing for Q3.".into(), String::new(), long], "page");
        assert_eq!(pieces[0].page, Some(1));
        assert!(pieces.len() > 2 && pieces[1..].iter().all(|p| p.page == Some(3)), "page 2 is blank");
        assert_eq!(pieces.iter().map(|p| p.chunk_index).collect::<Vec<_>>(), (0..pieces.len() as i32).collect::<Vec<_>>());
    }

    #[test]
    fn notes_and_to_dos_are_one_piece_when_long_enough() {
        let pieces = meeting(&meeting_of("t", "", "", &["Note about the project", "Follow up on deliverables"]));
        assert_eq!(kinds(&pieces, "notes"), vec!["Note about the project. Follow up on deliverables"]);
        assert!(kinds(&meeting(&meeting_of("t", "", "", &["short"])), "notes").is_empty());
    }

    #[test]
    fn a_chat_is_its_turns_and_a_long_answer_is_split_with_its_question() {
        let line = |from_user: bool, text: &str| ChatLine { from_user, text: text.into() };
        let answer = "This is one sentence of a long and detailed answer. ".repeat(60);
        let pieces = chat(&[line(true, "Tell me everything"), line(false, &answer), line(true, "ok"), line(false, "Sure.")]);
        assert!(pieces.len() > 1);
        assert!(pieces.iter().all(|p| p.chunk_text.starts_with("User: Tell me everything\nAssistant: ")), "the short turn is left out");
        assert!(pieces.last().unwrap().chunk_text.ends_with("detailed answer."));
        assert_eq!(pieces.iter().map(|p| p.chunk_index).collect::<Vec<_>>(), (0..pieces.len() as i32).collect::<Vec<_>>());
    }
}
