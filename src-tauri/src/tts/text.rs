//! A reply's markdown as plain sentences, packed into chunks so playback starts after the first.

/// Longest text synthesized in one pass.
const MAX_CHUNK_CHARS: usize = 240;

pub fn speakable(markdown: &str) -> String {
    let mut text = String::with_capacity(markdown.len());
    let mut in_code = false;
    for line in markdown.lines() {
        if line.trim_start().starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        text.push_str(strip_line(line).trim());
        text.push(' ');
    }
    collapse_spaces(&strip_links(&text))
}

/// Line markers (headings, quotes, list bullets, numbers) and inline markup.
fn strip_line(line: &str) -> String {
    let trimmed = line.trim_start();
    let without_marker = trimmed
        .strip_prefix(|c| c == '#' || c == '>' || c == '-' || c == '*' || c == '+')
        .map(|rest| rest.trim_start_matches('#'))
        .unwrap_or_else(|| strip_number(trimmed));
    without_marker.chars().filter(|c| !matches!(c, '`' | '*' | '_' | '~' | '|')).collect()
}

fn strip_number(line: &str) -> &str {
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    if digits > 0 && line[digits..].starts_with(". ") {
        &line[digits + 2..]
    } else {
        line
    }
}

/// `[text](url)` → `text`; `![alt](url)` → nothing; `<tag>` → nothing.
fn strip_links(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(['[', '<', '!']) {
        out.push_str(&rest[..start]);
        rest = &rest[start..];
        if let Some(after) = rest.strip_prefix('<').and_then(|r| r.find('>').map(|end| &r[end + 1..])) {
            rest = after;
        } else if let Some((label, after)) = link(rest.strip_prefix('!').unwrap_or(rest)) {
            if !rest.starts_with('!') {
                out.push_str(label);
            }
            rest = after;
        } else {
            out.push_str(&rest[..1]);
            rest = &rest[1..];
        }
    }
    out.push_str(rest);
    out
}

/// `[label](url)rest` → (label, rest).
fn link(text: &str) -> Option<(&str, &str)> {
    let body = text.strip_prefix('[')?;
    let label_end = body.find(']')?;
    let after = body[label_end + 1..].strip_prefix('(')?;
    let url_end = after.find(')')?;
    Some((&body[..label_end], &after[url_end + 1..]))
}

fn collapse_spaces(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Sentences packed into chunks of at most [`MAX_CHUNK_CHARS`]; a longer sentence stays whole.
pub fn chunks(text: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for sentence in sentences(text) {
        if !current.is_empty() && current.len() + sentence.len() + 1 > MAX_CHUNK_CHARS {
            chunks.push(std::mem::take(&mut current));
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(sentence);
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn sentences(text: &str) -> impl Iterator<Item = &str> {
    let mut rest = text;
    std::iter::from_fn(move || {
        if rest.is_empty() {
            return None;
        }
        let end = rest
            .char_indices()
            .find(|&(i, c)| matches!(c, '.' | '!' | '?') && rest[i + 1..].starts_with(' '))
            .map_or(rest.len(), |(i, _)| i + 1);
        let sentence = rest[..end].trim();
        rest = rest[end..].trim_start();
        Some(sentence)
    })
    .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_becomes_plain_speech() {
        let md = "# Title\n\nSee **[the docs](https://x.dev)** now.\n\n```rust\nfn main() {}\n```\n- one\n2. two";
        assert_eq!(speakable(md), "Title See the docs now. one two");
    }

    #[test]
    fn sentences_pack_into_short_chunks() {
        let text = "a".repeat(200) + ". " + &"b".repeat(100) + ". Short.";
        let chunks = chunks(&text);
        assert_eq!(chunks.len(), 2);
        assert!(chunks[1].ends_with("Short."));
    }
}
