import React from 'react';
import { Terminal, Bot } from 'lucide-react';
import { AgentType } from '../../types';

export interface TerminalIconProps {
  shell?: string;
  title?: string;
  isAgent?: boolean;
  agentType?: AgentType | null;
  className?: string;
}

/**
 * Git Bash icon (official Git orange diamond logo)
 */
export const GitBashIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <path
      fill="#F05032"
      d="M13.09 23.549a1.54 1.54 0 0 1-2.18 0L.451 13.089a1.54 1.54 0 0 1 0-2.179l7.191-7.19 2.733 2.733a1.85 1.85 0 0 0 .964 2.326v6.66a1.849 1.849 0 1 0 1.54 0V8.957l2.508 2.508a1.85 1.85 0 1 0 1.09-1.09l-2.634-2.634a1.85 1.85 0 0 0-2.378-2.377L8.73 2.63 10.91.451a1.54 1.54 0 0 1 2.179 0l10.459 10.46a1.54 1.54 0 0 1 0 2.179z"
    />
  </svg>
);

/**
 * Windows PowerShell icon
 */
export const PowerShellIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <rect width="22" height="18" x="1" y="3" rx="3" fill="#2563EB" />
    <path
      d="M5.5 7.5L10 12l-4.5 4.5h2.2l4.5-4.5-4.5-4.5H5.5zm6 8h6v1.5h-6z"
      fill="#FFFFFF"
    />
  </svg>
);

/**
 * Windows Command Prompt (CMD) icon
 */
export const CmdIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <rect width="22" height="18" x="1" y="3" rx="2.5" fill="#18181B" stroke="#3F3F46" strokeWidth="1.2" />
    <path
      d="M5 8.5l3.5 3.5L5 15.5h1.8l3.5-3.5L6.8 8.5H5zm5.5 6.5h5.5v1.4h-5.5z"
      fill="#E4E4E7"
    />
  </svg>
);

/**
 * WSL / Ubuntu Linux icon
 */
export const WslIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <path
      fill="#E95420"
      d="M17.61.455a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zM12.92.8C8.923.777 5.137 2.941 3.148 6.451a4.5 4.5 0 0 1 .26-.007 4.92 4.92 0 0 1 2.585.737A8.316 8.316 0 0 1 12.688 3.6 4.944 4.944 0 0 1 13.723.834 11.008 11.008 0 0 0 12.92.8zm9.226 4.994a4.915 4.915 0 0 1-1.918 2.246 8.36 8.36 0 0 1-.273 8.303 4.89 4.89 0 0 1 1.632 2.54 11.156 11.156 0 0 0 .559-13.089zM3.41 7.932A3.41 3.41 0 0 0 0 11.342a3.41 3.41 0 0 0 3.41 3.409 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zm2.027 7.866a4.908 4.908 0 0 1-2.915.358 11.1 11.1 0 0 0 7.991 6.698 11.234 11.234 0 0 0 2.422.249 4.879 4.879 0 0 1-.999-2.85 8.484 8.484 0 0 1-.836-.136 8.304 8.304 0 0 1-5.663-4.32zm11.405.928a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41z"
    />
  </svg>
);

/**
 * Claude Code CLI icon
 */
