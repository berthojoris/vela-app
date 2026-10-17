use std::io::Write;
use std::sync::Mutex;

static LOG_LOCK: Mutex<()> = Mutex::new(());

/// Local, size-bounded diagnostics. Never log terminal streams or send data off-device.
pub fn record(message: &str) {
    let _guard = LOG_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let root = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Vela/logs");
    if std::fs::create_dir_all(&root).is_err() {
        return;
    }
    let path = root.join("errors.log");
    if std::fs::metadata(&path).is_ok_and(|metadata| metadata.len() > 256 * 1024) {
        // Only rotate these two app-owned log files, never workspace files.
        let previous = root.join("errors.previous.log");
        let _ = std::fs::remove_file(&previous);
        let _ = std::fs::rename(&path, previous);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let bounded: String = message.chars().take(8000).collect();
        let _ = writeln!(file, "[{timestamp}] {bounded}");
    }
}

pub fn install_panic_hook() {
    let original = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record(&format!("Rust panic: {info}"));
        original(info);
    }));
}
