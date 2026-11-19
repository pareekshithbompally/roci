//! Fails when `build.rs` COMMANDS, `generate_handler!` in lib.rs, and `default.toml` allow-entries drift.

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    const BUILD_RS: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/build.rs"));
    const LIB_RS: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"));
    const PERMISSIONS_TOML: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/permissions/default.toml"
    ));

    /// Strips a trailing `// ...` line comment, returning the code portion.
    fn strip_line_comment(line: &str) -> &str {
        match line.find("//") {
            Some(idx) => &line[..idx],
            None => line,
        }
    }

    /// Command names from `build.rs`: every quoted string inside the `COMMANDS` array.
    fn build_commands() -> BTreeSet<String> {
        let eq = BUILD_RS
            .find("COMMANDS")
            .and_then(|i| BUILD_RS[i..].find('=').map(|j| i + j))
            .expect("COMMANDS assignment");
        let start = eq
            + BUILD_RS[eq..]
                .find('[')
                .expect("COMMANDS array opening bracket")
            + 1;
        let end = start
            + BUILD_RS[start..]
                .find(']')
                .expect("COMMANDS array closing bracket");

        BUILD_RS[start..end]
            .lines()
            .map(strip_line_comment)
            .flat_map(|line| line.split(','))
            .filter_map(|tok| {
                let tok = tok.trim();
                tok.strip_prefix('"')
                    .and_then(|t| t.strip_suffix('"'))
                    .map(|s| s.to_string())
            })
            .collect()
    }

    /// Command names from `lib.rs`: every `<module>::<name>` inside `generate_handler!`.
    fn handler_commands() -> BTreeSet<String> {
        let start = LIB_RS
            .find("generate_handler!")
            .and_then(|i| LIB_RS[i..].find('[').map(|j| i + j + 1))
            .expect("generate_handler opening bracket");
        let end = start
            + LIB_RS[start..]
                .find(']')
                .expect("generate_handler closing bracket");

        LIB_RS[start..end]
            .lines()
            .map(strip_line_comment)
            .flat_map(|line| line.split(','))
            .filter_map(|tok| {
                let tok = tok.trim().trim_end_matches(',').trim();
                tok.rsplit_once("::").map(|(_, name)| name.trim().to_string())
            })
            .filter(|s| !s.is_empty())
            .collect()
    }

    /// Command names from `permissions/default.toml` `allow-<name>` entries, hyphens as underscores.
    fn permission_commands() -> BTreeSet<String> {
        PERMISSIONS_TOML
            .lines()
            .filter_map(|line| {
                let line = line.trim();
                let inner = line.strip_prefix('"').and_then(|l| {
                    l.find('"').map(|end| &l[..end])
                })?;
                inner
                    .strip_prefix("allow-")
                    .map(|name| name.replace('-', "_"))
            })
            .collect()
    }

    #[test]
    fn command_surfaces_are_consistent() {
        let build = build_commands();
        let handler = handler_commands();
        let perms = permission_commands();

        assert!(!build.is_empty(), "parsed zero commands from build.rs");
        assert!(!handler.is_empty(), "parsed zero commands from lib.rs");
        assert!(!perms.is_empty(), "parsed zero commands from default.toml");

        let mut problems = Vec::new();

        let report = |problems: &mut Vec<String>,
                      from: &str,
                      missing_in: &str,
                      set: &BTreeSet<String>| {
            if !set.is_empty() {
                let mut names: Vec<&str> = set.iter().map(|s| s.as_str()).collect();
                names.sort_unstable();
                problems.push(format!(
                    "commands in {} but missing from {}: {:?}",
                    from, missing_in, names
                ));
            }
        };

        report(
            &mut problems,
            "build.rs",
            "lib.rs generate_handler!",
            &build.difference(&handler).cloned().collect(),
        );
        report(
            &mut problems,
            "lib.rs generate_handler!",
            "build.rs",
            &handler.difference(&build).cloned().collect(),
        );
        report(
            &mut problems,
            "build.rs",
            "permissions/default.toml",
            &build.difference(&perms).cloned().collect(),
        );
        report(
            &mut problems,
            "permissions/default.toml",
            "build.rs",
            &perms.difference(&build).cloned().collect(),
        );

        assert!(
            problems.is_empty(),
            "command-surface drift detected:\n{}",
            problems.join("\n")
        );
    }
}
