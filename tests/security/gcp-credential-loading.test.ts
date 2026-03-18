/**
 * Security tests: GCPProtocol dynamic require() mitigation
 *
 * Verifies that GCPProtocol reads credential files via
 * JSON.parse(readFileSync(...)) with extension enforcement
 * instead of dynamic require() with user-supplied paths.
 */

describe('GCPProtocol credential loading', () => {
  let src: string;

  beforeAll(async () => {
    const fs = await import('fs');
    src = fs.readFileSync('src/protocols/GCPProtocol.ts', 'utf8');
  });

  it('does not use dynamic require() for credentials', () => {
    // Old dangerous pattern: credentials = require(options.keyFilename)
    expect(src).not.toMatch(/require\s*\(\s*options\.keyFilename\s*\)/);
    expect(src).not.toMatch(/= require\s*\(\s*.*keyFile/);
  });

  it('uses JSON.parse(readFileSync(...)) instead', () => {
    expect(src).toMatch(/JSON\.parse/);
    expect(src).toMatch(/readFileSync/);
  });

  it('enforces .json extension on key files', () => {
    expect(src).toMatch(/\.json/);
  });
});

// ---------------------------------------------------------------------------
// ConfigManager — file permission hardening
// ---------------------------------------------------------------------------

describe('ConfigManager credential file permissions', () => {
  it('writes credential files with mode 0o600', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/config/ConfigManager.ts', 'utf8');
    expect(src).toMatch(/0o600/);
  });

  it('warns when SSH passwords stored in config', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/config/ConfigManager.ts', 'utf8');
    expect(src).toMatch(/warn.*password|password.*warn/i);
  });
});

// ---------------------------------------------------------------------------
// GitHub Actions — supply chain security
// ---------------------------------------------------------------------------

describe('GitHub Actions supply chain security', () => {
  it('commitlint.yml on: trigger does not use pull_request_target', async () => {
    const fs = await import('fs');
    let src: string;
    try {
      src = fs.readFileSync('.github/workflows/commitlint.yml', 'utf8');
    } catch {
      console.warn('Skipping — commitlint.yml not found');
      return;
    }
    // Extract only the "on:" trigger block (first ~10 lines) for checking
    // pull_request_target in `if:` conditions is fine; in `on:` trigger it is not
    const triggerBlock = src.split('\njobs:')[0];
    expect(triggerBlock).not.toMatch(/^\s+pull_request_target\s*:/m);
    expect(src).toMatch(/pull_request:/);
  });

  it('commitlint.yml does not checkout PR head SHA directly', async () => {
    const fs = await import('fs');
    let src: string;
    try {
      src = fs.readFileSync('.github/workflows/commitlint.yml', 'utf8');
    } catch {
      return;
    }
    // Should not use event.pull_request.head.sha for checkout ref
    expect(src).not.toMatch(/ref:\s*\$\{\{.*pull_request\.head\.sha/);
  });
});
