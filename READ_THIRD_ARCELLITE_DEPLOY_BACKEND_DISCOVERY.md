# READ_THIRD_ARCELLITE_DEPLOY_BACKEND_DISCOVERY.md

> **ARCELLITE DEPLOY — BACKEND DISCOVERY, ARCHITECTURE & SECURITY AUDIT**
>
> Product: **Arcellite Deploy**
>
> Repository: `Roberadesissaii-arc/Arcellite.lab`
>
> Working folder: `~/project/Arcellite`
>
> Stage: **Backend Stage 0 — understand the entire product before implementation**
>
> **DO NOT IMPLEMENT THE REAL BACKEND IN THIS TASK.**
>
> The only deliverable from this task is a deep report named:
>
> `BACKEND_DISCOVERY_REPORT.md`

---

# 0. Why this task exists

Arcellite Deploy already has an advanced Phase 1 UI and a realistic mock deployment system.

The next goal is to replace simulation with a real, secure deployment platform.

Before changing the codebase, we need an exact map of the current application and a production-grade backend architecture.

Do not jump directly into Docker.

Do not add a database yet.

Do not add API routes yet.

Do not initialize a Go service yet.

Do not alter the UI.

Do not install dependencies.

Do not modify application behavior.

Inspect everything first and produce the report.

---

# 1. Product definition

Arcellite Deploy is a self-hosted deployment control plane.

The core product idea is:

```text
Source
  ↓
Analyze
  ↓
Configure
  ↓
Build / Pull
  ↓
Release
  ↓
Run
  ↓
Health
  ↓
Port / Domain
  ↓
Logs + Metrics + Operations
```

A user should eventually be able to deploy software to infrastructure they control without needing to manually manage Docker.

The platform must remain useful to advanced users who need access to:

- source information,
- build commands,
- environment variables,
- ports,
- containers,
- releases,
- server resources,
- domains,
- logs,
- metrics,
- storage,
- databases,
- events,
- alerts,
- and deployment history.

This is not meant to become a generic Docker GUI.

It is a deployment platform.

---

# 2. Read all project instructions first

Before auditing source code, read these files completely:

```text
README.md
AGENTS.md
CLAUDE.md
READ_FIRST_ARCELLITE_DEPLOY.md
READ_SECOND_ARCELLITE_DEPLOY_UI_REPAIR.md
package.json
.env.example
```

Then inspect the actual current `main` branch.

The source code is authoritative when the older specifications differ from what is currently implemented.

---

# 3. Current application areas to verify

The current product appears to contain at least:

## Workspace

- Overview
- Ask Arc
- Projects
- Deployments

## Infrastructure

- Servers
- Storage
- Domains
- Containers
- Databases

## Observe

- Logs
- Alerts
- Events
- Metrics
- Activity
- Pipelines
- Environment

## Other

- Docs
- Settings
- Notifications
- Profile
- Command palette
- Onboarding

Verify the exact current navigation and routes.

Do not rely on this list alone.

---

# 4. Audit every dashboard route

Inspect every route under:

```text
src/app/(dashboard)/
```

Create a complete route map.

For each route record:

```text
route
page component
major child components
data read
actions available
mock provider methods used
localStorage usage
real backend requirement
streaming requirement
security sensitivity
recommended backend phase
```

Pay special attention to:

```text
/
 /chat
 /projects
 /projects/new
 /projects/new/[source]
 /projects/[projectId]
 /projects/[projectId]/deployments
 /projects/[projectId]/logs
 /projects/[projectId]/environment
 /projects/[projectId]/domains
 /projects/[projectId]/settings
 /deployments
 /deployments/[deploymentId]
 /servers
 /servers/[serverId]
 /containers
 /domains
 /storage
 /databases
 /logs
 /metrics
 /events
 /alerts
 /activity
 /pipelines
 /environment
 /notifications
 /settings
 /profile
```

---

# 5. Audit the shell

Inspect:

```text
src/components/shell/shell.tsx
src/components/shell/sidebar.tsx
src/components/shell/command-palette.tsx
src/components/shell/onboarding.tsx
src/components/nav.ts
src/components/providers.tsx
```

Document:

- what is purely visual,
- what uses deploy state,
- which counters depend on infrastructure data,
- which preferences belong only in the browser,
- which preferences belong to a user/workspace later,
- how initial hydration currently works.

UI-only state such as sidebar collapse should not automatically move to the control-plane database.

---

# 6. Audit the entire deploy domain

Read every file in:

```text
src/lib/deploy/
```

Especially:

```text
provider.ts
mock-provider.ts
react.tsx
store.ts
types.ts
fixtures.ts
engine.ts
helpers.ts
logs.ts
detect.ts
filters.ts
format.ts
assistant.ts
assistant-format.ts
dotenv.ts
```

Also inspect every test.

Explain:

- how the provider abstraction works,
- how the mock provider implements it,
- how React receives the provider,
- how subscriptions/snapshots work,
- how browser persistence works,
- how deployment state advances,
- how cancellation works,
- how redeploy works,
- how domain verification works,
- how container operations are simulated,
- how server metrics are simulated,
- how logs are generated,
- how environment variables are stored,
- how errors are represented.

---

# 7. Audit the current DeployProvider

Inspect the current `DeployProvider` interface.

Do not assume the current contract is perfect for a real backend.

For every method answer:

