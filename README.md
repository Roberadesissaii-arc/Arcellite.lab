# Arcellite Deploy

Arcellite Deploy is a self-hosted deployment control plane. It is meant to make deploying software to a server you control feel as direct as a modern cloud platform, without giving up that server.

## Status

The app runs in one of two modes, chosen on the server with `ARCELLITE_PROVIDER`:

| Mode | What it is |
| --- | --- |
| `mock` (default) | The Phase 1 product demo. Everything runs in the browser with simulated servers, containers, domains, deployments, logs, and metrics. No database, no sign-in. |
| `server` | The real control plane. An owner account, sessions, projects, encrypted environment variables, settings, activity, a security audit log, durable jobs, and a live event stream, all stored in PostgreSQL. |

**Server mode does not deploy anything yet.** There is no Docker integration, server agent, Caddy, custom domains, TLS, GitHub App, or build pipeline. In server mode the UI shows no servers, containers, domains, or metrics, and deployment actions answer "Not available yet". These arrive with the Go agent in the next phase.

## Architecture

```text
Browser
  → Next.js control plane (App Router, route handlers under /api/v1)
    → PostgreSQL (drizzle-orm, versioned migrations in drizzle/)
  → pnpm worker (separate process: durable job queue, housekeeping only)
```

- `src/lib/deploy` holds the domain model and the `DeployProvider` seam. Feature views read the provider's snapshot and call its commands. `mock-provider.ts` simulates infrastructure in the browser. `server-provider.ts` talks to `/api/v1` through `src/lib/api/client.ts` (credentials, CSRF header, Idempotency-Key, structured errors, abort) and follows `/api/v1/events/stream`. Its capabilities say exactly what is real: `realControlPlane: true`, and `deployments` and every `real*` infrastructure flag `false`.
- `src/lib/api/contracts` holds the Zod wire contracts shared by both sides.
- `src/server` runs only on the server (every module imports `server-only`; a lint rule and a test keep browser code out): `config`, `db` (schema, pooled client), `auth` (passwords, sessions, capabilities, page guard), `crypto`, `security` (origin checks, rate limits, redacting logger), `api` (route wrapper), `services`, `events`, `jobs`, `audit`.
- Route handlers are thin: validate, call a service, return. Services own transactions, authorization, audit, activity, and events.

### Security model (server mode)

- **Owner bootstrap** at `/setup`: the first account becomes owner of the "Arcellite Lab" workspace. A PostgreSQL advisory lock serializes concurrent attempts, so there is only ever one initial owner. Afterwards `/setup` redirects to `/login`.
- **Passwords**: Argon2id (19 MiB, t=2, p=1). At least 12 characters.
- **Sign-in**: the only failure message is "Invalid credentials." Unknown accounts cost the same hashing time. There are 5 failures per normalized identity per 15 minutes, counted in PostgreSQL.
- **Sessions**: 256-bit random tokens stored only as SHA-256 hashes, in an `arcellite_session` cookie (HttpOnly, SameSite=Lax, Path=/, Secure in production). A session ends after 12 idle hours or 7 days. `last_seen_at` is written at most every 5 minutes. Sign-out revokes the session in the database. Disabled users are rejected.
- **CSRF**: every POST/PUT/PATCH/DELETE needs a trusted `Origin`. That means `ARCELLITE_APP_URL` or `ARCELLITE_TRUSTED_ORIGINS`, or loopback addressed to itself; `X-Forwarded-*` is never trusted. Authenticated writes also need `X-CSRF-Token`, which must match the `arcellite_csrf` cookie and the hash stored with the session.
- **Authorization**: roles map to capabilities in one place (`src/server/auth/authorize.ts`). Denials are audited, and every query is scoped to the actor's workspace.
- **Environment variables**: every value, secret or not, is encrypted with AES-256-GCM using `ARCELLITE_MASTER_KEY`, a random 96-bit nonce, and the row identity as associated data. Keys are versioned for rotation. Secrets are write-only in the API. Showing one uses `POST …/reveal`, which needs the current password and the CSRF token, is rate limited (10 per 15 minutes), is audited without the value, and is never cached.
- **Audit log** (`audit_log`) is separate from user-facing activity. It is append-only from the app's point of view, redacted, and survives project archiving (projects are soft-deleted with `archived_at`).
- **Errors** are `{ error: { code, message, requestId, details? } }` with no stack traces. Every response carries `X-Request-ID` and `Cache-Control: no-store`.
- **Headers**: a per-request nonce CSP (no inline script without the nonce, `frame-ancestors 'none'`), `nosniff`, a strict referrer policy, and a permissions policy. HSTS and `upgrade-insecure-requests` are added when `ARCELLITE_APP_URL` is https.
- **Idempotency**: `Idempotency-Key` on project, variable, and job creation is stored in PostgreSQL in the same transaction as the effect for 24 hours. A repeat replays the first response. Reusing a key with a different body answers `IDEMPOTENCY_CONFLICT`.
- **Jobs**: a `jobs` table claimed with `FOR UPDATE SKIP LOCKED`. Claims carry leases with heartbeats, and retries use exponential backoff. The worker runs only `control-plane.noop` and `housekeeping.cleanup`.
- **Events**: an `events` table with a `bigserial` sequence plus `NOTIFY`. `/api/v1/events/stream` is an authenticated, workspace-scoped SSE stream with heartbeats. It replays from `Last-Event-ID` (at most 500 events, otherwise a `resync` event) and closes when the session ends. There is one shared `LISTEN` connection per process.

