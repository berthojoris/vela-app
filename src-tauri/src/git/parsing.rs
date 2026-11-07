use std::collections::HashMap;

#[derive(Debug)]
pub(super) struct StatusEntry {
    pub(super) status: String,
    pub(super) path: String,
    pub(super) original_path: Option<String>,
}

pub(super) fn parse_status(bytes: &[u8]) -> Vec<StatusEntry> {
    let mut fields = bytes.split(|byte| *byte == 0);
    let mut entries = Vec::new();
    while let Some(field) = fields.next() {
        if field.len() < 4 {
            continue;
        }
        let status = String::from_utf8_lossy(&field[..2]).trim().to_string();
        let path = String::from_utf8_lossy(&field[3..]).into_owned();
        let original_path = if field[..2].contains(&b'R') || field[..2].contains(&b'C') {
            fields
                .next()
                .map(|source| String::from_utf8_lossy(source).into_owned())
        } else {
            None
        };
        entries.push(StatusEntry {
            status,
            path,
            original_path,
        });
    }
    entries
}

/// Parses `git diff --numstat -z`. Renames emit an empty path followed by source and destination;
/// the destination matches the path `git status` reports. Binary files ("-") count as zero.
pub(super) fn parse_numstat(bytes: &[u8]) -> HashMap<String, (usize, usize)> {
    let mut fields = bytes.split(|byte| *byte == 0);
    let mut counts = HashMap::new();
    while let Some(field) = fields.next() {
        let text = String::from_utf8_lossy(field);
        let mut parts = text.splitn(3, '\t');
        let (Some(added), Some(deleted), Some(path)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        let path = if path.is_empty() {
            fields.next();
            match fields.next() {
                Some(destination) => String::from_utf8_lossy(destination).into_owned(),
                None => continue,
            }
        } else {
            path.to_string()
        };
        counts.insert(
            path,
            (added.parse().unwrap_or(0), deleted.parse().unwrap_or(0)),
        );
    }
    counts
}

pub(super) fn unquote_path(path: &str) -> String {
    if !path.starts_with('"') {
        return path.to_string();
    }
    let mut decoded = Vec::new();
    let mut bytes = path.trim_matches('"').bytes().peekable();
    while let Some(byte) = bytes.next() {
        if byte != b'\\' {
            decoded.push(byte);
            continue;
        }
        match bytes.next() {
            Some(b't') => decoded.push(b'\t'),
            Some(b'n') => decoded.push(b'\n'),
            Some(b'r') => decoded.push(b'\r'),
            Some(first @ b'0'..=b'7') => {
                let mut value = (first - b'0') as u16;
                for _ in 0..2 {
                    if bytes.peek().is_some_and(|byte| matches!(byte, b'0'..=b'7')) {
                        value = value * 8 + (bytes.next().unwrap_or(b'0') - b'0') as u16;
                    }
                }
                decoded.push(value as u8);
            }
            Some(byte) => decoded.push(byte),
            None => (),
        }
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

pub(super) fn split_patch(patch: &str) -> HashMap<String, String> {
    let mut patches = HashMap::new();
    for chunk in patch
        .strip_prefix("diff --git ")
        .unwrap_or(patch)
        .split("\ndiff --git ")
    {
        let new_path = chunk
            .lines()
            .find_map(|line| line.strip_prefix("+++ "))
            .map(unquote_path);
        let old_path = chunk
            .lines()
            .find_map(|line| line.strip_prefix("--- "))
            .map(unquote_path);
        let path = new_path.filter(|path| path != "/dev/null").or(old_path);
        if let Some(path) = path {
            patches.insert(
                path.strip_prefix("b/")
                    .or_else(|| path.strip_prefix("a/"))
                    .unwrap_or(&path)
                    .to_string(),
                format!("diff --git {chunk}"),
            );
        }
    }
    patches
}

pub(super) fn truncate_preview(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    if limit == 0 {
        return "Preview omitted: total review size limit reached. Inspect this file in the terminal.".into();
    }
    let mut end = limit;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!(
        "{}\n[Preview truncated. Inspect the full change in the terminal before committing.]",
        &text[..end]
    )
}