```text
Keep as-is?
Rename?
Needs pagination?
Needs filtering?
Needs idempotency?
Needs auth context?
Needs streaming equivalent?
Should execute only server-side?
Should execute through the agent?
Should be split into multiple operations?
```

Determine whether the provider should remain the main frontend boundary.

The objective is to preserve as much UI code as practical while replacing the implementation behind it.

---

# 8. Audit all domain types

Review every type in:

```text
src/lib/deploy/types.ts
```

Classify each as one of:

```text
UI view model
durable control-plane entity
observed host state
API DTO
agent protocol message
value object
mock-only artifact
```

Do not use one TypeScript type forever as:

- database row,
- browser object,
- HTTP response,
- agent RPC object,
- Docker object.

Recommend clean boundaries.

Identify every mock-only field.

Examples might include simulated failure flags or synthetic telemetry, but verify actual code.

---

# 9. Audit project creation

Inspect all current new-project source flows.

Verify support for:

- GitHub
- Upload
- Git URL
- Docker image
- Docker Compose
- Dockerfile
- automatic framework detection

Create two sequence diagrams:

## Current

What happens today entirely in the mock/browser implementation.

## Future

What should happen when the backend is real.

Map every form field to where it should ultimately be validated and stored.

---

# 10. Audit deployments

Inspect:

```text
src/lib/deploy/engine.ts
src/components/deployments/
src/components/pipelines/
src/components/projects/project-panels.tsx
src/components/projects/project-frame.tsx
```

Document all:

- deployment states,
- phases,
- step states,
- failure states,
- cancellation states,
- prior-release behavior,
- URL behavior,
- health behavior,
- logs,
- pipeline presentation.

Then map each simulated state to a real backend event.

---

# 11. Audit infrastructure pages

Inspect current:

- servers,
- storage,
- domains,
- containers,
- databases.

For each, identify:

```text
what the UI thinks exists
what is mock today
what Docker/host data is required
what should be persisted
what should be observed
what agent operation is required
```

---

# 12. Audit observability

Inspect:

- logs,
- metrics,
- activity,
- events,
- alerts,
- service status,
- pipelines.

Determine what is:

- synthetic,
- derived,
- persisted,
- browser-only.

Propose the future real data source for each.

---

# 13. Audit Ask Arc

Inspect:

```text
src/components/chat/project-chat.tsx
src/lib/deploy/assistant.ts
src/lib/deploy/assistant-format.ts
```

Explain:

- what information it reads,
- where conversations live,
- whether it can mutate infrastructure,
- how project context works,
- how links/actions are generated.

Initial real-backend rule:

**Ask Arc should remain read-only.**

Do not create AI-specific privileged infrastructure endpoints.

Future actions from Ask Arc must use the same authenticated, authorized, auditable command path as normal UI actions.

---

# 14. Target architecture to evaluate

Evaluate this architecture rather than blindly accepting it:

```text
                         Browser
                            │
                            │ HTTPS
                            ▼
                ┌────────────────────────┐
                │   Arcellite Deploy     │
                │ Next.js Control Plane  │
                └───────────┬────────────┘
                            │
             ┌──────────────┼───────────────┐
             │              │               │
             ▼              ▼               ▼
        PostgreSQL     Durable Jobs     GitHub App
             │              │
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ Arcellite    │
             │ Agent (Go)   │
             └──────┬───────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      Docker     BuildKit      Caddy
        │
   ┌────┼────┐
   ▼    ▼    ▼
 apps workers data
```

Determine what should be changed.

---

# 15. Core security boundary

The browser must never control Docker directly.

Never design:

```text
Browser → Docker socket
```

Never expose:

```text
/var/run/docker.sock
```

to browser-facing application code.

Never expose an unauthenticated Docker TCP API.

Docker daemon control is effectively highly privileged host control.

The architecture must treat Docker access as a high-risk capability.

Official research:

```text
https://docs.docker.com/engine/security/
https://docs.docker.com/engine/security/protect-access/
https://docs.docker.com/engine/security/rootless/
```

The report must explicitly draw this trust boundary.

---

# 16. Why the Go agent exists

The agent should be the privileged infrastructure boundary.

It should eventually perform selected operations such as:

- host inspection,
- Docker inspection,
- image pull,
- BuildKit builds,
- container lifecycle,
- managed networks,
- managed volumes,
- logs,
- metrics,
- health checks,
- proxy configuration,
- cleanup.

The agent must expose typed semantic operations.

Good:

```text
StartDeployment
CancelDeployment
RestartManagedContainer
GetHostInfo
TailLogs
ApplyProxyRoute
```

Bad:

```text
ExecShell(string)
RunDocker(string)
WriteAnyFile(path, bytes)
```

Do not design a remote root shell disguised as an API.

---

# 17. Managed Docker resources

All resources created by Arcellite should carry ownership labels.

Example concept:

```text
io.arcellite.managed=true
io.arcellite.workspace=<id>
io.arcellite.project=<id>
io.arcellite.deployment=<id>
io.arcellite.release=<id>
io.arcellite.role=web
```

The agent should normally mutate only resources managed by Arcellite.

Recommend deterministic naming rules for:

- containers,
- images,
- networks,
- volumes.

---

# 18. Docker runtime hardening

Evaluate safe defaults including:

- no privileged containers by default,
- no host network by default,
- no host PID namespace,
- no Docker socket mounts,
- no arbitrary host root mounts,
- drop unnecessary Linux capabilities,
- `no-new-privileges`,
- resource limits,
- process limits,
- safe restart policies,
- per-project networks,
- read-only root filesystem where compatible,
- seccomp/AppArmor where practical.

