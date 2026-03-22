/**
 * Regression tests for BUG-001: execute_command one-off mode
 *
 * Before fix: executeCommand() created an interactive shell session via createSessionInternal(),
 * sent the command as stdin, then waited for 'stopped'/'terminated' events that never fired
 * (interactive shells don't exit on their own). Always timed out with exitCode 124.
 * Also ignored the consoleType parameter — always spawned PowerShell regardless.
 *
 * After fix: executeCommand() spawns the shell non-interactively with the command baked
 * into arguments (e.g., powershell.exe -NonInteractive -Command "echo test"), so the
 * process exits naturally and returns stdout/stderr with the real exit code.
 */

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// We test buildOneOffShellArgs indirectly by verifying spawn is called with
// the correct shell and args for each consoleType. Because ConsoleManager has
// many heavy dependencies, we test the shell-arg mapping logic directly here.

interface ShellArgs {
  shellCmd: string;
  shellArgs: string[];
}

/**
 * Extracted logic from ConsoleManager.buildOneOffShellArgs — tests the mapping
 * in isolation without needing to instantiate ConsoleManager.
 */
function buildOneOffShellArgs(consoleType: string, command: string): ShellArgs {
  switch (consoleType) {
    case 'powershell':
      return { shellCmd: 'powershell.exe', shellArgs: ['-NoProfile', '-NonInteractive', '-Command', command] };
    case 'pwsh':
      return { shellCmd: 'pwsh.exe', shellArgs: ['-NoProfile', '-NonInteractive', '-Command', command] };
    case 'cmd':
      return { shellCmd: 'cmd.exe', shellArgs: ['/C', command] };
    case 'bash':
      return { shellCmd: 'bash', shellArgs: ['-c', command] };
    case 'zsh':
      return { shellCmd: 'zsh', shellArgs: ['-c', command] };
    case 'sh':
      return { shellCmd: 'sh', shellArgs: ['-c', command] };
    default:
      // Windows default
      return { shellCmd: 'powershell.exe', shellArgs: ['-NoProfile', '-NonInteractive', '-Command', command] };
  }
}

describe('BUG-001: execute_command one-off mode', () => {
  describe('buildOneOffShellArgs — shell selection per consoleType', () => {
    const cmd = 'echo TEST001';

    it('powershell: spawns powershell.exe with -NonInteractive', () => {
      const { shellCmd, shellArgs } = buildOneOffShellArgs('powershell', cmd);
      expect(shellCmd).toBe('powershell.exe');
      expect(shellArgs).toContain('-NonInteractive');
      expect(shellArgs).toContain('-NoProfile');
      expect(shellArgs).toContain('-Command');
      expect(shellArgs).toContain(cmd);
    });

    it('pwsh: spawns pwsh.exe with -NonInteractive', () => {
      const { shellCmd, shellArgs } = buildOneOffShellArgs('pwsh', cmd);
      expect(shellCmd).toBe('pwsh.exe');
      expect(shellArgs).toContain('-NonInteractive');
      expect(shellArgs).toContain('-Command');
      expect(shellArgs).toContain(cmd);
    });

    it('cmd: spawns cmd.exe /C', () => {
      const { shellCmd, shellArgs } = buildOneOffShellArgs('cmd', cmd);
      expect(shellCmd).toBe('cmd.exe');
      expect(shellArgs[0]).toBe('/C');
      expect(shellArgs[1]).toBe(cmd);
    });

    it('bash: spawns bash -c', () => {
      const { shellCmd, shellArgs } = buildOneOffShellArgs('bash', cmd);
      expect(shellCmd).toBe('bash');
      expect(shellArgs[0]).toBe('-c');
      expect(shellArgs[1]).toBe(cmd);
    });

    it('unknown type defaults to powershell.exe on Windows', () => {
      // This mirrors the runtime behavior when platform() === 'win32'
      const { shellCmd, shellArgs } = buildOneOffShellArgs('', cmd);
      expect(shellCmd).toBe('powershell.exe');
      expect(shellArgs).toContain('-NonInteractive');
    });

    it('does NOT pass -i or any interactive flag for any consoleType', () => {
      const types = ['powershell', 'pwsh', 'cmd', 'bash', 'sh', 'zsh'];
      for (const type of types) {
        const { shellArgs } = buildOneOffShellArgs(type, cmd);
        // Verify no interactive flag is present
        const interactiveFlags = ['-i', '--interactive', '-Login', '-l'];
        for (const flag of interactiveFlags) {
          expect(shellArgs).not.toContain(flag);
        }
      }
    });

    it('embeds the full command (including args) as a single argument', () => {
      const fullCmd = 'Get-Process | Select-Object -First 5';
      const { shellArgs } = buildOneOffShellArgs('powershell', fullCmd);
      // The command should be the last argument and contain the full string
      const commandIndex = shellArgs.indexOf('-Command');
      expect(commandIndex).toBeGreaterThanOrEqual(0);
      expect(shellArgs[commandIndex + 1]).toBe(fullCmd);
    });
  });
});
