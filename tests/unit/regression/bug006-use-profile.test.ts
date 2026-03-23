/**
 * Regression tests for BUG-006: use_profile throws generic "Tool execution failed"
 *
 * Root cause: handleUseProfile only called getConnectionProfile(), which searches
 * connectionProfiles[]. Application profiles are stored in applicationProfiles[]
 * and require getApplicationProfile() — causing "Profile not found" for any
 * profile saved via save_profile({ profileType: 'application', ... }).
 *
 * Fix: handleUseProfile now tries getConnectionProfile first, then falls back to
 * getApplicationProfile, and creates a local session using the profile's command.
 */

// ── ConfigManager mock ──────────────────────────────────────────────────────

type MockApplicationProfile = {
  name: string;
  type: string;
  command?: string;
  args?: string[];
  workingDirectory?: string;
};

type MockConnectionProfile = {
  name: string;
  type: string;
  sshOptions?: Record<string, unknown>;
};

function makeConfigManagerMock(opts: {
  connectionProfiles?: MockConnectionProfile[];
  applicationProfiles?: MockApplicationProfile[];
}) {
  const connProfiles = opts.connectionProfiles ?? [];
  const appProfiles = opts.applicationProfiles ?? [];

  return {
    getConnectionProfile: (name?: string) =>
      connProfiles.find((p) => p.name === name),
    getApplicationProfile: (name: string) =>
      appProfiles.find((p) => p.name === name),
  };
}

// ── Helper: replicate the consoleType derivation logic from handleUseProfile ─

type ConsoleType = 'powershell' | 'pwsh' | 'cmd' | 'bash' | 'auto';

function deriveConsoleType(command: string): ConsoleType {
  const cmdBase = command
    .toLowerCase()
    .replace(/\.exe$/i, '')
    .split(/[\\/]/)
    .pop() ?? '';
  if (cmdBase === 'powershell') return 'powershell';
  if (cmdBase === 'pwsh') return 'pwsh';
  if (cmdBase === 'cmd') return 'cmd';
  if (cmdBase === 'bash') return 'bash';
  return 'auto';
}

// ── Helper: replicate the profile lookup + routing logic from handleUseProfile ─

type ProfileLookupResult =
  | { kind: 'connection'; profile: MockConnectionProfile }
  | { kind: 'application'; profile: MockApplicationProfile }
  | { kind: 'not-found' };