Do not claim containers are equivalent to VMs.

Clearly define the first-version threat model.

---

# 19. Rootless Docker

Evaluate Docker rootless mode.

Official reference:

```text
https://docs.docker.com/engine/security/rootless/
```

Determine:

- which Arcellite functions work well in rootless mode,
- which may be limited,
- whether rootless should be recommended rather than mandatory,
- how the installer should detect capability.

---

# 20. Build system

Use Docker BuildKit as the baseline build engine.

Official reference:

```text
https://docs.docker.com/build/buildkit/
```

The architecture must support:

- build jobs,
- cancellation,
- timeout,
- resource limits,
- cache,
- logs,
- cleanup,
- image identity,
- failed build state.

Do not make build state live only in an HTTP request.

---

# 21. Build secrets

Official reference:

```text
https://docs.docker.com/build/building/secrets/
```

Never pass secrets into a Dockerfile with normal `ARG`/`COPY` when dedicated BuildKit secrets are appropriate.

Build credentials should have the shortest practical lifetime.

Private Git credentials must not become image layers.

---

# 22. Build/source order

Evaluate this incremental order.

## First proof

Pre-built Docker image.

Example:

```text
nginx:alpine
```

This proves:

```text
UI
→ API
→ durable deployment
→ agent
→ Docker pull
→ container
→ state
→ health
→ logs
→ endpoint
```

without introducing source build complexity.

## Second

Uploaded project with Dockerfile.

## Third

Public Git URL with Dockerfile.

## Fourth

Automatic framework builds.

## Fifth

Private GitHub repositories using GitHub App.

Recommend a better sequence if necessary.

---

# 23. Untrusted source security

Project source is untrusted input.

The report must cover protections for:

## Archive extraction

- `../` traversal
- absolute paths
- symlink escapes
- hard-link escapes
- decompression bombs
- excessive files
- excessive extracted bytes

## Git

- `file://`
- unsafe protocols
- local filesystem references
- submodules
- huge clones
- timeouts
- credential leakage

## Build contexts

- host-file leakage
- secrets included accidentally
- oversized context
- paths outside the workspace

Propose concrete limits.

---

# 24. Host command execution

Privileged agent commands should use controlled argument arrays.

Prefer Go patterns such as:

```go
exec.CommandContext(ctx, binary, args...)
```

Avoid constructing privileged shell strings.

User build/start commands are different: they belong inside an isolated build/runtime environment, not on the host agent shell.

---

# 25. Networking model

Design three clear networking modes.

## Private

Containers communicate via Docker networks/internal DNS.

## Direct host port

Optional for home-lab/local or non-HTTP services.

Requires:

- conflict protection,
- explicit exposure,
- firewall awareness.

## Domain routed

Preferred for HTTP/HTTPS apps.

```text
Client
  ↓
80 / 443
  ↓
Caddy
  ↓
Docker network
  ↓
container:internal-port
```

A domain-routed application should not need a random public host port.

---

# 26. Per-project networking

Evaluate isolated Docker networks per project/application/stack.

The reverse proxy may connect to:

- shared Arcellite proxy network,
- relevant application network.

Databases should remain private unless explicitly exposed.

Document how cross-project networking should work later.

---

# 27. Port allocation

Real host-port allocation must be race-safe.

Do not simply:

```text
scan free port
wait
start container
```

without coordination.

Propose an atomic/reserved allocation strategy.

For HTTP apps behind Caddy, prefer avoiding host port mappings entirely.

---

# 28. Caddy

Arcellite plans to use Caddy.

Official references:

```text
https://caddyserver.com/docs/api
https://caddyserver.com/docs/automatic-https
https://caddyserver.com/docs/quick-starts/reverse-proxy
```

Evaluate:

- Caddy JSON API,
- generated Caddyfile + reload,
- another controlled approach.

Important:

- Caddy admin API defaults to localhost.
- It should never be publicly exposed.
- For untrusted code, a permissioned Unix socket should be considered.
- Caddy config changes can be applied without downtime.
- failed new configurations can leave the old working configuration intact.
- API config changes can use ETag/If-Match to avoid conflicting updates.
- Caddy can automate TLS.

Recommend the exact approach for Arcellite.

---

# 29. Domain desired vs observed state

The control plane should distinguish:

```text
desired domain route
observed Caddy route
DNS state
certificate state
upstream health
```

Design lifecycle such as:

```text
requested
↓
validated
↓
DNS required
↓
proxy prepared
↓
TLS pending
↓
active
```

A broken domain update should not destroy a healthy route.

---

# 30. Control-plane database

Browser localStorage cannot remain canonical once infrastructure becomes real.

Evaluate PostgreSQL as the primary control-plane database.

A strong initial schema should consider:

```text
users
sessions
workspaces
workspace_members

servers
agents
agent_credentials
agent_heartbeats

projects
project_sources
environments

deployments
deployment_steps
releases
builds

containers
container_ports

domains
domain_routes

environment_variables
encrypted_secrets

volumes
volume_attachments
database_services

git_installations
git_repositories
webhook_deliveries

jobs
job_attempts

events
activity
audit_log

workspace_settings
notification_preferences
```

Do not create every table immediately.

Separate "needed in first backend milestone" from "later".

---

# 31. PostgreSQL decision

Explain whether PostgreSQL should be used from the beginning.

Comparable platforms such as Dokploy use PostgreSQL for configuration/operational state.

