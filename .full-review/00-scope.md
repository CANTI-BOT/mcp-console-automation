# Review Scope

## Target

Full security-focused refactor and correction of all identified vulnerabilities in the mcp-console-automation project, followed by test suite creation to validate all functions.

## Priority Files (Known Issues from Security Audit)

### CRITICAL - CI/CD Workflows
- `.github/workflows/commitlint.yml` — pull_request_target + untrusted checkout
- `.github/workflows/codex-autofix.yml` — unpinned action @main, job-level secret exposure
- `.github/workflows/release.yml` — runtime git clone without integrity check
- `.github/workflows/ci.yml` — action pinning review
- `.github/workflows/quality-gates.yml` — action pinning review
- `.github/workflows/test.yml` — action pinning review

### CRITICAL - Arbitrary Code Execution
- `src/core/DataPipelineManager.ts` — new Function() x4, arbitrary file read/write, SSRF, ReDoS
- `src/core/TriggerManager.ts` — new Function() for condition eval
- `src/core/WorkflowEngine.ts` — new Function() for expression eval

### HIGH - Command Injection
- `src/protocols/WSLProtocol.ts` — exec() with string interpolation
- `src/core/SimpleCommandExecutor.ts` — execSync() with unescaped args
- `src/core/WindowsSSHAdapter.ts` — PowerShell password interpolation
- `src/protocols/GCPProtocol.ts` — dynamic require() with user path

### HIGH - Credential/Config Issues
- `src/monitoring/AuditLogger.ts` — hardcoded fallback encryption key
- `.npmrc` — auth token reference in tracked file
- `install.sh` — shell variable injection into Python
- `install.ps1` — Invoke-Expression usage

### MEDIUM - Other
- `src/protocols/AnsibleProtocol.ts` — vault password temp file race
- `src/protocols/WeTTYProtocol.ts` — HTTP/WS server binding, CDN without SRI
- `src/core/DataPipelineManager.ts` — user-controlled regex (ReDoS)

## Full Source Tree
- 167 TypeScript source files under `src/`
- 6 GitHub Actions workflow files
- 2 installer scripts (sh, ps1)
- 1 Dockerfile, 1 .npmrc

## Flags

- Security Focus: yes
- Performance Critical: yes
- Strict Mode: yes
- Framework: Node.js/TypeScript MCP Server

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