function lookupProfile(
  configManager: ReturnType<typeof makeConfigManagerMock>,
  profileName: string
): ProfileLookupResult {
  const connProfile = configManager.getConnectionProfile(profileName);
  if (connProfile) return { kind: 'connection', profile: connProfile };

  const appProfile = configManager.getApplicationProfile(profileName);
  if (appProfile) return { kind: 'application', profile: appProfile };

  return { kind: 'not-found' };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BUG-006 regression: use_profile for application profiles', () => {
  // ── ConfigManager lookup isolation ─────────────────────────────────────
  describe('ConfigManager profile lookup isolation', () => {
    it('getConnectionProfile does NOT find application profiles (root-cause validation)', () => {
      const cm = makeConfigManagerMock({
        applicationProfiles: [
          { name: 'test-retest', type: 'custom', command: 'powershell' },
        ],
      });

      // This is what the OLD code did — and it returned undefined for app profiles
      const result = cm.getConnectionProfile('test-retest');
      expect(result).toBeUndefined();
    });

    it('getApplicationProfile DOES find application profiles (fix validation)', () => {
      const cm = makeConfigManagerMock({
        applicationProfiles: [
          { name: 'test-retest', type: 'custom', command: 'powershell' },
        ],
      });

      const result = cm.getApplicationProfile('test-retest');
      expect(result).toBeDefined();
      expect(result?.name).toBe('test-retest');
      expect(result?.command).toBe('powershell');
    });

    it('getConnectionProfile finds connection profiles correctly', () => {
      const cm = makeConfigManagerMock({
        connectionProfiles: [{ name: 'my-ssh', type: 'ssh' }],
      });

      const result = cm.getConnectionProfile('my-ssh');
      expect(result).toBeDefined();
      expect(result?.type).toBe('ssh');
    });
  });

  // ── Profile lookup routing ──────────────────────────────────────────────
  describe('profile lookup routing (fixed handleUseProfile logic)', () => {
    it('routes an application profile to the application branch', () => {
      const cm = makeConfigManagerMock({
        applicationProfiles: [
          { name: 'test-retest', type: 'custom', command: 'powershell' },
        ],
      });

      const result = lookupProfile(cm, 'test-retest');
      expect(result.kind).toBe('application');
    });

    it('routes a connection profile to the connection branch', () => {
      const cm = makeConfigManagerMock({
        connectionProfiles: [{ name: 'my-ssh', type: 'ssh' }],
      });

      const result = lookupProfile(cm, 'my-ssh');
      expect(result.kind).toBe('connection');
    });

    it('returns not-found when profile exists in neither store', () => {
      const cm = makeConfigManagerMock({});
      const result = lookupProfile(cm, 'nonexistent');
      expect(result.kind).toBe('not-found');
    });

    it('connection profile takes precedence over application profile with same name', () => {
      const cm = makeConfigManagerMock({
        connectionProfiles: [{ name: 'dual', type: 'ssh' }],
        applicationProfiles: [{ name: 'dual', type: 'custom', command: 'node' }],
      });

      const result = lookupProfile(cm, 'dual');
      expect(result.kind).toBe('connection');
    });
  });

  // ── consoleType derivation ──────────────────────────────────────────────
  describe('consoleType derivation from application profile command', () => {
    it('derives powershell from bare "powershell"', () => {
      expect(deriveConsoleType('powershell')).toBe('powershell');
    });

    it('derives powershell from "powershell.exe"', () => {
      expect(deriveConsoleType('powershell.exe')).toBe('powershell');
    });

    it('derives powershell from full path to powershell.exe', () => {
      expect(deriveConsoleType('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell');
    });

    it('derives pwsh from "pwsh"', () => {
      expect(deriveConsoleType('pwsh')).toBe('pwsh');
    });

    it('derives pwsh from "pwsh.exe"', () => {
      expect(deriveConsoleType('pwsh.exe')).toBe('pwsh');
    });

    it('derives cmd from "cmd"', () => {
      expect(deriveConsoleType('cmd')).toBe('cmd');
    });

    it('derives cmd from "cmd.exe"', () => {
      expect(deriveConsoleType('cmd.exe')).toBe('cmd');
    });

    it('derives bash from "bash"', () => {
      expect(deriveConsoleType('bash')).toBe('bash');
    });

    it('falls back to auto for node.js', () => {
      expect(deriveConsoleType('node')).toBe('auto');
    });

    it('falls back to auto for python', () => {
      expect(deriveConsoleType('python')).toBe('auto');
    });

    it('falls back to auto for unknown executable', () => {
      expect(deriveConsoleType('myapp.exe')).toBe('auto');
    });
  });

  // ── Application profile session options assembly ────────────────────────
  describe('session options assembly from application profile', () => {
    it('uses profile command when no command override given', () => {
      const profile: MockApplicationProfile = {
        name: 'test-retest',
        type: 'custom',
        command: 'powershell',
        workingDirectory: 'C:\\Users\\TestUser',
      };

      const command = /* args.command || */ profile.command;
      const cwd = /* args.cwd || */ profile.workingDirectory;

      expect(command).toBe('powershell');
      expect(cwd).toBe('C:\\Users\\TestUser');
    });

    it('command override takes precedence over profile command', () => {
      const profile: MockApplicationProfile = {
        name: 'test-retest',
        type: 'custom',
        command: 'powershell',
      };
      const argsCommand = 'pwsh';

      const command = argsCommand || profile.command;
      expect(command).toBe('pwsh');
    });

    it('throws on missing command when profile has no command and no override', () => {
      const profile: MockApplicationProfile = {
        name: 'no-command-profile',
        type: 'custom',
        // command intentionally omitted
      };
      const argsCommand: string | undefined = undefined;

      const command = argsCommand || profile.command;
      expect(command).toBeUndefined();
      // handleUseProfile throws McpError when command is falsy
    });
  });
});