Official reference:

```text
https://docs.dokploy.com/docs/core/architecture
```

Arcellite must make its own decision.

Consider:

- simple self-host install,
- transactions,
- jobs,
- concurrency,
- migrations,
- multi-server future,
- backup/restore.

---

# 32. Secret architecture

Use OWASP secret-management principles.

Reference:

```text
https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
```

Requirements:

- no secrets in localStorage,
- no plaintext secrets in logs,
- encrypted sensitive values at rest,
- authenticated encryption,
- master key separate from ciphertext database,
- key versioning,
- rotation path,
- audit metadata,
- secret redaction,
- least privilege.

The browser should not automatically receive secret plaintext after a value is saved.

---

# 33. Authentication

The current application has no production authentication.

A real deployment control plane must have authentication before it is exposed remotely.

Research:

```text
https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
```

Report a recommended self-hosted auth model covering:

- initial admin bootstrap,
- password hashing,
- server-side sessions,
- secure HTTP-only cookies,
- SameSite,
- CSRF strategy,
- session expiry,
- revocation,
- login throttling,
- future TOTP/WebAuthn.

Do not implement auth in this audit.

---

# 34. Authorization

Even if the first real version is single-owner, avoid permanently baking "everyone is root" into every model.

Possible future roles:

```text
owner
admin
developer
viewer
```

Possible capabilities:

```text
read_project
deploy_project
edit_environment
view_secret
manage_domain
control_container
manage_server
manage_workspace
```

Define the minimum authorization boundary needed for Backend Phase 1.

---

# 35. Agent enrollment

Do not use one shared permanent agent key.

Evaluate an enrollment flow:

```text
Control plane creates one-time token
↓
agent generates key material
↓
agent presents one-time token
↓
control plane enrolls server
↓
one-time token becomes invalid
↓
agent receives scoped identity
↓
identity can be rotated/revoked
```

Compare:

- mTLS certificates,
- signed short-lived tokens,
- other service identities.

---

# 36. Same-host vs remote agent transport

Compare:

## Unix socket

Strong option for first same-host installation.

## HTTPS REST + SSE

Simple and debuggable.

## HTTPS + WebSocket

Useful for outbound agent connections.

## gRPC

Strong typed streaming, especially Go-to-server.

The report must recommend:

- first single-host transport,
- future remote-server transport,
- how protocol messages can stay compatible.

---

# 37. Outbound remote agents

For future home-lab machines behind NAT, seriously evaluate an agent that establishes an outbound authenticated connection to the control plane.

Benefits:

- no public inbound agent port,
- easier firewall behavior,
- revocation,
- remote server remains private.

Arcellite must still work fully self-hosted/offline.

No mandatory Arcellite cloud service.

---

# 38. Durable jobs

Deployments are asynchronous jobs.

Do not keep a real deployment alive only because an HTTP request is still open.

Design durable job state with:

```text
job ID
type
deployment ID
created time
status
attempt
lease/worker
timeout
cancellation
idempotency key
failure
result
```

Evaluate:

- PostgreSQL-backed jobs,
- dedicated queue,
- agent-local execution plus durable DB records.

Do not add Redis without a clear requirement.

---

# 39. Idempotency

Design for:

- double-click Deploy,
- browser retry,
- API timeout,
- duplicate GitHub webhook,
- agent reconnect,
- duplicate agent command.

Every destructive/long-running command should have an identity.

Propose idempotency-key behavior.

---

# 40. Reconciliation

The system must detect drift.

Examples:

- DB says running, Docker says exited.
- agent restarted.
- host rebooted.
- container changed manually.
- Caddy route missing.
- old image removed.

Design desired-state / observed-state reconciliation.

Do not make optimistic browser state authoritative.

---

# 41. Canonical ownership table

For each entity, state the canonical source.

Example:

```text
Project config → PostgreSQL
Environment secret ciphertext → PostgreSQL
Encryption key → protected host secret, not DB
Deployment intent/history → PostgreSQL
Running container state → Docker observed through agent
Domain desired config → PostgreSQL
Active proxy config → Caddy observed
Metrics → agent observations
```

Produce a full table.

---

# 42. Release model

A project should not be represented as one mutable container.

Design releases:

```text
Project
 ├─ Deployment A → Release A → image digest A
 ├─ Deployment B → Release B → image digest B
 └─ active release → B
```

This enables:

- rollback,
- immutable history,
- health transition,
- audit.

Map this model to current types.

---

# 43. Safe deployment cutover

Evaluate a deployment transaction:

```text
1. Create deployment record.
2. Lock project deployment.
3. Resolve source.
4. Prepare isolated workspace.
5. Build or pull immutable image.
6. Create candidate runtime.
7. Start candidate.
8. Check readiness.
9. Update proxy route.
10. Mark candidate active.
11. Stop previous runtime.
12. Retain previous healthy release according to policy.
13. Cleanup asynchronously.
```

A failed candidate should not take down the previous healthy release.

---

# 44. Rollback

Design real rollback.

Require:

- last healthy release record,
- image digest,
- configuration snapshot,
- failure cause,
- audit event,
- explicit rollback deployment/event.

Do not claim zero downtime until the implementation actually supports it.

---

# 45. Health model

Distinguish:

```text
container process running
application ready
proxy can reach upstream
public route healthy
```

Evaluate:

- Docker health check,
- HTTP endpoint,
- TCP check,
- Caddy upstream health,
- agent observations.

