use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    ClaudeCode,
    GeminiCli,
    Aider,
    Codex,
    OpenCode,
    DroidCli,
    Antigravity,
    Custom(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerminalSession {
    pub id: String,
    pub title: String,
    pub shell: String,
    pub cwd: String,
    pub worktree_id: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub pid: Option<u32>,
    pub is_agent: bool,
    pub agent_type: Option<AgentType>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitWorktree {
    pub id: String,
    pub name: String,
    pub path: String,
    pub branch: String,
    pub is_main: bool,
    pub dirty_files_count: usize,
    pub active_agent_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileDiff {
    pub path: String,
    pub status: String, // "M", "A", "D", "R"
    pub additions: usize,
    pub deletions: usize,
    pub diff_content: String,
}

/// Lightweight changed-file entry for the sidebar: status and line counts, no patch text.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorktreeChanges {
    /// All changed entries reported by git status; `files` may be capped below this.
    pub total: usize,
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShellProfile {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub args: Vec<String>,
    pub is_agent: bool,
    pub agent_type: Option<AgentType>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn optional_terminal_fields_serialize_as_null_and_agent_types_as_snake_case() {
        let session = TerminalSession {
            id: "term-test".into(),
            title: "Test".into(),
            shell: "pwsh.exe".into(),
            cwd: "C:/repo".into(),
            worktree_id: None,
            cols: 80,
            rows: 24,
            pid: None,
            is_agent: true,
            agent_type: Some(AgentType::OpenCode),
        };

        let value = serde_json::to_value(session).expect("terminal session should serialize");
        assert_eq!(value["worktree_id"], json!(null));
        assert_eq!(value["pid"], json!(null));
        assert_eq!(value["agent_type"], json!("open_code"));

        let ag_val =
            serde_json::to_value(AgentType::Antigravity).expect("agent type should serialize");
        assert_eq!(ag_val, json!("antigravity"));
    }
}
