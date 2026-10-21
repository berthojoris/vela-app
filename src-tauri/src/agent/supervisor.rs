use crate::models::{AgentType, ShellProfile};

pub struct AgentSupervisor;

impl AgentSupervisor {
    /// Provides preset shell and agent profiles.
    ///
    /// Plain shells come first so the default profile always launches a usable
    /// terminal. Agent profiles are only listed when their command exists on
    /// PATH, and every agent runs inside a shell so npm `.cmd` shims resolve.
    pub fn get_shell_profiles() -> Vec<ShellProfile> {
        let mut profiles = Vec::new();

        let (pwsh_id, pwsh_name, pwsh_bin) = if Self::check_binary_exists("pwsh.exe") {
            ("pwsh", "PowerShell 7", "pwsh.exe")
        } else {
            ("powershell", "Windows PowerShell", "powershell.exe")
        };

        profiles.push(ShellProfile {
            id: pwsh_id.to_string(),
            name: pwsh_name.to_string(),
            executable: pwsh_bin.to_string(),
            args: vec!["-NoLogo".to_string()],
            is_agent: false,
            agent_type: None,
        });

        profiles.push(ShellProfile {
            id: "cmd".to_string(),
            name: "Command Prompt".to_string(),
            executable: "cmd.exe".to_string(),
            args: vec![],
            is_agent: false,
            agent_type: None,
        });

        // Git Bash is only detected at the two standard install locations.
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

        // Extra flags are appended to the agent command; the PATH check only
        // looks at the bare command name.
        for (id, name, command, flags, agent_type) in [
            (
                "agent-opencode",
                "OpenCode",
                "opencode",
                "",
                AgentType::OpenCode,
            ),
            ("agent-droid", "Droid CLI", "droid", "", AgentType::DroidCli),
            (
                "agent-antigravity",
                "Antigravity",
                "agy",
                "",
                AgentType::Antigravity,
            ),
            // The project owner explicitly opted into skipping Claude Code's
            // permission prompts for this preset.
            (
                "agent-claude",
                "Claude Code",
                "claude",
                "--dangerously-skip-permissions",
                AgentType::ClaudeCode,
            ),
            (
                "agent-gemini",
                "Gemini CLI",
                "gemini",
                "",
                AgentType::GeminiCli,
            ),
            ("agent-aider", "Aider AI", "aider", "", AgentType::Aider),
            ("agent-codex", "Codex CLI", "codex", "", AgentType::Codex),
        ] {
            if Self::check_binary_exists(command) {
                profiles.push(Self::shell_agent_profile(
                    id, name, pwsh_bin, command, flags, agent_type,
                ));
            }
        }

        profiles
    }

    /// Agent CLIs are started by the shell: this resolves npm `.cmd` shims,
    /// which `CreateProcess` cannot launch directly.
    fn shell_agent_profile(
        id: &str,
        name: &str,
        shell_bin: &str,
        command: &str,
        flags: &str,
        agent_type: AgentType,
    ) -> ShellProfile {
        let command_line = if flags.is_empty() {
            command.to_string()
        } else {
            format!("{command} {flags}")
        };
        ShellProfile {
            id: id.to_string(),
            name: name.to_string(),
            executable: shell_bin.to_string(),
            args: vec![
                "-NoLogo".to_string(),
                "-NoExit".to_string(),
                "-Command".to_string(),
                command_line,
            ],
            is_agent: true,
            agent_type: Some(agent_type),
        }
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_shells_come_before_agents() {
        let profiles = AgentSupervisor::get_shell_profiles();
        let first_agent = profiles.iter().position(|profile| profile.is_agent);
        let last_shell = profiles.iter().rposition(|profile| !profile.is_agent);
        if let (Some(first_agent), Some(last_shell)) = (first_agent, last_shell) {
            assert!(last_shell < first_agent);
        }
        assert!(profiles
            .iter()
            .any(|profile| profile.id == "pwsh" || profile.id == "powershell"));
        assert!(profiles.iter().any(|profile| profile.id == "cmd"));
    }

    #[test]
    fn agent_profiles_run_through_the_shell() {
        let profiles = AgentSupervisor::get_shell_profiles();
        for profile in profiles.iter().filter(|profile| profile.is_agent) {
            let executable = profile.executable.to_ascii_lowercase();
            assert!(
                executable.ends_with("pwsh.exe") || executable.ends_with("powershell.exe"),
                "agent {} must run through a shell, got {}",
                profile.id,
                profile.executable
            );
            assert!(profile.args.iter().any(|arg| arg == "-Command"));
        }
    }

    #[test]
    fn claude_profile_skips_permission_prompts() {
        let profile = AgentSupervisor::shell_agent_profile(
            "agent-claude",
            "Claude Code",
            "pwsh.exe",
            "claude",
            "--dangerously-skip-permissions",
            AgentType::ClaudeCode,
        );
        assert_eq!(
            profile.args.last().map(String::as_str),
            Some("claude --dangerously-skip-permissions")
        );

        let plain = AgentSupervisor::shell_agent_profile(
            "agent-codex",
            "Codex CLI",
            "pwsh.exe",
            "codex",
            "",
            AgentType::Codex,
        );
        assert_eq!(plain.args.last().map(String::as_str), Some("codex"));
    }
}
