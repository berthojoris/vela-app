use portable_pty::CommandBuilder;

/// Startup script for PowerShell tabs and agent hosts. It must only use core cmdlets and .NET
/// calls: see `configure_shell` for why module lookups are avoided.
const POWERSHELL_INIT: &str = concat!(
    "try { if (-not ${alias:oc} -and -not ${function:oc}) { function global:oc { opencode @args } } } catch {}; ",
    "try { if (-not (Get-Module PSReadLine)) { & { ",
    "$best = $null; $bestVersion = [version]'0.0'; ",
    "$roots = if ($PSVersionTable.PSEdition -eq 'Core') { @([IO.Path]::Combine($PSHOME, 'Modules', 'PSReadLine')) } ",
    "else { @([IO.Path]::Combine($env:ProgramFiles, 'WindowsPowerShell', 'Modules', 'PSReadLine'), [IO.Path]::Combine($PSHOME, 'Modules', 'PSReadLine')) }; ",
    "foreach ($root in $roots) { if ([IO.Directory]::Exists($root)) { ",
    "foreach ($file in [IO.Directory]::GetFiles($root, 'PSReadLine.psd1', [IO.SearchOption]::AllDirectories)) { ",
    "$version = [version]'0.0'; [void][version]::TryParse([IO.Path]::GetFileName([IO.Path]::GetDirectoryName($file)), [ref]$version); ",
    "if ($null -eq $best -or $version -gt $bestVersion) { $best = $file; $bestVersion = $version } } } }; ",
    "if ($best) { Import-Module $best -Global -ErrorAction SilentlyContinue } ",
    "else { Import-Module PSReadLine -Global -ErrorAction SilentlyContinue } } }; ",
    "if (Get-Module PSReadLine) { ",
    "Set-PSReadLineKeyHandler -Chord 'Shift+Enter' -Function AddLine -ErrorAction SilentlyContinue; ",
    "Set-PSReadLineKeyHandler -Chord 'Ctrl+Enter' -Function AddLine -ErrorAction SilentlyContinue } } catch {}; ",
);

const POWERSHELL_PROMPT: &str = concat!(
    "$global:__VelaOriginalPrompt = $function:prompt; function global:prompt { ",
    "try { if ($PWD.Provider.Name -eq 'FileSystem') { $p = $PWD.ProviderPath; ",
    "if (-not $p.EndsWith([IO.Path]::DirectorySeparatorChar)) { $p += [IO.Path]::DirectorySeparatorChar }; $u = [uri]$p; ",
    "[Console]::Write(([char]27) + ']7;' + $u.AbsoluteUri + ([char]7)) } } catch {} ; ",
    "if ($global:__VelaOriginalPrompt) { & $global:__VelaOriginalPrompt } else { 'PS ' + $PWD + '> ' } }",
);

pub(super) fn configure_shell(command: &mut CommandBuilder, shell: &str, args: &[String]) {
    let binary = shell
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(shell)
        .to_ascii_lowercase();
    if matches!(
        binary.as_str(),
        "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe"
    ) {
        command.args(powershell_args(args));
    } else {
        command.args(args);
    }
    if matches!(binary.as_str(), "cmd" | "cmd.exe") {
        command.env(
            "PROMPT",
            format!(
                "$E]7;file:///$P$E\\{}",
                std::env::var("PROMPT").unwrap_or_else(|_| "$P$G".into())
            ),
        );
    } else if matches!(binary.as_str(), "bash" | "bash.exe") {
        let previous = std::env::var("PROMPT_COMMAND").unwrap_or_default();
        // `$PWD` is normally MSYS style (`/c/dir`), but a Windows-native parent can
        // hand bash a `C:/dir` value. That would produce `file://hostC:/dir`, which
        // has no host separator and parses as a bogus UNC path. Normalise to a
        // leading slash so the file URL always separates host from path.
        command.env(
            "PROMPT_COMMAND",
            format!(
                "__vela_pwd=\"$PWD\"; case \"$__vela_pwd\" in [A-Za-z]:*) __vela_pwd=\"/$__vela_pwd\";; esac; printf '\\033]7;file://%s%s\\007' \"${{HOSTNAME:-localhost}}\" \"$__vela_pwd\"; unset __vela_pwd; {previous}"
            ),
        );
    }
}

fn powershell_args(args: &[String]) -> Vec<String> {
    if let Some(index) = args
        .iter()
        .position(|arg| matches!(arg.to_ascii_lowercase().as_str(), "-command" | "-c"))
    {
        if index + 2 == args.len() {
            let mut result = args[..=index].to_vec();
            // Finite -Command launches need directory integration, not an interactive
            // line editor. Avoid loading PSReadLine before commands such as ReadKey.
            let readline = if args[..index]
                .iter()
                .any(|arg| arg.eq_ignore_ascii_case("-NoExit"))
            {
                POWERSHELL_INIT
            } else {
                ""
            };
            result.push(format!(
                "{readline}{POWERSHELL_PROMPT}; {}",
                args[index + 1]
            ));
            return result;
        }
        return args.to_vec();
    }
    if args.iter().all(|arg| {
        !matches!(
            arg.to_ascii_lowercase().as_str(),
            "-command" | "-c" | "-file" | "-f" | "-encodedcommand" | "-enc"
        )
    }) {
        // XTermView sends Shift+Enter as a Win32 Shift+Enter key record. xterm sends
        // Ctrl+J as '\n', which ConPTY reports as Ctrl+Enter (InsertLineAbove).
        // Any by-name module lookup (`Get-Module -ListAvailable`, `Import-Module
        // PSReadLine`, or autoloading a non-core cmdlet such as Set-Alias) probes every
        // PSModulePath entry, and a Documents folder redirected to an unreachable share
        // stalls startup for minutes. Load PSReadLine from its local install path using
        // only core cmdlets and .NET; fall back to a by-name import only if it is absent.
        let mut result = args.to_vec();
        result.extend([
            "-NoExit".into(),
            "-Command".into(),
            format!("{POWERSHELL_INIT}{POWERSHELL_PROMPT}"),
        ]);
        result
    } else {
        args.to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn agent_commands_receive_prompt_integration_without_changing_permission_flags() {
        let args = vec![
            "-NoExit".into(),
            "-Command".into(),
            "claude --dangerously-skip-permissions".into(),
        ];
        let integrated = powershell_args(&args);
        assert_eq!(&integrated[..2], &args[..2]);
        assert!(integrated[2].starts_with(POWERSHELL_INIT));
        assert!(integrated[2].ends_with("; claude --dangerously-skip-permissions"));
        let plain = vec!["-NoProfile".into(), "-File".into(), "script.ps1".into()];
        assert_eq!(powershell_args(&plain), plain);
        let finite = powershell_args(&[
            "-NoProfile".into(),
            "-Command".into(),
            "Write-Output done".into(),
        ]);
        assert!(finite[2].starts_with(POWERSHELL_PROMPT));
        assert!(!finite[2].contains("Import-Module"));
    }
}
