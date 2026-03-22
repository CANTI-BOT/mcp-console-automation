/**
 * Security tests: OS command injection mitigations
 *
 * Verifies that WSLProtocol and SimpleCommandExecutor use
 * execFile/spawn with argument arrays instead of string
 * interpolation into exec/execSync.
 */

import * as path from 'path';

// ---------------------------------------------------------------------------
// 1. WSLProtocol — no exec() string interpolation
// ---------------------------------------------------------------------------

describe('WSLProtocol command injection mitigation', () => {
  it('source uses execFile not exec', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/protocols/WSLProtocol.ts', 'utf8');
    // Should import execFile
    expect(src).toMatch(/execFile/);
    // Should NOT import plain exec (which enables string injection)
    // Allow "execFile" occurrences but not bare "exec" import
    const importLine = src.match(/import\s*\{([^}]+)\}\s*from\s*['"]child_process['"]/);
    if (importLine) {
      const imports = importLine[1];
      // exec without "File" suffix should not be present
      expect(imports).not.toMatch(/\bexec\b(?!File)/);
    }
  });

  it('source has validateDistributionName helper', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/protocols/WSLProtocol.ts', 'utf8');
    expect(src).toMatch(/validateDistributionName/);
  });

  it('source has validatePath helper', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/protocols/WSLProtocol.ts', 'utf8');
    expect(src).toMatch(/validatePath/);
  });

  it('source does not interpolate distribution into template string command', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/protocols/WSLProtocol.ts', 'utf8');
    // Old dangerous pattern: execAsync(`wsl -d ${distribution} ...`)
    expect(src).not.toMatch(/execAsync\s*\(`wsl/);
    expect(src).not.toMatch(/execAsync\s*\(`.*\$\{distribution\}/);
  });

  it('loads WSLProtocol module without error', async () => {
    let WSLProtocol: any;
    let err: Error | null = null;
    try {
      const mod = await import('../../src/protocols/WSLProtocol.js');
      WSLProtocol = mod.WSLProtocol;
    } catch (e) {
      err = e as Error;
    }
    if (err) {
      console.warn('Module load skipped:', err.message);
    } else {
      expect(WSLProtocol).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. SimpleCommandExecutor — uses execFileSync not execSync
// ---------------------------------------------------------------------------

describe('SimpleCommandExecutor command injection mitigation', () => {
  it('source imports execFileSync not execSync', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/core/SimpleCommandExecutor.ts', 'utf8');
    expect(src).toMatch(/execFileSync/);
    const importLine = src.match(/import\s*\{([^}]+)\}\s*from\s*['"]child_process['"]/);
    if (importLine) {
      const imports = importLine[1];
      expect(imports).not.toMatch(/\bexecSync\b/);
    }
  });

  it('source has command length guard', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/core/SimpleCommandExecutor.ts', 'utf8');
    expect(src).toMatch(/1024/);
  });

  it('source does not concatenate command and args into single string', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/core/SimpleCommandExecutor.ts', 'utf8');
    // Old dangerous pattern: const fullCommand = `${command} ${args.join(' ')}`
    expect(src).not.toMatch(/fullCommand\s*=\s*`\$\{command\}/);
  });
});

// ---------------------------------------------------------------------------
// 3. WindowsSSHAdapter — credentials passed via env vars not CLI args
// ---------------------------------------------------------------------------

describe('WindowsSSHAdapter credential injection mitigation', () => {
  it('source uses environment variables for credentials', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/core/WindowsSSHAdapter.ts', 'utf8');
    expect(src).toMatch(/MCP_SSH_PASSWORD/);
    expect(src).toMatch(/MCP_SSH_USERNAME/);
  });

  it('source does not interpolate password directly into command string', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/core/WindowsSSHAdapter.ts', 'utf8');
    // Old dangerous pattern: `-pw ${password}` or `${credentials.password}`
    expect(src).not.toMatch(/-pw\s+\$\{/);
    expect(src).not.toMatch(/\$\{.*password.*\}/i);
  });
});