export const ClaudeIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <path
      fill="#D97757"
      d="M12 2a1.5 1.5 0 0 1 1.5 1.5v2.08a1.5 1.5 0 0 1-3 0V3.5A1.5 1.5 0 0 1 12 2zm6.364 3.05a1.5 1.5 0 0 1 .425 2.078l-1.47 2.023a1.5 1.5 0 1 1-2.503-1.653l1.47-2.023a1.5 1.5 0 0 1 2.078-.425zM22 12a1.5 1.5 0 0 1-1.5 1.5h-2.08a1.5 1.5 0 0 1 0-3h2.08A1.5 1.5 0 0 1 22 12zm-3.05 6.364a1.5 1.5 0 0 1-2.078.425l-2.023-1.47a1.5 1.5 0 1 1 1.653-2.503l2.023 1.47a1.5 1.5 0 0 1 .425 2.078zM12 22a1.5 1.5 0 0 1-1.5-1.5v-2.08a1.5 1.5 0 0 1 3 0v2.08A1.5 1.5 0 0 1 12 22zm-6.364-3.05a1.5 1.5 0 0 1-.425-2.078l1.47-2.023a1.5 1.5 0 1 1 2.503 1.653l-1.47 2.023a1.5 1.5 0 0 1-2.078.425zM2 12a1.5 1.5 0 0 1 1.5-1.5h2.08a1.5 1.5 0 0 1 0 3H3.5A1.5 1.5 0 0 1 2 12zm3.05-6.364a1.5 1.5 0 0 1 2.078-.425l2.023 1.47a1.5 1.5 0 1 1-1.653 2.503l-2.023-1.47a1.5 1.5 0 0 1-.425-2.078z"
    />
  </svg>
);

/**
 * Google Gemini CLI icon
 */
export const GeminiIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <path
      fill="url(#gemini-grad)"
      d="M12 1c.5 4.5 4 8 8.5 8.5-4.5.5-8 4-8.5 8.5-.5-4.5-4-8-8.5-8.5 4.5-.5 8-4 8.5-8.5z"
    />
    <defs>
      <linearGradient id="gemini-grad" x1="3.5" y1="1" x2="20.5" y2="18" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4285F4" />
        <stop offset="0.5" stopColor="#9B72CB" />
        <stop offset="1" stopColor="#D96570" />
      </linearGradient>
    </defs>
  </svg>
);

/**
 * Aider AI icon
 */
export const AiderIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <rect width="20" height="18" x="2" y="3" rx="3" fill="#10B981" />
    <circle cx="8" cy="10" r="2" fill="#FFFFFF" />
    <circle cx="16" cy="10" r="2" fill="#FFFFFF" />
    <path d="M7 16h10" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/**
 * OpenCode CLI icon (official brand identity mark)
 */
export const OpenCodeIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 240 300"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#38BDF8" />
    <path d="M180 240H60V120H180V240Z" fill="#0284C7" />
  </svg>
);

/** Droid CLI robot mark */
export const DroidIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
    aria-hidden="true"
  >
    <path d="M7 8 5.5 5.5M17 8l1.5-2.5" stroke="#5ED27A" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M5 11a7 7 0 0 1 14 0v5H5v-5Z" fill="#5ED27A" />
    <path d="M7 16v3m10-3v3M3.5 11v5m17-5v5" stroke="#5ED27A" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="9" cy="11.5" r="1" fill="#102418" />
    <circle cx="15" cy="11.5" r="1" fill="#102418" />
  </svg>
);

/**
 * Google Antigravity CLI (agy) icon
 */
export const AntigravityIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 16 15"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="antigravity-grad" x1="0" y1="15" x2="16" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#3186FF" />
        <stop offset="35%" stopColor="#00B95C" />
        <stop offset="70%" stopColor="#FFE432" />
        <stop offset="100%" stopColor="#FC413D" />
      </linearGradient>
    </defs>
    <path
      d="M14.0777 13.984C14.945 14.6345 16.2458 14.2008 15.0533 13.0084C11.476 9.53949 12.2349 0 7.79033 0C3.34579 0 4.10461 9.53949 0.527295 13.0084C-0.773543 14.3092 0.635692 14.6345 1.50293 13.984C4.86344 11.7076 4.64663 7.69664 7.79033 7.69664C10.934 7.69664 10.7172 11.7076 14.0777 13.984Z"
      fill="url(#antigravity-grad)"
    />
  </svg>
);

/**
 * Helper to identify shell/agent type
 */
