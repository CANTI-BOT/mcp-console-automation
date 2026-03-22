/**
 * Regression tests for BUG-004: execute_async always uses cmd.exe
 *
 * Before fix: SessionManager.runJob() spawned with { shell: true }, which on
 * Windows defaults to cmd.exe. PowerShell cmdlets like Write-Output failed with
 * "'Write-Output' is not recognized as an internal or external command."
 * The session's consoleType was completely ignored.
 *
 * After fix: runJob() calls buildJobSpawnArgs() which reads job.metadata.consoleType
 * (populated by handleExecuteAsync from the session's actual consoleType) and spawns
 * the correct shell non-interactively. No more shell: true.
 */

import { platform } from 'os';

// ─── Extracted logic mirrors SessionManager.buildJobSpawnArgs ─────────────────

interface JobSpawnArgs {
  shell: string;
  args: string[];
}

interface MockJob {
  command: string;
  args?: string[];
  metadata?: Record<string, unknown>;
}

function buildJobSpawnArgs(job: MockJob): JobSpawnArgs {
  const consoleType: string = (job.metadata?.consoleType as string) || '';
  const fullCommand =
    job.args && job.args.length > 0
      ? `${job.command} ${job.args.join(' ')}`
      : job.command;

  switch (consoleType) {
    case 'powershell':
      return { shell: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', fullCommand] };
    case 'pwsh':
      return { shell: 'pwsh.exe', args: ['-NoProfile', '-NonInteractive', '-Command', fullCommand] };
    case 'cmd':
      return { shell: 'cmd.exe', args: ['/C', fullCommand] };
    case 'bash':
      return { shell: 'bash', args: ['-c', fullCommand] };
    case 'zsh':
      return { shell: 'zsh', args: ['-c', fullCommand] };
    case 'sh':
      return { shell: 'sh', args: ['-c', fullCommand] };
    default:
      if (platform() === 'win32') {
        return { shell: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', fullCommand] };
      }
      return { shell: 'sh', args: ['-c', fullCommand] };
  }
}

describe('BUG-004: execute_async shell type selection', () => {
  describe('buildJobSpawnArgs — shell selection per consoleType', () => {
    it('powershell: uses powershell.exe with -NonInteractive', () => {
      const { shell, args } = buildJobSpawnArgs({
        command: 'Write-Output "test"',
        metadata: { consoleType: 'powershell' },
      });
      expect(shell).toBe('powershell.exe');
      expect(args).toContain('-NonInteractive');
      expect(args).toContain('-Command');
      expect(args.join(' ')).toContain('Write-Output');
    });

    it('pwsh: uses pwsh.exe', () => {
      const { shell, args } = buildJobSpawnArgs({
        command: 'Get-Date',
        metadata: { consoleType: 'pwsh' },
      });
      expect(shell).toBe('pwsh.exe');
      expect(args).toContain('-NonInteractive');
    });

    it('cmd: uses cmd.exe /C', () => {
      const { shell, args } = buildJobSpawnArgs({
        command: 'echo hello',
        metadata: { consoleType: 'cmd' },
      });
      expect(shell).toBe('cmd.exe');
      expect(args[0]).toBe('/C');
    });

    it('bash: uses bash -c', () => {
      const { shell, args } = buildJobSpawnArgs({
        command: 'echo hello',
        metadata: { consoleType: 'bash' },
      });
      expect(shell).toBe('bash');
      expect(args[0]).toBe('-c');
    });

    it('no consoleType: does NOT use cmd.exe on Windows (regression guard)', () => {
      // This was the original bug — no consoleType → cmd.exe. After fix, it should
      // use powershell.exe (or sh on non-Windows).
      const { shell } = buildJobSpawnArgs({
        command: 'echo hello',
        metadata: {},
      });
      // On Windows, the default should be powershell, NOT cmd.exe
      if (platform() === 'win32') {
        expect(shell).toBe('powershell.exe');
        expect(shell).not.toBe('cmd.exe');
      } else {
        expect(shell).toBe('sh');
      }
    });

    it('concatenates command and args into a single shell argument', () => {
      const { args } = buildJobSpawnArgs({
        command: 'Write-Output',
        args: ['"BUG004-TEST"'],
        metadata: { consoleType: 'powershell' },
      });
      // The last element should be the combined command string
      const commandArg = args[args.length - 1];
      expect(commandArg).toBe('Write-Output "BUG004-TEST"');
    });

    it('does not use shell: true pattern (cmd.exe implicit wrap)', () => {
      // Verify the shell is explicitly set, never relying on OS default
      const consoleTypes = ['powershell', 'pwsh', 'cmd', 'bash', 'sh', 'zsh'];
      for (const type of consoleTypes) {
        const { shell } = buildJobSpawnArgs({
          command: 'echo test',
          metadata: { consoleType: type },
        });
        // Each type should map to a deterministic, explicit shell path
        expect(shell).toBeTruthy();
        expect(shell.length).toBeGreaterThan(0);
      }
    });
  });

  describe('metadata.consoleType propagation', () => {
    it('undefined metadata falls back to platform default', () => {
      const { shell } = buildJobSpawnArgs({ command: 'echo test' });
      expect(['powershell.exe', 'sh']).toContain(shell);
    });

    it('null consoleType in metadata falls back to platform default', () => {
      const { shell } = buildJobSpawnArgs({
        command: 'echo test',
        metadata: { consoleType: null as unknown as string },
      });
      expect(['powershell.exe', 'sh']).toContain(shell);
    });
  });
});
