# Phase 2: Security & Performance Review

## Security Findings (2A) — 9 Critical, 7 High, 5 Medium, 3 Low

### Critical (9)
1. **RCE via `new Function()` in DataPipelineManager** — CWE-94, 4 instances (lines 476, 726, 740, 754)
2. **RCE via `new Function()` in WorkflowEngine** — CWE-94 (line 893), chains with interpolateVariables
3. **RCE via `new Function()` in TriggerManager** — CWE-94 (line 579), persistent via setInterval
4. **OS Command Injection in WSLProtocol** — CWE-78, 10 instances via execAsync string interpolation
5. **OS Command Injection in SimpleCommandExecutor** — CWE-78 (lines 36-40, 78-82)
6. **PowerShell Injection via credential interpolation** — CWE-78/CWE-522 (WindowsSSHAdapter:28-64)
7. **Hardcoded encryption key fallback** — CWE-798/CWE-321 (AuditLogger:72)
8. **Plaintext credential storage** — CWE-256 (ConfigManager:215-223) — HIGH but escalated due to exfiltration via MCP tools
9. **No input validation on MCP tool interface** — CWE-20 (server.ts:111-258) — enables all other attacks

### High (7)
1. SSRF via unconstrained fetch() — CWE-918 (DataPipelineManager:305-325)
2. Path traversal in file operations — CWE-22 (DataPipelineManager:278-299, 828-846)
3. Disabled SSH host key verification — CWE-295 (16+ instances across 6 files)
4. ReDoS via user-controlled regex — CWE-1333 (10+ instances across 6 files)
5. Dynamic require() with user path — CWE-94 (GCPProtocol:857)
6. Encryption silently falls back to plaintext — AuditLogger:511-514
7. Environment variable exposure — DataPipelineManager:265, TriggerManager:629

### Medium (5)
1. No authentication/authorization on MCP server — CWE-306
2. Insecure encryption: SHA-256 key derivation, AES-CBC without auth, hash+key signatures — CWE-327
3. Information disclosure via error messages — CWE-209
4. Dependency risks: node-forge, xml2js, python-shell — CWE-1104
5. Three inconsistent SSH paths with different security properties

### Low (3)
- Debug logging credentials to predictable path, environment variable pass-through, incomplete crypto

### Attack Chain
Prompt injection → MCP tool call → no validation → execSync string interpolation → arbitrary OS command execution. Estimated exploit time: <5 minutes.

---

## Performance Findings (2B) — 4 Critical, 10 High, 7 Medium, 1 Low

### Critical (4)
1. **Unbounded DataPipelineManager.executions Map** — never evicted, linear memory growth → OOM
2. **Unbounded BaseProtocol.outputBuffers** — no size limit per session, high-output sessions → hundreds of MB
3. **ConsoleManager constructor instantiates 13 session managers eagerly** — most users need 1-2 protocols
4. **ConsoleManager is a God Object / single point of failure** — 7,064 lines, no horizontal scaling possible

### High (10)
1. WorkflowEngine.executions never auto-evicted (cleanup() never called automatically)
2. ConsoleManager holds 10+ parallel Maps per session — no single cleanup path
3. Race condition in waitForExecution — no timeout, infinite hang possible
4. No mutex on ConsoleManager session Maps — interleaving at await points
5. Synchronous readFileSync in hot paths — ConnectionPool, ConsoleManager, ConfigManager
6. Synchronous appendFileSync in debug logging — server.ts:41
7. Double/triple protocol caching — ProtocolFactory + ConsoleManager.protocolCache + protocolInstances
8. ProtocolFactory singleton prevents multi-tenant isolation
9. In-memory only state — process crash loses everything
10. new Function() compilation overhead in loops without caching

### Medium (7)
- CircuitBreaker Map not pruned, ProtocolFactory eager 40+ configs, approval callbacks leak, sync writeFileSync in persistence, SSH shell health checks (heavy), no cache invalidation on dispose, 105 setInterval calls with only partial clearInterval coverage

---

## Critical Issues for Phase 3 Context

Testing should verify:
- All `new Function()` replacements maintain functional equivalence
- Command injection fixes don't break legitimate command execution
- Memory leak fixes (eviction policies) don't lose needed data
- SSH host key changes don't break existing connection workflows

Documentation should cover:
- Security model and threat assumptions
- Credential management best practices
- MCP tool input validation rules
- Migration guide for breaking security changes
