# Claude Development Guidelines

## Project Information
- **Repository**: https://github.com/ooples/console-automation-mcp
- **Description**: Console Automation MCP - A tool for managing console sessions with SSH support
- **Important**: This is the ooples/console-automation-mcp project (formerly mcp-console-automation)
- **Deployed to**: `%USERPROFILE%\mcp-servers\console-automation-mcp\` (dist only — no src)

## Important Rules

### Code Organization and Improvements

1. **NO SEPARATE "IMPROVED" VERSIONS**: When making enhancements or fixes:
   - Always modify the original file or class directly
   - Do NOT create separate "Improved", "Enhanced", "Fixed" or similar versions
   - Maintain a single source of truth for each component
   - If significant changes are needed, refactor the existing code instead of duplicating

2. **Version Management**:
   - Use version control (git) for tracking changes, not file duplication
   - Keep the codebase clean and maintainable with single implementations
   - Document major changes in comments or commit messages, not separate files

3. **Testing and Validation**:
   - Always run lint and typecheck commands after making changes
   - Test changes thoroughly before considering work complete
   - Run: `npm run build` (tsc) to compile — lint/typecheck included

4. **Deployment Workflow**:
   - Source of truth: this directory (COWORK copy)
   - After any source change: `npm run build` then robocopy dist → mcp-servers
   - `robocopy ".\dist" "%USERPROFILE%\mcp-servers\console-automation-mcp\dist" /E /PURGE /NP`
   - Restart Claude Desktop after deploying

## Project-Specific Guidelines

### Console Automation MCP (ooples/console-automation-mcp)

- This project handles console session management with comprehensive diagnostics
- Original working version available at: https://github.com/ooples/console-automation-mcp
- Previous package name was mcp-console-automation (maintained for backward compatibility)
- Key components:
  - ConsoleManager: Core session management
  - DiagnosticsManager: Diagnostic tracking and reporting
  - SessionValidator: Session health validation

### Session Management Best Practices

- Properly handle both one-shot and persistent sessions
- Validate session state before operations
- Clean up resources and handle errors gracefully
- Track session lifecycle events for diagnostics

---

## CANTINET Fix Log — 2026-03-20

### Problem
When Claude Desktop spawns the MCP server process, `process.cwd()` resolves to
`C:\WINDOWS\system32` (Windows default for GUI-spawned child processes). Any code
that used `process.cwd()` or relative paths (`'./diagnostics'`) to create directories
or files would immediately crash with `EPERM: operation not permitted`.

### Root Cause Pattern
All five affected locations used `process.cwd()` or relative paths to construct
filesystem paths that were then passed to `mkdirSync`, `appendFileSync`, or
`writeFileSync` at startup — before any user-supplied working directory could be set.

### Files Modified & Changes Made

#### `src/utils/logger.ts`
- **Before**: `path.join(process.cwd(), 'logs')`
- **After**: `path.join(process.env.APPDATA || path.dirname(process.argv[1] || process.cwd()), 'console-automation-mcp', 'logs')`
- **Why**: Logger initializes at module load time; needs an absolute, writable path regardless of cwd.

#### `src/core/DiagnosticsManager.ts` (2 locations)
- **Before**: `private diagnosticsDir = './diagnostics'` and `config.diagnosticsPath || './diagnostics'`
- **After**: Both now use `join(process.env.APPDATA || '', 'console-automation-mcp', 'diagnostics')`
- **Why**: `./diagnostics` resolves to `system32\diagnostics` when cwd = system32.

#### `src/core/ConsoleManager.ts`
- **Before**: `diagnosticsPath: './diagnostics'` passed to `DiagnosticsManager.getInstance()`
- **After**: `diagnosticsPath: join(process.env.APPDATA || homedir(), 'console-automation-mcp', 'diagnostics')`
- **Also added**: `homedir` to `os` import, `join` from `path` import
- **Why**: This explicit `diagnosticsPath` override was taking precedence over the DiagnosticsManager fix,
  passing the relative path directly through regardless of the fix in DiagnosticsManager itself.
  This was the final/deepest root cause.

#### `src/testing/SnapshotManager.ts`
- **Before**: `path.join(process.cwd(), 'data', 'snapshots')`
- **After**: `path.join(process.env.APPDATA || path.dirname(process.argv[1] || process.cwd()), 'console-automation-mcp', 'data', 'snapshots')`
- **Why**: SnapshotManager is imported by server.ts at startup, so this runs immediately on launch.

#### `src/protocols/RDPProtocol.ts`
- **Before**: `join(process.cwd(), 'temp', 'rdp')`
- **After**: `join(process.env.APPDATA || tmpdir(), 'console-automation-mcp', 'temp', 'rdp')`
- **Also added**: `tmpdir` to `os` import
- **Why**: Only triggers on RDP session creation (not startup), but fixed proactively.

#### `tsconfig.json`
- **Before**: `"exclude": ["node_modules", "dist", "tests"]`
- **After**: `"exclude": ["node_modules", "dist", "tests", "src/tests"]`
- **Why**: Test files live under `src/tests/` (not `tests/`), so they were being included in
  the TypeScript compilation and failing due to missing `@types/jest` / `@types/mocha`,
  breaking every `npm run build`.

### All log/data paths now write to
`%APPDATA%\console-automation-mcp\`
- `logs\mcp-combined.log`, `logs\mcp-error.log`
- `diagnostics\` (diagnostic reports, only when persistDiagnostics=true)
- `data\snapshots\` (test snapshots)
- `temp\rdp\` (RDP session files, only on RDP session creation)

### Note on `server.ts` debug log
The reference copy already had `const DEBUG_ENABLED = !!process.env.MCP_DEBUG` guarding
the debug log path — so `mcp-debug.log` is never written unless `MCP_DEBUG` env var is set.
This is the correct upstream behavior; no change needed here.
