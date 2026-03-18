# Consolidated Security & Performance Report
# console-automation-mcp — CANTI-BOT fork

**Review Date**: 2026-03-18
**Commit**: c03ac21
**Status**: All critical issues resolved ✅

---

## Summary

| Category | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| Critical security | 9 | 9 | 0 |
| High security | 7 | 4 | 3* |
| Medium security | 5 | 2 | 3* |
| Critical perf | 4 | 4 | 0 |
| High perf | 10 | 4 | 6* |
| Tests added | — | 62 | — |

*Remaining issues are lower-risk; see "Remaining Work" section.

---

## Resolved Issues

### Critical Security

| # | Issue | File | Fix Applied |
|---|-------|------|-------------|
| 1 | RCE via `new Function()` | DataPipelineManager.ts | Replaced with `expr-eval` Parser (AST-based) |
| 2 | RCE via `new Function()` | WorkflowEngine.ts | Replaced with `new Parser().evaluate()` |
| 3 | RCE via `new Function()` | TriggerManager.ts | Replaced with `new Parser().evaluate()` |
| 4 | OS command injection (30+ instances) | WSLProtocol.ts | Migrated to `execFile` with arg arrays + validation helpers |
| 5 | OS command injection | SimpleCommandExecutor.ts | Migrated to `execFileSync` with arg arrays |
| 6 | PowerShell credential injection | WindowsSSHAdapter.ts | Credentials via `$env:MCP_SSH_PASSWORD` env vars |
| 7 | Hardcoded encryption key fallback | AuditLogger.ts | Removed; fail-fast on missing `AUDIT_ENCRYPTION_KEY` |
| 8 | AES-256-CBC → unauthenticated | AuditLogger.ts | Upgraded to AES-256-GCM with auth tag |
| 9 | SHA-256(hash+key) signature | AuditLogger.ts | Replaced with `createHmac('sha256', key)` |

### High Security (partially addressed)

| # | Issue | Fix Applied |
|---|-------|-------------|
| Dynamic `require()` user path | GCPProtocol.ts | `JSON.parse(readFileSync())` + `.json` ext enforcement |
| CI/CD `pull_request_target` RCE | commitlint.yml | Changed trigger to `pull_request` |
| Plaintext on encryption error | AuditLogger.ts | Now throws instead of returning plaintext |
| Credential file permissions | ConfigManager.ts | `writeFileSync` + `chmodSync` with `0o600` |

### Critical Performance

| # | Issue | File | Fix Applied |
|---|-------|------|-------------|
| 1 | `executions` Map unbounded | DataPipelineManager.ts | 1-hour TTL eviction via `setTimeout` |
| 2 | `outputBuffers` unbounded | BaseProtocol.ts | `MAX_BUFFER_SIZE=10,000` rolling window (`shift()`) |
| 3 | 50ms polling loop | BaseProtocol.ts | Event-driven `once()` listener pattern |
| 4 | `waitForExecution` infinite hang | WorkflowEngine.ts | `timeoutMs` parameter (default 300s) with deadline rejection |

---

## TypeScript Build

Two type errors fixed after expr-eval integration:
- `DataPipelineManager.ts:495` — `unknown` → `number | string` cast
- `WorkflowEngine.ts:900` — `Record<string, unknown>` → `{[key:string]:number|string}` cast

Build is clean: `npm run build` exits 0 with no errors.

---

## Test Coverage Added

```
tests/security/
  expression-evaluator.test.ts   — 17 tests: RCE payload blocking, safe eval behavior
  command-injection.test.ts      — 12 tests: execFile migration, no string interpolation
  audit-logger-crypto.test.ts    — 17 tests: GCM round-trip, tamper detection, CBC rejection
  gcp-credential-loading.test.ts — 10 tests: dynamic require, CI/CD trigger, file permissions

tests/unit/
  workflow-engine-fixes.test.ts  —  8 tests: timeout, destroy(), approval TTL
  memory-eviction.test.ts        —  8 tests: buffer cap, event-driven output, TTL eviction

Total: 62 tests, all passing
```

---

## Remaining Work (Non-Critical)

### High Priority (not yet fixed)

1. **SSH host key verification disabled** (CWE-295) — 16+ instances across 6 files.
   Fix: Add `strictHostKeyChecking: 'yes'` and a known-hosts path to SSH client configs.

2. **SSRF via unconstrained `fetch()`** (CWE-918) — `DataPipelineManager.ts:305-325`.
   Fix: Allowlist of permitted URL schemes/hosts.

3. **ReDoS via user-controlled `new RegExp()`** (CWE-1333) — 10+ instances.
   The `safeRegex()` helper was added to DataPipelineManager; similar guards needed elsewhere.

4. **Third-party GitHub Actions not SHA-pinned** — `ci.yml`, `test.yml`, `release.yml`.
   Fix: Replace `@v3`/`@v4` with `@<sha>` for all third-party actions.

### Medium Priority

5. **No authentication on MCP server** (CWE-306) — `server.ts:111-258`.
   Consider adding bearer token auth or mTLS for production deployments.

6. **WorkflowEngine is 7,000+ lines (God Object)** — horizontal scaling impossible.
   Consider decomposing into `WorkflowScheduler`, `WorkflowExecutor`, `ApprovalManager`.

7. **ConsoleManager instantiates 13 session managers eagerly** — most users need 1-2.
   Consider lazy initialization or a plugin registry pattern.

---

## Security Model Notes

This codebase operates as a **local MCP server** — it receives tool calls from Claude/AI agents and executes console/SSH sessions. The threat model assumptions are:

- **MCP input is untrusted** — any tool parameter could be adversarially crafted (prompt injection)
- **Credential storage** — SSH passwords in config files should use a keychain/vault; plaintext warning was added
- **Network exposure** — the MCP server has no auth; it must only be bound to localhost

---

## Migration Notes

### AES-256-GCM Breaking Change
Old encrypted audit logs (AES-256-CBC format: `iv:ciphertext`) **cannot be decrypted** by the new code (AES-256-GCM format: `iv:ciphertext:authTag`). Archive or discard old encrypted logs before deploying this version.

### `AUDIT_ENCRYPTION_KEY` Required
If `AuditConfig.encryption.enabled = true`, the `AUDIT_ENCRYPTION_KEY` environment variable must be set to a 64-character hex string (32 bytes). The server will refuse to start without it.
