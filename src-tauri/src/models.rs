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

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "status", content = "data", rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Running {
        started_at: u64,
        task: String,
    },
    WaitingUserInput {
        prompt_preview: String,
    },
    Completed {
        duration_secs: u64,
    },
    Failed {
        exit_code: i32,
        error_summary: String,
    },
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
    pub agent_status: Option<AgentStatus>,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShellProfile {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub args: Vec<String>,
    pub is_agent: bool,
    pub agent_type: Option<AgentType>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedAgent {
    pub agent_type: AgentType,
    pub name: String,
    pub executable: String,
    pub available: bool,
    pub version: Option<String>,
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
            agent_status: None,
        };

        let value = serde_json::to_value(session).expect("terminal session should serialize");
        assert_eq!(value["worktree_id"], json!(null));
        assert_eq!(value["pid"], json!(null));
        assert_eq!(value["agent_type"], json!("open_code"));
        assert_eq!(value["agent_status"], json!(null));

        let ag_val = serde_json::to_value(AgentType::Antigravity).expect("agent type should serialize");
        assert_eq!(ag_val, json!("antigravity"));
    }

    #[test]
    fn agent_status_keeps_tagged_wire_shape() {
        let value = serde_json::to_value(AgentStatus::Running {
            started_at: 42,
            task: "index".into(),
        })
        .expect("agent status should serialize");

        assert_eq!(
            value,
            json!({
                "status": "running",
                "data": { "started_at": 42, "task": "index" }
            })
        );
    }
}