## Development

Requirements: Node 22, pnpm 10, and PostgreSQL 15+ for server mode.

### Mock mode (no database)

```bash
pnpm install
pnpm dev
```

Open the printed URL. This is the in-browser demo, unchanged from Phase 1. Its data lives in `localStorage`.

### Server mode

```bash
# 1. Start PostgreSQL (development only; Arcellite itself never controls Docker)
docker compose -f compose.dev.yml up -d

# 2. Create .env
cp .env.example .env

# 3. Generate the master key and put it in .env as ARCELLITE_MASTER_KEY
openssl rand -base64 32

# 4. Apply migrations
pnpm db:migrate

# 5. In .env, set ARCELLITE_PROVIDER=server

# 6. Start the app (and, in another terminal, the worker)
pnpm dev
pnpm worker

# 7. Visit http://localhost:3000. You are sent to /setup.
# 8. Create the owner account.
```

Browser demo data is never imported into PostgreSQL. A deliberate import tool may come later. Back up both the database and `ARCELLITE_MASTER_KEY`. Backup automation is future work.

`/api/health/live` reports that the process is up. `/api/health/ready` reports whether the database and key are usable, and nothing more.

## Scripts

```bash
pnpm dev               # local app
pnpm build             # production build
pnpm start             # serve the production build
pnpm lint              # eslint
pnpm typecheck         # tsc --noEmit
pnpm test              # unit tests (no database)
pnpm test:integration  # PostgreSQL tests; needs TEST_DATABASE_URL (default …/arcellite_test)
pnpm test:e2e --mode mock|server --base http://localhost:3000   # browser smoke test against a running app
pnpm db:generate       # new migration from schema changes (src/server/db/schema)
pnpm db:migrate        # apply migrations to DATABASE_URL
pnpm db:check          # verify migration consistency
pnpm worker            # job worker (server mode)
```

For integration tests locally, create the test database once:

```bash
docker compose -f compose.dev.yml exec postgres createdb -U arcellite arcellite_test
```

CI (`.github/workflows/ci.yml`) runs all of the above against a PostgreSQL service with a throwaway key generated per run.

## Visual system

The shell always pairs a near-black sidebar with a white workspace. Sidebar tokens are scoped independently from workspace and overlay tokens in `src/styles/tokens.css`. `/setup` and `/login` use the same pairing without the shell.

## Brand

The mark and the primary color `#5D5FEF` come from the live Arcellite site. The cloud glyph in the sidebar is the same path used on arcellite.com and in `public/brand/arcellite-mark.svg`. Do not replace it with a new logo.

## Not implemented yet

Docker workloads, the Go server agent, BuildKit, Caddy and custom domains, TLS, the GitHub App and webhooks, Git cloning, upload builds, managed databases, volumes, remote servers, and database backups. In mock mode, domain verification, TLS, metrics, and deployments are simulated and labeled as such.