Map current simulated service status to real observed health.

---

# 46. Real-time events

The UI needs live state for:

- deployments,
- build phases,
- logs,
- server status,
- containers,
- domains,
- metrics.

Compare:

- SSE,
- WebSocket,
- polling.

Normal CRUD should remain request/response.

Do not turn every API into WebSocket.

---

# 47. Logs

Design separate categories:

- control-plane logs,
- agent logs,
- build logs,
- container logs,
- audit logs.

Require:

- timestamp,
- level,
- source,
- deployment/project/container IDs,
- cursor/sequence,
- retention,
- secret redaction,
- reconnectable tail where practical.

Reference:

```text
https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
```

---

# 48. Metrics

First real server metrics should include:

- CPU,
- RAM,
- disk,
- network,
- uptime,
- Docker health,
- agent heartbeat.

Container:

- CPU,
- memory,
- network,
- state,
- restart count,
- uptime.

Do not persist high-frequency raw metrics forever in PostgreSQL.

Recommend sampling/aggregation/retention.

---

# 49. Filesystem layout

Propose a Linux state layout.

Example concept:

```text
/var/lib/arcellite/
  agent/
  workspaces/
  builds/
  cache/
  releases/
  logs/
  state/
```

For each path define:

- owner,
- permissions,
- cleanup,
- whether project code can see it.

Use standard Linux conventions.

---

# 50. Agent service

Plan the Go agent as a systemd service.

Evaluate hardening:

- dedicated account,
- `NoNewPrivileges`,
- `ProtectSystem`,
- `ProtectHome`,
- `PrivateTmp`,
- capability restrictions.

Do not add settings blindly if Docker control requires privileges.

Document the compromise.

---

# 51. Agent install validation

Future installer should validate:

- Linux/architecture,
- Docker,
- disk space,
- ports,
- cgroups,
- writable state directory,
- network,
- time sync,
- Caddy if enabled.

It should not silently change the firewall.

---

# 52. GitHub architecture

Future GitHub integration must use a GitHub App, not a long-lived PAT pasted into settings.

Official references:

```text
https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps
https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app
https://docs.github.com/en/rest/apps/apps
```

Design for:

- minimum permissions,
- repository-scoped installation,
- short-lived installation tokens,
- webhooks,
- server-side credentials.

---

# 53. GitHub webhook security

Require:

- signature verification,
- event allowlist,
- installation/repository verification,
- branch rules,
- delivery ID dedupe,
- idempotent deployment creation,
- payload limits,
- audit trail.

A GitHub push must never deploy an unauthorized repository.

---

# 54. Compose security

Arbitrary Docker Compose can be extremely privileged.

A user can request:

- host mounts,
- privileged containers,
- devices,
- host network,
- Docker socket.

The report must recommend one:

```text
trusted-admin-only raw Compose
restricted Compose parser
advanced warning mode
defer real Compose
```

Do not imply arbitrary Compose is safe in a hostile multi-user environment.

---

# 55. Multi-tenancy statement

Define three threat levels:

```text
single owner / home lab
trusted team
hostile multi-tenant hosting
```

The first real backend is likely level 1.

State that explicitly.

Docker alone is not a complete hostile multi-tenant sandbox.

Do not make false isolation claims.

---

# 56. Database services

The UI already models databases.

Do not make managed databases real in the first deployment milestone.

Future architecture should support:

- PostgreSQL,
- MySQL,
- Redis,
- private networking,
- generated credentials,
- persistent volume,
- health,
- backups,
- optional explicit external exposure.

Database ports must remain private by default.

---

# 57. Persistent storage

Distinguish:

- temp source workspace,
- build cache,
- app volume,
- database volume,
- backup artifact.

Persistent volumes must not disappear when app containers are replaced.

Dangerous arbitrary host bind mounts should be restricted.

---

# 58. API design

Propose versioned browser-facing APIs.

Example:

```text
/api/v1/projects
/api/v1/deployments
/api/v1/servers
/api/v1/containers
/api/v1/domains
/api/v1/environment
/api/v1/logs
/api/v1/events
/api/v1/metrics
/api/v1/git
/api/v1/auth
```

Design around resources, not UI page names.

Avoid:

```text
POST /run
POST /execute
```

---

# 59. Validation

All external input must be validated on the server.

Shared Zod schemas may help TypeScript client/server boundaries, but Go agent validation remains separate and mandatory.

Browser validation is UX only, never a security boundary.

---

# 60. Structured errors

Propose a safe error envelope.

Example:

```json
{
  "error": {
    "code": "PORT_CONFLICT",
    "message": "Port 8082 is already in use.",
    "requestId": "..."
  }
}
```

Need:

- stable code,
- user-safe message,
- correlation ID,
- internal logs,
- no stack trace to client,
- no secrets.

Map current `DeployError` to this future model.

---

# 61. Correlation IDs

Design tracing across:

```text
browser request
API request
job
deployment
agent command
build/container operation
event
```

Possible IDs:

```text
requestId
jobId
deploymentId
agentCommandId
webhookDeliveryId
```

---

# 62. Authenticated browser security

If sessions use cookies:

- HTTP-only,
- Secure when HTTPS,
- appropriate SameSite,
- CSRF protections,
- same-origin CORS by default,
- Origin/Host checks for critical operations.

Do not use `Access-Control-Allow-Origin: *` for the authenticated control plane.

---

# 63. SSRF

The platform accepts URLs.

