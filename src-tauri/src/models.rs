use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    ClaudeCode,
    GeminiCli,
    Aider,
    Codex,
    OpenCode,
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
