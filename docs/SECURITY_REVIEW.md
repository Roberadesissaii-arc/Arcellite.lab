# Control plane security review (Phase 1B)

Each item was checked before completion. "Test" names a file under `src/test/integration/` unless noted.

| Check | Result | Evidence |
| --- | --- | --- |
| No plaintext password in the database | Pass | Argon2id hash only. `auth` tests 4; `database`: every table scanned for the password |
| No plaintext session token in the database | Pass | SHA-256 hash only. `auth` test 8; `database` table scan |
| No plaintext CSRF token in the database | Pass | Hash only. `auth` test 8 |
| No master key in the database | Pass | Read from the environment only. `database` table scan |
| No environment secret in project JSON | Pass | Variables are a separate resource. `environment` test 19 |
| No secret in API logs | Pass | Every log record passes through `redact()` (`src/server/security/security.test.ts`). Smoke-run server logs grepped for the secret and password |
| No secret in activity metadata | Pass | Key names only. `environment` test 25 |
| No secret in audit metadata | Pass | Key, scope, and kind only; `writeAudit` redacts. `environment` test 25 |
| No secret in localStorage in server mode | Pass | Only theme, motion, and developer-mode prefs. `e2e/smoke.mjs`; `server-provider.test.ts` |
| ServerDeployProvider never imports database code | Pass | ESLint `no-restricted-imports` on `src/lib` and `src/components`; `src/architecture.test.ts` |
| No client bundle imports `src/server` | Pass | `server-only` in every server module (enforced by `architecture.test.ts`). `.next/static` grepped for server-only strings |
| No unauthenticated project API | Pass | Every `/api/v1` route except status, bootstrap, and login uses `sessionRoute`. `auth`: "requires a session for every workspace route" |
| No unsafe mutation without CSRF | Pass | Trusted Origin on every unsafe method, plus `X-CSRF-Token` bound to the session. `csrf` tests 12–14, `environment` test 22, smoke |
| No second bootstrap owner race | Pass | Advisory transaction lock plus a count under the lock. `auth` test 3 (6 concurrent attempts) |
| No in-memory-only idempotency | Pass | `idempotency_keys` row in the same transaction as the effect. `projects` tests 26–27 |
| No in-memory-only durable job state | Pass | `jobs` / `job_attempts` with leases. `jobs` tests (worker restart, lease expiry) |
| No SSE cross-workspace leak | Pass | Stream and replay read `events` filtered by the session's workspace. `events` test 30 |
| No stack traces in production errors | Pass | `toFailure` maps unknown errors to a generic INTERNAL_ERROR. `auth` test 31; `security.test.ts` |
| No real infrastructure capability marked true | Pass | `SERVER_CAPABILITIES`: `realInfrastructure`, `realGitHub`, `realDomains`, `realMetrics`, `realLogs`, `deployments` are all false (`server-provider.test.ts`) |
| No wildcard CORS, no trust in X-Forwarded-Host | Pass | `csrf` tests |
| Invalid master key fails safely | Pass | Clear startup log; every API route answers 503; readiness fails. Never derived from a passphrase (`secret-box.test.ts`, `auth` configuration test) |

## Known limits

- Login throttling is per identity, so an attacker who knows the owner's login can lock it for 15 minutes. That is the specified trade-off; there is no per-IP layer, because proxy headers are not trusted.
- Sessions resolve to the user's first workspace membership. Multi-workspace switching is not built.
- Environment edits from the project settings form are sent as separate calls, one per variable. Each call is atomic; the batch is not.
- The CSP allows `'unsafe-inline'` for styles only, because React and motion write style attributes. Scripts require the nonce.