Assess SSRF risk for:

- Git URLs,
- image registries,
- health endpoints,
- future webhooks.

Restrict schemes and dangerous inputs.

However, this is a home-lab product where private LAN targets may be intentional.

Design a nuanced policy rather than blocking all private IP space blindly.

---

# 64. Registry credentials

Future private registry credentials must:

- stay server-side,
- be encrypted,
- never appear in logs,
- be passed to Docker/BuildKit only when needed.

Prefer deployed image digests over mutable tag identity.

---

# 65. Garbage collection

Plan safe cleanup for:

- failed workspaces,
- stale build directories,
- unused images,
- BuildKit cache,
- old releases,
- expired logs,
- orphan networks,
- temp uploads.

Never automatically delete a persistent volume just because it is not mounted.

---

# 66. Concurrency

Analyze:

- simultaneous deploys same project,
- multiple project builds,
- restart during deploy,
- server disconnect during build,
- domain update during cutover.

Recommend locking/serialization boundaries.

The existing build-concurrency setting should eventually have real meaning.

---

# 67. Server disconnect/reboot

Define behavior when:

- heartbeat stops,
- Docker goes down,
- host reboots,
- connection is lost during deployment.

Do not instantly mark all unknown state as failed.

Consider states such as:

```text
agent disconnected
unknown
awaiting reconciliation
```

if needed.

---

# 68. Crash recovery

Explain recovery after:

- control-plane restart,
- Postgres restart,
- agent restart,
- Docker restart,
- host reboot,
- browser closes,
- job worker crash.

No real deployment may depend solely on browser memory.

---

# 69. Protocol versioning

Future agent handshake should include:

```text
agentVersion
protocolVersion
capabilities[]
```

Do not assume agent and control plane are always the same release.

---

# 70. Provider migration

Propose how to move from:

```text
mockDeployProvider
```

to:

```text
serverDeployProvider
```

without rewriting the UI.

A development switch may exist:

```text
mock
server
```

but provider selection must not leak secrets into `NEXT_PUBLIC_*`.

---

# 71. Server-only code boundary

Propose a structure similar to:

```text
src/server/
  auth/
  db/
  repositories/
  services/
  jobs/
  agents/
  git/
  secrets/
  domains/
  events/
  logs/
```

Prevent server-only code from being bundled into client components.

---

# 72. Go agent structure

Propose a maintainable Go layout, for example:

```text
agent/
  cmd/arcellite-agent/main.go
  internal/
    api/
    auth/
    config/
    docker/
    build/
    deployments/
    containers/
    networks/
    volumes/
    caddy/
    metrics/
    logs/
    events/
    security/
```

Do not create one giant agent file.

---

# 73. Architecture references

Use existing platforms only as research references.

## Coolify

```text
https://coolify.io/docs/core/what-is-coolify
https://coolify.io/docs/core/docker-and-containers
https://coolify.io/docs/core/networking-in-coolify
```

Study:

- control plane,
- Docker lifecycle,
- private/public networking,
- proxy routing,
- server ownership.

## Dokploy

```text
https://docs.dokploy.com/docs/core/architecture
https://docs.dokploy.com/docs/core/deployment-options
```

Study:

- Next.js control plane,
- PostgreSQL,
- proxy layer,
- remote server patterns.

Do not copy them blindly.

Explain why Arcellite should or should not differ.

---

# 74. Security threat table

The final report must include:

```text
Threat
Attack surface
Impact
Current Phase 1 exposure
Future exposure
Mitigation
Implementation phase
Residual risk
```

Cover at least:

- Docker socket compromise,
- command injection,
- path traversal,
- archive bomb,
- malicious Dockerfile,
- malicious Compose,
- host-mount abuse,
- secret leakage,
- secret leakage through logs,
- CSRF,
- session theft,
- SSRF,
- webhook spoofing,
- webhook replay,
- agent impersonation,
- stolen agent credential,
- unauthorized proxy route,
- privilege escalation,
- container escape,
- resource exhaustion,
- database compromise,
- dependency/supply-chain compromise.

---

# 75. Feature-by-feature backend gap table

For every major feature, use:

```text
Feature
Current implementation
Frontend entry point
Provider method
Mock dependency
Required control-plane backend
Required agent operation
Required database entities
Streaming required?
Security concerns
Recommended phase
```

At minimum cover:

- Projects
- GitHub source
- Upload
- Git URL
- Docker image
- Compose
- Framework analysis
- Environment variables
- Deploy
- Redeploy
- Cancel
- Deployment logs
- Pipelines
- Service status
- Servers
- Containers
- Domains
- Storage
- Databases
- Metrics
- Alerts
- Events
- Activity
- Notifications
- Settings
- Ask Arc

---

# 76. Route-to-backend table

For every dashboard route:

```text
Route
Component(s)
Current data
Current actions
Future API
Future events
Agent dependency
DB dependency
Backend phase
```

---

# 77. Settings ownership audit

Separate current settings into:

```text
browser preference
user preference
workspace setting
server setting
agent setting
security policy
```

Examples of browser-only settings may include sidebar collapse or motion preference.

Workspace deployment defaults should not stay only in localStorage once the system is real.

Verify actual current settings before deciding.

---

# 78. Activity vs audit

Design separately:

## Activity

Human-friendly operational history.

## Audit log

Security-sensitive actions.

Audit examples:

- login,
- secret view/change,
- deployment trigger,
- domain change,
- server enrollment,
- agent rotation,
- destructive container action.

