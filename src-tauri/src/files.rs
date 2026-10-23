use crate::models::{DirectoryListing, FileEntry, TextFile};
use std::{
    collections::hash_map::DefaultHasher,
    fs::{self, OpenOptions},
    hash::{Hash, Hasher},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ENTRIES: usize = 5000;
static SAVE_LOCK: Mutex<()> = Mutex::new(());
static TEMP_ID: AtomicU64 = AtomicU64::new(0);

fn resolve(root: &str, relative: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|e| format!("Cannot open folder: {e}"))?;
    if !root.is_dir() {
        return Err("The Explorer root must be a directory.".into());
    }
    let relative = Path::new(relative);
    if relative.components().any(|part| {
        !matches!(part, Component::Normal(_) | Component::CurDir)
            || matches!(part, Component::Normal(name) if name.eq_ignore_ascii_case(".git"))
    }) {
        return Err(
            "Choose a file inside the Explorer folder. Git metadata cannot be edited.".into(),
        );
    }
    let path =
        fs::canonicalize(root.join(relative)).map_err(|e| format!("Cannot access entry: {e}"))?;
    if !path.starts_with(&root) {
        return Err("Links outside the Explorer folder are not accessible.".into());
    }
    if path
        .components()
        .any(|part| matches!(part, Component::Normal(name) if name.eq_ignore_ascii_case(".git")))
    {
        return Err("Git metadata cannot be edited.".into());
    }
    Ok(path)
}

