use crate::models::{AgentType, DetectedAgent, ShellProfile};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct AgentSupervisor;

impl AgentSupervisor {
    /// Detects installed AI coding agents in the system PATH
    pub fn detect_installed_agents() -> Vec<DetectedAgent> {
        let candidates = vec![
            (AgentType::ClaudeCode, "Claude Code CLI", "claude"),
            (AgentType::GeminiCli, "Gemini CLI", "gemini"),
            (AgentType::Aider, "Aider AI Pair Programmer", "aider"),
            (AgentType::Codex, "Codex CLI", "codex"),
            (AgentType::OpenCode, "OpenCode", "opencode"),
            (AgentType::DroidCli, "Droid CLI", "droid"),
            (AgentType::Antigravity, "Antigravity", "agy"),
        ];

        let mut detected = Vec::new();

        for (agent_type, name, bin) in candidates {
            let available = Self::check_binary_exists(bin);
            let version = if available {
                Self::get_binary_version(bin)
            } else {
                None
            };

            detected.push(DetectedAgent {
                agent_type,
                name: name.to_string(),
                executable: bin.to_string(),
                available,
                version,
            });
        }

        detected
    }

    /// Provides preset shell profiles including standard shells and detected AI agents
    pub fn get_shell_profiles() -> Vec<ShellProfile> {
        let mut profiles = Vec::new();

        let (pwsh_id, pwsh_name, pwsh_bin) = if Self::check_binary_exists("pwsh.exe") {
            ("pwsh", "PowerShell 7", "pwsh.exe")
        } else {
            ("powershell", "Windows PowerShell", "powershell.exe")
        };

        // 1. OpenCode agent profile: opens PowerShell terminal running `opencode`
        profiles.push(ShellProfile {
            id: "agent-opencode".to_string(),
            name: "OpenCode".to_string(),
            executable: pwsh_bin.to_string(),
            args: vec![
                "-NoLogo".to_string(),
                "-NoExit".to_string(),
                "-Command".to_string(),
                "opencode".to_string(),
            ],
            is_agent: true,
            agent_type: Some(AgentType::OpenCode),
        });

        // 2. Droid CLI agent profile: opens PowerShell terminal running `droid`
        profiles.push(ShellProfile {
            id: "agent-droid".to_string(),
            name: "Droid CLI".to_string(),
            executable: pwsh_bin.to_string(),
            args: vec![
                "-NoLogo".to_string(),
                "-NoExit".to_string(),
                "-Command".to_string(),
                "droid".to_string(),
            ],
            is_agent: true,
            agent_type: Some(AgentType::DroidCli),
        });

        // 3. Antigravity agent profile: opens PowerShell terminal running `agy`
        profiles.push(ShellProfile {
            id: "agent-antigravity".to_string(),
            name: "Antigravity".to_string(),
            executable: pwsh_bin.to_string(),
            args: vec![
                "-NoLogo".to_string(),
                "-NoExit".to_string(),
                "-Command".to_string(),
                "agy".to_string(),
            ],
            is_agent: true,
            agent_type: Some(AgentType::Antigravity),
        });

        // 4. PowerShell 7 (pwsh) or Windows PowerShell
        profiles.push(ShellProfile {
            id: pwsh_id.to_string(),
            name: pwsh_name.to_string(),
            executable: pwsh_bin.to_string(),
            args: vec!["-NoLogo".to_string()],
            is_agent: false,
            agent_type: None,
        });

        // 5. Command Prompt
        profiles.push(ShellProfile {
            id: "cmd".to_string(),
            name: "Command Prompt".to_string(),
            executable: "cmd.exe".to_string(),
            args: vec![],
            is_agent: false,
            agent_type: None,
        });

        // 6. Git Bash (if found in standard locations)
        let git_bash_paths = [
            "C:\\Program Files\\Git\\bin\\bash.exe",
            "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        ];
        for path in git_bash_paths {
            if std::path::Path::new(path).exists() {
                profiles.push(ShellProfile {
                    id: "git-bash".to_string(),
                    name: "Git Bash".to_string(),
                    executable: path.to_string(),
                    args: vec!["--login".to_string(), "-i".to_string()],
                    is_agent: false,
                    agent_type: None,
                });
                break;
            }
        }

        // 7. WSL
        if Self::check_binary_exists("wsl.exe") {
            profiles.push(ShellProfile {
                id: "wsl".to_string(),
                name: "WSL (Default Linux)".to_string(),
                executable: "wsl.exe".to_string(),
                args: vec![],
                is_agent: false,
                agent_type: None,
            });
        }

        // 8. Other detected AI Coding Agent Profiles
        if Self::check_binary_exists("claude") {
            profiles.push(ShellProfile {
                id: "agent-claude".to_string(),
                name: "Claude Code".to_string(),
                executable: "claude".to_string(),
                args: vec![],
                is_agent: true,
                agent_type: Some(AgentType::ClaudeCode),
            });
        }

        if Self::check_binary_exists("gemini") {
            profiles.push(ShellProfile {
                id: "agent-gemini".to_string(),
                name: "Gemini CLI".to_string(),
                executable: "gemini".to_string(),
                args: vec![],
                is_agent: true,
                agent_type: Some(AgentType::GeminiCli),
            });
        }

        if Self::check_binary_exists("aider") {
            profiles.push(ShellProfile {
                id: "agent-aider".to_string(),
                name: "Aider AI".to_string(),
                executable: "aider".to_string(),
                args: vec![],
                is_agent: true,
                agent_type: Some(AgentType::Aider),
            });
        }

        for (id, name, executable, agent_type) in [
            ("agent-codex", "Codex CLI", "codex", AgentType::Codex),
        ] {
            if Self::check_binary_exists(executable) {
                profiles.push(ShellProfile {
                    id: id.into(),
                    name: name.into(),
                    executable: executable.into(),
                    args: vec![],
                    is_agent: true,
                    agent_type: Some(agent_type),
                });
            }
        }

        profiles

    }

    /// Pure in-process binary lookup via PATH without spawning where.exe/cmd.exe
    pub fn check_binary_exists(bin: &str) -> bool {
        if let Ok(path_var) = std::env::var("PATH") {
            let pathext =
                std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".to_string());
            let exts: Vec<String> = pathext.split(';').map(|s| s.to_lowercase()).collect();

            for dir in std::env::split_paths(&path_var) {
                let candidate = dir.join(bin);
                if candidate.is_file() {
                    return true;
                }
                for ext in &exts {
                    let with_ext = dir.join(format!("{}{}", bin, ext));
                    if with_ext.is_file() {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn get_binary_version(bin: &str) -> Option<String> {
        let mut cmd = Command::new(bin);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let output = crate::process::output(
            cmd.arg("--version"),
            std::time::Duration::from_secs(5),
            64 * 1024,
        )
        .ok()?;
        if output.status.success() {
            let str_val = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !str_val.is_empty() {
                return Some(str_val);
            }
        }
        None
    }
}