export function detectTerminalType(params: {
  shell?: string;
  title?: string;
  isAgent?: boolean;
  agentType?: AgentType | null;
}): 'git-bash' | 'powershell' | 'cmd' | 'wsl' | 'claude' | 'gemini' | 'aider' | 'opencode' | 'droid' | 'antigravity' | 'agent' | 'terminal' {
  const isAgent = params.isAgent;
  const agentType = typeof params.agentType === 'string' ? params.agentType.toLowerCase() : params.agentType?.custom.toLowerCase() || '';
  const shell = params.shell?.toLowerCase() || '';
  const title = params.title?.toLowerCase() || '';

  if (agentType.includes('droid') || title.includes('droid') || shell.includes('droid')) return 'droid';

  if (
    agentType.includes('antigravity') ||
    agentType.includes('agy') ||
    title.includes('antigravity') ||
    title.includes('agy') ||
    shell.includes('antigravity') ||
    shell.includes('agy')
  ) {
    return 'antigravity';
  }

  if (isAgent || agentType) {
    if (agentType.includes('claude') || title.includes('claude') || shell.includes('claude')) return 'claude';
    if (agentType.includes('gemini') || title.includes('gemini') || shell.includes('gemini')) return 'gemini';
    if (agentType.includes('aider') || title.includes('aider') || shell.includes('aider')) return 'aider';
    if (
      agentType.includes('opencode') ||
      agentType.includes('open_code') ||
      title.includes('opencode') ||
      title.includes('open code')
    ) {
      return 'opencode';
    }
    return 'agent';
  }

  // OpenCode detection (title or command)
  if (
    title.includes('opencode') ||
    title.includes('open code') ||
    shell.includes('opencode')
  ) {
    return 'opencode';
  }

  // Git Bash detection (matches executable, path, or title)
  if (
    shell.includes('bash.exe') ||
    shell.includes('git-bash') ||
    shell.endsWith('/bash') ||
    shell.endsWith('\\bash') ||
    title.includes('git bash') ||
    title.includes('git-bash')
  ) {
    return 'git-bash';
  }

  // PowerShell detection
  if (
    shell.includes('powershell') ||
    shell.includes('pwsh') ||
    title.includes('powershell') ||
    title.includes('pwsh')
  ) {
    return 'powershell';
  }

  // Command Prompt detection
  if (
    shell.includes('cmd.exe') ||
    title.includes('command prompt') ||
    title.toLowerCase() === 'cmd'
  ) {
    return 'cmd';
  }

  // WSL / Ubuntu detection
  if (
    shell.includes('wsl.exe') ||
    shell.includes('ubuntu') ||
    title.includes('wsl') ||
    title.includes('ubuntu')
  ) {
    return 'wsl';
  }

  return 'terminal';
}

/**
 * Universal terminal icon component for tabs, dropdowns, and launch selectors
 */
export const TerminalIcon: React.FC<TerminalIconProps> = ({
  shell,
  title,
  isAgent,
  agentType,
  className = 'w-3.5 h-3.5',
}) => {
  const type = detectTerminalType({ shell, title, isAgent, agentType });

  switch (type) {
    case 'git-bash':
      return <GitBashIcon className={className} />;
    case 'powershell':
      return <PowerShellIcon className={className} />;
    case 'cmd':
      return <CmdIcon className={className} />;
    case 'wsl':
      return <WslIcon className={className} />;
    case 'claude':
      return <ClaudeIcon className={className} />;
    case 'gemini':
      return <GeminiIcon className={className} />;
    case 'aider':
      return <AiderIcon className={className} />;
    case 'opencode':
      return <OpenCodeIcon className={className} />;
    case 'droid':
      return <DroidIcon className={className} />;
    case 'antigravity':
      return <AntigravityIcon className={className} />;
    case 'agent':
      return <Bot className={`${className} text-orca-emerald shrink-0`} />;
    case 'terminal':
    default:
      return <Terminal className={`${className} text-orca-muted shrink-0`} />;
  }
};