Recommend separate storage/models if appropriate.

---

# 79. Notifications and alerts

Define future event-driven behavior.

Alert examples:

- deployment failure,
- server offline,
- disk pressure,
- crash loop,
- unhealthy route,
- certificate failure.

Consider lifecycle:

```text
open
acknowledged
resolved
```

Do not implement yet.

---

# 80. Test strategy

Propose:

## TypeScript

- domain/service unit tests,
- schema validation,
- API tests,
- repository/database tests,
- provider contract tests.

## Go

- unit tests,
- protocol validation,
- Docker adapter tests,
- filesystem security tests,
- command safety tests.

## Integration

Use disposable environments.

Test:

```text
control plane + Postgres
agent + Docker
deploy image
stream logs
restart
cancel
reconcile after restart
```

## Security

Test:

- traversal archives,
- forbidden Compose features,
- secret redaction,
- invalid webhook signatures,
- duplicate webhook,
- auth failure,
- agent auth failure.

---

# 81. Provider contract tests

Evaluate running the same behavioral suite against:

```text
MockDeployProvider
ServerDeployProvider
```

This can protect the UI during migration.

---

# 82. CI audit

Check whether `.github/workflows` exists.

If not, recommend future CI for:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build

go test ./...
go vet ./...
```

Do not create CI in this audit unless explicitly authorized later.

---

# 83. Backend implementation phases

Your report must produce a staged build plan.

Use small verifiable phases.

Suggested:

## Backend Phase 1 — Control-plane foundation

- PostgreSQL
- migrations
- server-only modules
- authentication baseline
- API contracts
- durable state
- server provider skeleton
- no Docker writes

## Backend Phase 2 — Read-only Go agent

- enrollment
- heartbeat
- server facts
- Docker inventory
- metrics
- protocol/versioning

## Backend Phase 3 — First real deployment

- pre-built Docker image
- durable deployment job
- pull
- create/start container
- health
- logs
- stop/start/restart
- reconciliation

## Backend Phase 4 — Source build

- upload
- safe extraction
- Dockerfile
- BuildKit
- cache
- cancellation
- cleanup

## Backend Phase 5 — Git source

- public Git
- checkout
- commit metadata

## Backend Phase 6 — Automatic builds

- framework detection
- Nixpacks/equivalent

## Backend Phase 7 — Domains

- Caddy
- proxy reconciliation
- TLS
- route health

## Backend Phase 8 — GitHub App

- installation
- private repos
- webhooks
- push deployment

## Backend Phase 9 — Data services

- persistent volumes
- managed databases
- backups

## Backend Phase 10 — Remote/multi-server

- outbound agents
- build workers
- scheduling

Modify this order if you have a better reasoned plan.

---

# 84. Acceptance criteria for each phase

Every phase needs an exact test.

For the first real deployment, something like:

```text
1. Start Arcellite Deploy.
2. Select Docker image source.
3. Enter nginx:alpine.
4. Select home-server.
5. Deploy.
6. A durable deployment record is created.
7. The Go agent receives a typed job.
8. Docker pulls the image.
9. Container starts.
10. Real state appears in UI.
11. Real logs stream.
12. Endpoint opens.
13. Stop works.
14. Start works.
15. Restart works.
16. Control-plane restart does not lose deployment history.
17. Host/agent restart triggers reconciliation.
```

Write acceptance tests for every phase.

---

# 85. Explicit first-version non-goals

Do not recommend building all of this now:

- Kubernetes,
- public hostile multi-tenancy,
- billing,
- marketplace,
- global clusters,
- autoscaling,
- control-plane HA,
- distributed tracing stack,
- arbitrary remote shell,
- AI-driven destructive operations,
- every Git provider,
- every database engine.

Advanced architecture means disciplined boundaries, not maximum technology count.

---

# 86. Questions the report MUST answer

1. What exactly is Arcellite Deploy today?
2. What is real vs simulated?
3. What is the current state architecture?
4. What should remain local in the browser?
5. What moves to Next.js server code?
6. What moves to PostgreSQL?
7. What moves to the Go agent?
8. Is PostgreSQL the right first DB?
9. Should the agent live in this repo or another repo?
10. How should browser → control plane communication work?
11. How should same-host control plane → agent communication work?
12. How should future remote agents connect?
13. How should agent enrollment work?
14. How should credential rotation/revocation work?
15. How do we prevent unrestricted Docker authority?
16. How do we prevent command injection?
17. How do we secure uploads?
18. How do we secure Git?
19. How are builds isolated?
20. How are build secrets passed safely?
21. How should Docker resources be labeled?
22. How should networking work?
23. When are host ports used?
24. How are releases modeled?
25. How do cutover and rollback work?
26. How is health determined?
27. How do logs stream?
28. Where should SSE/WebSocket/gRPC be used?
29. How are metrics sampled?
30. How should Caddy be managed?
31. How is Caddy admin protected?
32. How are domains reconciled?
33. How are environment secrets encrypted?
34. How should authentication work?
35. What is the minimum authorization model?
36. How should GitHub App integration work?
37. How are webhook duplicates prevented?
38. How do jobs survive crashes?
39. How are operations idempotent?
40. How is infrastructure drift reconciled?
41. What happens when an agent goes offline?
42. What happens after host reboot?
43. Which current fields are mock-only?
44. Which provider methods need changes?
45. Which UI flows require new backend capabilities?
46. What is the safest implementation order?
47. What is the first real acceptance test?
48. What must be deferred?
49. What security guarantees can be made after each phase?
50. What EXACTLY should the next coding prompt implement?

---

# 87. Required report file

Create:

```text
BACKEND_DISCOVERY_REPORT.md
```

in the repository root.

Do not create any other backend implementation files in this task.

---

# 88. Required report structure

Use these sections:

```text
1. Executive summary
2. Current product map
3. Current route map
4. Current frontend architecture
5. DeployProvider audit
6. Domain/type audit
7. State and persistence audit
8. Current deployment simulation
9. Project/source flow audit
10. Infrastructure UI audit
11. Observability audit
12. Ask Arc audit
13. Mock-only assumptions
14. Backend requirements derived from the current UI
15. Proposed production architecture
16. Trust boundaries
17. Control-plane responsibilities
18. Go agent responsibilities
19. Agent enrollment and protocol
20. PostgreSQL decision and proposed schema
21. Durable job model
22. Deployment and release lifecycle
23. Docker/BuildKit architecture
24. Runtime security model
25. Networking model
26. Caddy/domain architecture
27. GitHub App architecture
28. Secrets architecture
29. Authentication/session architecture
30. Authorization model
31. Logs/events/metrics architecture
32. Reconciliation and crash recovery
33. Security threat model
34. Feature backend-gap table
35. Route-to-backend table
36. Provider migration plan
37. Type/model migration plan
38. Proposed backend directory structure
39. Backend implementation phases
40. Acceptance test for every phase
41. Risks and open questions
42. Explicit non-goals
43. Exact recommendation for the NEXT coding task
```

---

# 89. Required Mermaid diagrams

Include:

1. Current Phase 1 architecture.
2. Proposed single-server architecture.
3. Future remote-agent architecture.
4. Real deployment sequence.
5. Agent enrollment sequence.
6. Event/log flow.
7. Trust-boundary diagram.

Use actual current code when drawing the current diagram.

---

# 90. File references

Every important statement about the CURRENT application must reference relevant repository files.

For example:

```text
src/lib/deploy/provider.ts
src/lib/deploy/store.ts
src/components/projects/new-project.tsx
```

Do not write a generic platform architecture report disconnected from this repo.

---

# 91. Research sources

Use official sources where possible.

At minimum consult:

## Docker

```text
https://docs.docker.com/engine/security/
https://docs.docker.com/engine/security/protect-access/
https://docs.docker.com/engine/security/rootless/
https://docs.docker.com/build/buildkit/
https://docs.docker.com/build/building/secrets/
```

## Caddy

```text
https://caddyserver.com/docs/api
https://caddyserver.com/docs/automatic-https
https://caddyserver.com/docs/quick-starts/reverse-proxy
```

## GitHub

```text
https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps
https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app
https://docs.github.com/en/rest/apps/apps
```

## OWASP

```text
https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
```

## Comparable deployment systems

```text
https://coolify.io/docs/core/what-is-coolify
https://coolify.io/docs/core/docker-and-containers
https://coolify.io/docs/core/networking-in-coolify
https://docs.dokploy.com/docs/core/architecture
https://docs.dokploy.com/docs/core/deployment-options
```

Use competitor docs for understanding—not copying.

---

# 92. Research facts to validate

Validate, do not merely repeat:

- Docker daemon access is a critical privilege boundary.
- Docker warns about exposing remote daemon access.
- Rootless Docker can reduce daemon/runtime privilege.
- BuildKit is Docker's modern builder.
- BuildKit has dedicated secret support.
- Caddy has a programmable admin API.
- Caddy admin is local by default and can be protected with a Unix socket.
- Caddy supports automatic HTTPS.
- GitHub Apps support installation-scoped repository access.
- GitHub App installation tokens are short-lived.
- GitHub recommends minimum permissions and webhook-driven integrations.
- OWASP recommends least privilege, secure storage, rotation, redaction, and audit for secrets.
- Coolify and Dokploy both demonstrate the value of separating control-plane state from Docker workload state.

---

# 93. Quality bar

Think like all of these at once:

- senior backend engineer,
- platform engineer,
- DevOps engineer,
- security engineer,
- distributed-systems engineer,
- product engineer.

But do not over-engineer.

Prefer:

- clear trust boundaries,
- strong validation,
- durable state,
- typed contracts,
- idempotency,
- least privilege,
- observable operations,
- crash recovery,
- incremental milestones.

Avoid:

- microservices for no reason,
- Redis because it sounds advanced,
- Kubernetes before needed,
- multiple databases without purpose,
- generic shell execution,
- premature clustering.

---

# 94. Final task boundary

Again:

**DO NOT IMPLEMENT THE BACKEND YET.**

The purpose is for us to receive a precise technical report before we authorize changes.

If you discover bugs or missing features:

- document them,
- identify affected files,
- recommend a phase,
- do not fix them.

---

# 95. Final response after creating the report

After writing:

```text
BACKEND_DISCOVERY_REPORT.md
```

reply with only a concise summary containing:

- what you inspected,
- the proposed architecture at a high level,
- the most serious risks,
- the recommended first real backend milestone,
- important changes recommended for `DeployProvider`,
- the report path.

Then stop.

Do not begin Backend Phase 1.

---

# 96. Start

Inspect the entire current repository.

Treat `main` as authoritative.

Understand the product before designing infrastructure.

Create:

```text
BACKEND_DISCOVERY_REPORT.md
```

No implementation yet.
