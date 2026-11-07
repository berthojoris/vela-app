use super::*;
// Native console/PSReadLine initialization is timing-sensitive under concurrent startup.
#[cfg(windows)]
static CONPTY_TEST: Mutex<()> = Mutex::new(());
#[cfg(windows)]
#[test]
fn fast_natural_exit_is_drained_after_delayed_output_gate() {
    let _guard = CONPTY_TEST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    use tauri::{Listener, Manager};
    let app = tauri::test::mock_app();
    let manager = PtyManager::new();
    let id = format!("fast-exit-{}", uuid::Uuid::new_v4());
    let collected = Arc::new(Mutex::new(Vec::new()));
    let sink = collected.clone();
    app.listen(format!("pty-output-{id}"), move |event| {
        let bytes: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
        sink.lock().unwrap().extend(bytes);
    });
    let errors = Arc::new(Mutex::new(Vec::<String>::new()));
    let error_sink = errors.clone();
    app.listen(format!("pty-error-{id}"), move |event| {
        error_sink.lock().unwrap().push(event.payload().to_string());
    });
    let (tx, rx) = mpsc::channel();
    app.listen(format!("pty-exit-{id}"), move |event| {
        let code: Option<u32> = serde_json::from_str(event.payload()).unwrap();
        tx.send(code).unwrap();
    });
    manager
        .spawn(
            app.app_handle().clone(),
            id.clone(),
            "cmd.exe".into(),
            vec![
                "/D".into(),
                "/Q".into(),
                "/C".into(),
                "echo VELA_FAST_EXIT".into(),
            ],
            std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            80,
            24,
        )
        .unwrap();
    let session = manager.session(&id).unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while session.master.lock().unwrap().is_some() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        session.master.lock().unwrap().is_none(),
        "Child must exit before opening the gate"
    );
    assert!(rx.try_recv().is_err());
    manager.start_output(&id).unwrap();
    let result = rx.recv_timeout(Duration::from_secs(15));
    if result.is_err() {
        let _ = manager.kill(&id);
    }
    assert_eq!(result.unwrap(), Some(0));
    assert!(rx.try_recv().is_err());
    assert!(
        errors.lock().unwrap().is_empty(),
        "{:?}",
        errors.lock().unwrap()
    );
    assert!(String::from_utf8_lossy(&collected.lock().unwrap()).contains("VELA_FAST_EXIT"));
    assert!(manager.session(&id).is_err());
}

