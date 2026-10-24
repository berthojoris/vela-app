use crate::models::{AgentType, ShellProfile};
use std::path::Path;

pub struct AgentSupervisor;

/// The shell that hosts an agent CLI.
///
/// Agents are started through a shell instead of directly, because npm installs
/// `.cmd` shims that `CreateProcess` cannot launch. The host shell is chosen per
/// agent: some CLIs expect POSIX semantics and misbehave under PowerShell.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum AgentHost {
    /// Windows PowerShell. The safe default for npm `.cmd` shims.
    PowerShell,
    /// Git Bash. Keeps Unix shell semantics for agents that expect them.
    GitBash,
}

/// Git Bash is only detected at the two standard install locations.
const GIT_BASH_PATHS: [&str; 2] = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
];

fn git_bash_executable() -> Option<&'static str> {
    GIT_BASH_PATHS
        .into_iter()
        .find(|path| Path::new(path).exists())
}

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
        let git_bash = git_bash_executable();
        if let Some(path) = git_bash {
            profiles.push(ShellProfile {
                id: "git-bash".to_string(),
                name: "Git Bash".to_string(),
                executable: path.to_string(),
                args: vec!["--login".to_string(), "-i".to_string()],
                is_agent: false,
                agent_type: None,
            });
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
        for (id, name, command, flags, host, agent_type) in [
            (
                "agent-opencode",
                "OpenCode",
                "opencode",
                "",
                AgentHost::PowerShell,
                AgentType::OpenCode,
            ),
            // Droid CLI is a Bun binary that drives its own tools through a POSIX
            // shell. Hosting it in Git Bash keeps those tools off PowerShell.
            (
                "agent-droid",
                "Droid CLI",
                "droid",
                "",
                AgentHost::GitBash,
                AgentType::DroidCli,
            ),
            (
                "agent-antigravity",
                "Antigravity",
                "agy",
                "",
                AgentHost::PowerShell,
                AgentType::Antigravity,
            ),
            // The project owner explicitly opted into skipping Claude Code's
            // permission prompts for this preset.
            (
                "agent-claude",
                "Claude Code",
                "claude",
                "--dangerously-skip-permissions",
                AgentHost::PowerShell,
                AgentType::ClaudeCode,
            ),
            (
                "agent-gemini",
                "Gemini CLI",
                "gemini",
                "",
                AgentHost::PowerShell,
                AgentType::GeminiCli,
            ),
            (
                "agent-aider",
                "Aider AI",
                "aider",
                "",
                AgentHost::PowerShell,
                AgentType::Aider,
            ),
            (
                "agent-codex",
                "Codex CLI",
                "codex",
                "",
                AgentHost::PowerShell,
                AgentType::Codex,
            ),
        ] {
            if !Self::check_binary_exists(command) {
                continue;
            }
            // A Git Bash host needs Git Bash; fall back to PowerShell otherwise.
            let (host, host_executable) = match host {
                AgentHost::PowerShell => (AgentHost::PowerShell, pwsh_bin),
                AgentHost::GitBash => match git_bash {
                    Some(bash) => (AgentHost::GitBash, bash),
                    None => (AgentHost::PowerShell, pwsh_bin),
                },
            };
            profiles.push(Self::shell_agent_profile(
                id,
                name,
                host,
                host_executable,
                command,
                flags,
                agent_type,
            ));
        }

        profiles
    }

    /// Agent CLIs are started by the shell: this resolves npm `.cmd` shims,
    /// which `CreateProcess` cannot launch directly.
    fn shell_agent_profile(
        id: &str,
        name: &str,
        host: AgentHost,
        host_executable: &str,
        command: &str,
        flags: &str,
        agent_type: AgentType,
    ) -> ShellProfile {
        let command_line = if flags.is_empty() {
            command.to_string()
        } else {
            format!("{command} {flags}")
        };
        let args = match host {
            AgentHost::PowerShell => vec![
                "-NoLogo".to_string(),
                "-NoExit".to_string(),
                "-Command".to_string(),
                command_line,
            ],
            AgentHost::GitBash => vec![
                "--login".to_string(),
                "-i".to_string(),
                "-c".to_string(),
                // Run the agent, then hand the terminal back to an interactive
                // Git Bash so the tab stays usable once the agent exits. The
                // replacement shell inherits PROMPT_COMMAND, so OSC 7 directory
                // tracking keeps working after the agent finishes.
                format!("{command_line}; exec bash -i"),
            ],
        };
        ShellProfile {
            id: id.to_string(),
            name: name.to_string(),
            executable: host_executable.to_string(),
            args,
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
    fn agent_profiles_run_through_a_shell() {
        let profiles = AgentSupervisor::get_shell_profiles();
        for profile in profiles.iter().filter(|profile| profile.is_agent) {
            let executable = profile.executable.to_ascii_lowercase();
            let is_powershell =
                executable.ends_with("pwsh.exe") || executable.ends_with("powershell.exe");
            let is_bash = executable.ends_with("bash.exe");
            assert!(
                is_powershell || is_bash,
                "agent {} must run through a shell, got {}",
                profile.id,
                profile.executable
            );
            // PowerShell hosts use `-Command`; Git Bash hosts use `-c` and hand the
            // terminal back to an interactive shell afterwards.
            if is_bash {
                assert!(
                    profile.args.iter().any(|arg| arg == "-c"),
                    "agent {}",
                    profile.id
                );
                assert!(
                    profile
                        .args
                        .last()
                        .map(|arg| arg.ends_with("; exec bash -i"))
                        == Some(true),
                    "agent {} must restore an interactive shell, got {:?}",
                    profile.id,
                    profile.args
                );
            } else {
                assert!(
                    profile.args.iter().any(|arg| arg == "-Command"),
                    "agent {}",
                    profile.id
                );
            }
        }
    }

    #[test]
    fn droid_profile_runs_in_git_bash_when_available() {
        let profiles = AgentSupervisor::get_shell_profiles();
        let Some(droid) = profiles.iter().find(|profile| profile.id == "agent-droid") else {
            assert!(
                !AgentSupervisor::check_binary_exists("droid"),
                "droid is on PATH but no profile was produced"
            );
            return;
        };
        match git_bash_executable() {
            Some(bash) => {
                assert_eq!(droid.executable, bash, "droid must be hosted by Git Bash");
                assert_eq!(
                    droid.args.last().map(String::as_str),
                    Some("droid; exec bash -i")
                );
            }
            None => {
                // Without Git Bash the preset has to fall back to PowerShell.
                assert!(
                    droid
                        .executable
                        .to_ascii_lowercase()
                        .ends_with("powershell.exe"),
                    "droid fell back to an unexpected host: {}",
                    droid.executable
                );
            }
        }
    }

    #[test]
    fn claude_profile_skips_permission_prompts() {
        let profile = AgentSupervisor::shell_agent_profile(
            "agent-claude",
            "Claude Code",
            AgentHost::PowerShell,
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
            AgentHost::PowerShell,
            "pwsh.exe",
            "codex",
            "",
            AgentType::Codex,
        );
        assert_eq!(plain.args.last().map(String::as_str), Some("codex"));
    }
}