pub fn list(root: &str, relative: &str) -> Result<DirectoryListing, String> {
    let directory = resolve(root, relative)?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for entry in fs::read_dir(directory).map_err(|e| format!("Cannot list folder: {e}"))? {
        let entry = entry.map_err(|e| format!("Cannot list folder entry: {e}"))?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.eq_ignore_ascii_case(".git") {
            continue;
        }
        let path = if relative.is_empty() {
            name.to_owned()
        } else {
            format!("{}/{name}", relative.trim_end_matches('/'))
        };
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Cannot inspect entry: {e}"))?;
        let is_dir = if file_type.is_symlink() {
            let Ok(target) = resolve(root, &path) else {
                continue;
            };
            if !target.is_dir() && !target.is_file() {
                continue;
            }
            target.is_dir()
        } else {
            if !file_type.is_dir() && !file_type.is_file() {
                continue;
            }
            file_type.is_dir()
        };
        if entries.len() == MAX_ENTRIES {
            truncated = true;
            break;
        }
        entries.push(FileEntry {
            name: name.into(),
            path,
            is_dir,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(DirectoryListing { entries, truncated })
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| format!("Cannot open file: {e}"))?;
    let metadata = file
        .metadata()
        .map_err(|e| format!("Cannot inspect file: {e}"))?;
    if !metadata.is_file() {
        return Err("Select a regular text file.".into());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err("This file exceeds the editor limit of 2 MiB.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read file: {e}"))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("This file exceeds the editor limit of 2 MiB.".into());
    }
    Ok(bytes)
}

fn revision(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn decode(bytes: &[u8]) -> Result<TextFile, String> {
    let has_bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let text = std::str::from_utf8(if has_bom { &bytes[3..] } else { bytes }).map_err(|_| {
        "Only UTF-8 text files can be edited. Binary and other encodings are not supported."
    })?;
    if text.contains('\0') {
        return Err("Binary files cannot be edited.".into());
    }
    // Do not silently rewrite mixed line endings.
    let crlf = text.contains("\r\n");
    if text.replace("\r\n", "").contains(['\r', '\n']) && crlf
        || text.replace("\r\n", "").contains('\r')
    {
        return Err(
            "Mixed or legacy line endings are not supported. Convert the file to LF or CRLF first."
                .into(),
        );
    }
    Ok(TextFile {
        content: text.replace("\r\n", "\n"),
        revision: revision(bytes),
        line_ending: if crlf { "CRLF" } else { "LF" }.into(),
        has_bom,
    })
}

pub fn read(root: &str, path: &str) -> Result<TextFile, String> {
    decode(&read_bytes(&resolve(root, path)?)?)
}

struct TemporaryFile(PathBuf);
impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

pub fn save(
    root: &str,
    relative: &str,
    content: &str,
    expected_revision: &str,
) -> Result<TextFile, String> {
    if content.len() as u64 > MAX_FILE_BYTES {
        return Err("The edited file exceeds the limit of 2 MiB.".into());
    }
    let _lock = SAVE_LOCK
        .lock()
        .map_err(|_| "The file save worker is unavailable.")?;
    let path = resolve(root, relative)?;
    let original = read_bytes(&path)?;
    if revision(&original) != expected_revision {
        return Err("The file changed on disk. Your edits are kept. Reopen the file after closing it to load the disk version, or copy your edits before resolving the conflict.".into());
    }
    let document = decode(&original)?;
    if content.contains('\0') || content.contains('\r') {
        return Err("Only UTF-8 text with normalized line endings can be saved.".into());
    }
    let text = if document.line_ending == "CRLF" {
        content.replace('\n', "\r\n")
    } else {
        content.into()
    };
    let mut bytes = if document.has_bom {
        vec![0xef, 0xbb, 0xbf]
    } else {
        Vec::new()
    };
    bytes.extend_from_slice(text.as_bytes());
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("The edited file exceeds the limit of 2 MiB.".into());
    }
    let temp_path = path.with_file_name(format!(
        ".vela-save-{}-{}.tmp",
        std::process::id(),
        TEMP_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|e| format!("Cannot create save file: {e}"))?;
    let temporary = TemporaryFile(temp_path);
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("Cannot write save file: {e}"))?;
    drop(file);
    fs::set_permissions(
        &temporary.0,
        fs::metadata(&path)
            .map_err(|e| e.to_string())?
            .permissions(),
    )
    .map_err(|e| format!("Cannot preserve file permissions: {e}"))?;
    if resolve(root, relative)? != path || read_bytes(&path)? != original {
        return Err("The file changed while saving. Your edits are kept; reload the disk version before trying again.".into());
    }
    fs::rename(&temporary.0, &path)
        .map_err(|e| format!("Cannot replace file; the original was kept: {e}"))?;
    decode(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("vela-files-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn root(&self) -> &str {
            self.0.to_str().unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lists_folders_first_and_rejects_traversal_and_git_metadata() {
        let f = Fixture::new();
        fs::write(f.0.join("a.txt"), "a").unwrap();
        fs::create_dir(f.0.join("z-folder")).unwrap();
        fs::create_dir(f.0.join(".git")).unwrap();
        let entries = list(f.root(), "").unwrap().entries;
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "z-folder");
        assert!(read(f.root(), "../outside.txt").is_err());
        assert!(list(f.root(), ".git").is_err());
        assert!(read(f.root(), f.root()).is_err());
    }

    #[test]
    fn saves_atomically_preserving_bom_and_crlf_and_rejects_conflicts() {
        let f = Fixture::new();
        let path = f.0.join("text.txt");
        fs::write(&path, b"\xef\xbb\xbfhello\r\n").unwrap();
        let doc = read(f.root(), "text.txt").unwrap();
        assert_eq!(doc.content, "hello\n");
        let saved = save(f.root(), "text.txt", "updated\n", &doc.revision).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbfupdated\r\n");
        fs::write(&path, "external").unwrap();
        assert!(save(f.root(), "text.txt", "overwrite", &saved.revision).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), "external");
        assert_eq!(list(f.root(), "").unwrap().entries.len(), 1);
    }

    #[test]
    fn rejects_binary_large_and_unsupported_text_without_writing() {
        let f = Fixture::new();
        for (name, bytes) in [
            ("binary", vec![0, 1, 2]),
            ("encoding", vec![0xff, 0xfe]),
            ("large", vec![b'x'; MAX_FILE_BYTES as usize + 1]),
            ("mixed", b"a\r\nb\n".to_vec()),
        ] {
            fs::write(f.0.join(name), bytes).unwrap();
            assert!(read(f.root(), name).is_err());
        }
    }
}