#[cfg(windows)]
fn assert_escape_reaches_application(shell: &str, args: Vec<String>) {
    use tauri::{Listener, Manager};
    let app = tauri::test::mock_app();
    let manager = PtyManager::new();
    let id = format!("escape-{}", uuid::Uuid::new_v4());
    let collected = Arc::new(Mutex::new(Vec::new()));
    let sink = collected.clone();
    let ack = manager.clone();
    let ack_id = id.clone();
    app.listen(format!("pty-output-{id}"), move |event| {
        let bytes: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
        sink.lock().unwrap().extend(&bytes);
        ack.acknowledge(&ack_id, bytes.len()).unwrap();
    });
    let (tx, rx) = mpsc::channel();
    app.listen(format!("pty-exit-{id}"), move |_| {
        let _ = tx.send(());
    });
    manager
        .spawn(
            app.app_handle().clone(),
            id.clone(),
            shell.into(),
            args,
            std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            80,
            24,
        )
        .unwrap();
    manager.start_output(&id).unwrap();
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(30) {
        if String::from_utf8_lossy(&collected.lock().unwrap()).contains("VELA_KEY_READY") {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let ready = String::from_utf8_lossy(&collected.lock().unwrap()).contains("VELA_KEY_READY");
    if !ready {
        let _ = manager.kill(&id);
        panic!(
            "Shell did not become ready: {:?}",
            String::from_utf8_lossy(&collected.lock().unwrap())
        );
    }
    manager
        .write(&id, b"\x1b[27;1;27;1;0;1_\x1b[27;1;27;0;0;1_")
        .unwrap();
    let exited = rx.recv_timeout(Duration::from_secs(15));
    if exited.is_err() {
        let _ = manager.kill(&id);
    }
    let text = String::from_utf8_lossy(&collected.lock().unwrap()).into_owned();
    assert!(
        exited.is_ok() && text.contains("VELA_ESCAPE_OK"),
        "{text:?}"
    );
    if shell == "powershell.exe" {
        assert!(text.contains("\x1b]7;file:///C:/"), "{text:?}");
        assert!(!text.contains("file:///C://"), "{text:?}");
    }
}

#[cfg(windows)]
#[test]
fn conpty_escape_powershell_and_agent_root_prompt() {
    let _guard = CONPTY_TEST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    assert_escape_reaches_application("powershell.exe", vec![
            "-NoLogo".into(), "-NoProfile".into(), "-Command".into(),
            "Set-Location C:\\; $null = prompt; [Console]::WriteLine('VELA_KEY_READY'); $k = [Console]::ReadKey($true); if ($k.Key -eq [ConsoleKey]::Escape) { [Console]::WriteLine('VELA_ESCAPE_OK') }".into(),
        ]);
}

#[cfg(windows)]
#[test]
fn conpty_escape_git_bash() {
    let _guard = CONPTY_TEST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let Some(shell) = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ]
    .into_iter()
    .find(|path| std::path::Path::new(path).exists()) else {
        return;
    };
    assert_escape_reaches_application(shell, vec![
            "--noprofile".into(), "--norc".into(), "-c".into(),
            "printf 'VELA_KEY_READY\\n'; IFS= read -r -s -n 1 key; if [[ \"$key\" == $'\\033' ]]; then printf '\\nVELA_ESCAPE_OK\\n'; fi".into(),
        ]);
}

#[cfg(windows)]
#[test]
fn conpty_git_bash_agent_host_runs_command_and_restores_shell() {
    let _guard = CONPTY_TEST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let Some(shell) = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ]
    .into_iter()
    .find(|path| std::path::Path::new(path).exists()) else {
        return;
    };
    use tauri::{Listener, Manager};
    let app = tauri::test::mock_app();
    let manager = PtyManager::new();
    let id = format!("agent-host-{}", uuid::Uuid::new_v4());
    let collected = Arc::new(Mutex::new(Vec::new()));
    let sink = collected.clone();
    let ack = manager.clone();
    let ack_id = id.clone();
    app.listen(format!("pty-output-{id}"), move |event| {
        let bytes: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
        sink.lock().unwrap().extend(&bytes);
        let _ = ack.acknowledge(&ack_id, bytes.len());
    });
    // Exercise the agent-to-interactive-shell handoff without executing user dotfiles.
    // Supervisor tests separately cover the shipped --login profile flags.
    manager
        .spawn(
            app.app_handle().clone(),
            id.clone(),
            shell.to_string(),
            vec![
                "--noprofile".into(),
                "--norc".into(),
                "-i".into(),
                "-c".into(),
                "echo VELA_AGENT_HOST_OK; exec bash --noprofile --norc -i".into(),
            ],
            std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            80,
            24,
        )
        .unwrap();
    manager.start_output(&id).unwrap();
    let deadline = Instant::now() + Duration::from_secs(25);
    while Instant::now() < deadline {
        let text = String::from_utf8_lossy(&collected.lock().unwrap()).into_owned();
        if text.contains("VELA_AGENT_HOST_OK") && text.contains("\x1b]7;file://") {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = manager.kill(&id);
    let text = String::from_utf8_lossy(&collected.lock().unwrap()).into_owned();
    assert!(text.contains("VELA_AGENT_HOST_OK"), "{text:?}");
    // The replacement shell must still report its directory through OSC 7.
    let Some(start) = text.find("\x1b]7;file://") else {
        panic!("expected an OSC 7 directory report, got {text:?}");
    };
    let payload = &text[start + "\x1b]7;file://".len()..];
    let payload = payload.split('\x07').next().unwrap_or_default();
    let host = payload.split('/').next().unwrap_or_default();
    assert!(
        !host.contains(':'),
        "OSC 7 host must not swallow the drive letter, got {payload:?}"
    );
}

#[cfg(windows)]
#[test]
fn credits_are_bounded_and_acknowledged() {
    let flow = OutputFlow::default();
    flow.state.lock().unwrap().ready = true;
    flow.reserve(OUTPUT_WINDOW).unwrap();
    assert_eq!(flow.state.lock().unwrap().pending, OUTPUT_WINDOW);
    assert!(flow.acknowledge(OUTPUT_WINDOW + 1).is_err());
    flow.acknowledge(OUTPUT_WINDOW).unwrap();
    flow.reserve(8192).unwrap();
    flow.stop();
    assert!(flow.reserve(1).is_err());
}
#[test]
fn stop_wakes_a_blocked_producer() {
    let flow = Arc::new(OutputFlow::default());
    let worker_flow = flow.clone();
    let worker = std::thread::spawn(move || worker_flow.reserve(8192));
    flow.stop();
    assert!(worker.join().unwrap().is_err());
}

#[cfg(windows)]
#[test]
fn native_conpty_streams_input_output_and_natural_exit() {
    let _guard = CONPTY_TEST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    use tauri::{Listener, Manager};
    let app = tauri::test::mock_app();
    let manager = PtyManager::new();
    let id = format!("test-{}", uuid::Uuid::new_v4());
    let collected = Arc::new(Mutex::new(Vec::new()));
    let captured = collected.clone();
    let ack_manager = manager.clone();
    let ack_id = id.clone();
    app.listen(format!("pty-output-{id}"), move |event| {
        let data: Vec<u8> = serde_json::from_str(event.payload()).unwrap();
        captured.lock().unwrap().extend_from_slice(&data);
        ack_manager.acknowledge(&ack_id, data.len()).unwrap();
    });
    let (tx, rx) = mpsc::channel();
    app.listen(format!("pty-exit-{id}"), move |_| {
        let _ = tx.send(());
    });
    let cwd = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .to_string();
    manager
        .spawn(
            app.app_handle().clone(),
            id.clone(),
            "cmd.exe".into(),
            vec!["/D".into(), "/Q".into()],
            cwd,
            80,
            24,
        )
        .unwrap();
    manager.start_output(&id).unwrap();
    manager
        .write(&id, b"echo VELA_NATIVE_STREAM_TEST\r\nexit 0\r\n")
        .unwrap();
    if rx.recv_timeout(Duration::from_secs(15)).is_err() {
        let _ = manager.kill(&id);
        panic!(
            "PTY did not exit; captured output: {:?}",
            String::from_utf8_lossy(&collected.lock().unwrap())
        );
    }
    assert!(String::from_utf8_lossy(&collected.lock().unwrap()).contains("VELA_NATIVE_STREAM_TEST"));
    assert!(manager.session(&id).is_err());
}

#[cfg(windows)]
#[test]
fn shutdown_cleans_a_terminal_even_before_reader_gate_opens() {
    let _guard = CONPTY_TEST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    use tauri::Manager;
    let app = tauri::test::mock_app();
    let manager = PtyManager::new();
    let id = format!("test-{}", uuid::Uuid::new_v4());
    let cwd = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .to_string();
    manager
        .spawn(
            app.app_handle().clone(),
            id.clone(),
            "cmd.exe".into(),
            vec!["/D".into(), "/Q".into()],
            cwd,
            80,
            24,
        )
        .unwrap();
    manager.shutdown().unwrap();
    assert!(manager.session(&id).is_err());
}

#[cfg(windows)]
fn assert_powershell_adds_line(newline: &[u8]) {
    use tauri::{Listener, Manager};
    let app = tauri::test::mock_app();
    let manager = PtyManager::new();
    let id = format!("test-shift-enter-{}", uuid::Uuid::new_v4());
    let collected = Arc::new(Mutex::new(Vec::new()));
    let sink = collected.clone();
    app.listen(format!("pty-output-{id}"), move |event: tauri::Event| {
        if let Ok(bytes) = serde_json::from_str::<Vec<u8>>(event.payload()) {
            sink.lock().unwrap().extend_from_slice(&bytes);
        }
    });
    let cwd = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .to_string();
    manager
        .spawn(
            app.app_handle().clone(),
            id.clone(),
            "powershell.exe".into(),
            vec!["-NoProfile".into(), "-NoLogo".into()],
            cwd,
            80,
            24,
        )
        .unwrap();
    manager.start_output(&id).unwrap();
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(15) {
        let s = String::from_utf8_lossy(&collected.lock().unwrap()).to_string();
        if s.contains("> ") {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    std::thread::sleep(Duration::from_millis(200));
    // Type first line; FIRST_OUT only appears in output once the line runs.
    manager
        .write(&id, b"Write-Host ('FIRST' + '_OUT')")
        .unwrap();
    std::thread::sleep(Duration::from_millis(100));
    manager.write(&id, newline).unwrap();
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(5)
        && !String::from_utf8_lossy(&collected.lock().unwrap()).contains(">>")
    {
        std::thread::sleep(Duration::from_millis(100));
    }
    let after_shift = String::from_utf8_lossy(&collected.lock().unwrap()).to_string();
    // First line must NOT have executed yet
    assert!(!after_shift.contains("FIRST_OUT"));
    // PSReadLine multiline prompt '>>' must appear
    assert!(after_shift.contains(">>"));

    // Type second line and press regular Enter (sends \r)
    manager
        .write(&id, b"Write-Host ('SECOND' + '_OUT')\rexit\r")
        .unwrap();
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(10)
        && !String::from_utf8_lossy(&collected.lock().unwrap()).contains("SECOND_OUT")
    {
        std::thread::sleep(Duration::from_millis(100));
    }
    let after_exec = String::from_utf8_lossy(&collected.lock().unwrap()).to_string();
    let _ = manager.kill(&id);
    // Both lines run in typed order. InsertLineAbove (unbound Ctrl+Enter) also
    // shows '>>' but puts the second line first.
    let first = after_exec
        .find("FIRST_OUT")
        .expect("first line did not run");
    let second = after_exec
        .find("SECOND_OUT")
        .expect("second line did not run");
    assert!(first < second, "lines ran out of order: {after_exec:?}");
}

#[cfg(windows)]
#[test]
fn conpty_shift_enter_powershell() {
    let _guard = CONPTY_TEST
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    // The Shift+Enter key record XTermView sends.
    assert_powershell_adds_line(b"\x1b[13;28;10;1;16;1_\x1b[13;28;10;0;16;1_");
    // Ctrl+J: xterm sends '\n', which ConPTY reports to PSReadLine as Ctrl+Enter.
    assert_powershell_adds_line(b"\n");
}
