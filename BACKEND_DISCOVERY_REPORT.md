# Arcellite Deploy — Backend Discovery, Architecture & Security Report

> Stage: **Backend Stage 0** (discovery only). No backend code, dependencies, routes, migrations, or UI changes were made in producing this report.
>
> Scope: `main` at `a61e7b2` ("docs: add Arcellite deploy backend discovery notes"). Specification: `READ_THIRD_ARCELLITE_DEPLOY_BACKEND_DISCOVERY.md`.
>
> Conventions used below:
> - `path:line` references point at the code on `main` as audited. Every statement about the **current** app carries a file reference.
> - "Mock" = behavior that only exists in the browser simulation. "Derived" = computed on the fly from other state. "Synthetic" = invented data (fixtures, sine waves, hashes).
> - Recommendations are marked **Recommendation** and are proposals, not implemented changes.

## How this audit was performed (and its limits)

- **Read in full:** `README.md`, `AGENTS.md`, `CLAUDE.md`, `READ_FIRST_ARCELLITE_DEPLOY.md`, `READ_SECOND_ARCELLITE_DEPLOY_UI_REPAIR.md`, `READ_THIRD_ARCELLITE_DEPLOY_BACKEND_DISCOVERY.md`, `package.json`, `.env.example`, `next.config.ts`, `tsconfig.json`, `vitest.config.mts`, and every file in `src/lib/deploy/` including all four test files. Also read every route file under `src/app/(dashboard)/`, the shell (`src/components/shell/*`, `src/components/nav.ts`, `src/components/providers.tsx`), and every feature view that reads deploy state or calls the provider.
- **Not executed:** `node_modules` is not installed in this container and installing packages was prohibited, so `pnpm test/lint/typecheck/build` were **not run**. Test behavior is described from reading the test source.
- **External research:** direct fetches of `docs.docker.com`, `caddyserver.com`, `docs.github.com`, `cheatsheetseries.owasp.org`, `coolify.io`, and `docs.dokploy.com` are **blocked by this environment's egress policy**. Each §92 research fact was checked through web search against those official domains, using the official page snippets. Those snippets are cited in [Appendix A](#appendix-a--research-validation). Where a detail could only come from background knowledge, the report says so. Re-check those items against the live pages before the phase that depends on them.
- **CI:** `.github/workflows` does not exist (§82). There is no CI today.

---

## Table of contents

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
- Appendix A — Research validation
- Appendix B — Answers to the 50 required questions
- Appendix C — Defects and gaps found (not fixed)

---

# 1. Executive summary

**What Arcellite Deploy is today.** It is a Next.js 16 / React 19 client-rendered control-plane UI (`package.json`) that runs entirely in the browser. Every page reads one in-memory `AppState` snapshot through `useDeployState()` (`src/lib/deploy/react.tsx:20-25`). That snapshot is owned by a module-level store (`src/lib/deploy/store.ts:38-43`), persisted in full to `localStorage` under `arcellite-deploy-state-v2` (`src/lib/deploy/store.ts:34`, `:93-100`), and advanced by a 200 ms `setInterval` (`src/lib/deploy/store.ts:123-132`). Nothing talks to Docker, Caddy, GitHub, a database, or a server agent (`README.md`, "What this build does not do"). There are no API routes, no server actions, no authentication, and no environment variables (`.env.example`).

**What is real vs simulated.** Real: routing, forms, client-side validation (Zod in `src/components/projects/new-project.tsx:39-58`), `.env` parsing (`src/lib/deploy/dotenv.ts`), framework detection *given a file list* (`src/lib/deploy/detect.ts:134-177`), hostname classification (`src/lib/deploy/helpers.ts:112-127`), log search and filtering, and browser preferences. Simulated: every deployment phase, the build, the image, the containers, the ports, server metrics (sine waves, `src/lib/deploy/helpers.ts:150-203`), commit SHAs (an FNV hash, `src/lib/deploy/store.ts:564`), uploads (the bytes are never read, `src/components/projects/new-project.tsx:183-211`), GitHub (a hard-coded account, `src/lib/deploy/store.ts:799-817`), DNS/TLS verification (timers plus a `.invalid` rule, `src/lib/deploy/store.ts:306-334`), uptime percentages (`src/components/status/service-status.tsx:55`), and Ask Arc's "thinking" delay (`src/components/chat/project-chat.tsx:118-133`).

**Proposed architecture (high level).**

- One **Next.js control plane**. It serves the UI and a versioned, resource-oriented `/api/v1` from server-only modules under `src/server/`.
- A separate **control-plane worker process** from the same TypeScript codebase. It runs durable jobs, reconciliation, and event fan-out.
- **PostgreSQL** is the single source of truth for intent, history, secrets ciphertext, jobs, events, and audit. There is no Redis. Jobs use `FOR UPDATE SKIP LOCKED`, and live fan-out uses `LISTEN/NOTIFY`.
- A **Go agent** (`arcellite-agent`) is the *only* component that touches the Docker socket, BuildKit, the host filesystem under `/var/lib/arcellite`, and the Caddy admin socket. It exposes typed semantic commands only. There is never a shell or a generic Docker passthrough.
- **Caddy** is managed by the agent through its JSON admin API bound to a permissioned Unix socket.
- **Browser ↔ control plane:** HTTPS request/response for CRUD, plus one authenticated **SSE** stream for live state and logs.
- **Control plane ↔ agent:** one protocol with versioned typed envelopes and two transports. Same-host uses HTTP over a Unix socket. Remote agents later use an outbound, mutually authenticated WebSocket over TLS.

**Most serious risks.**

1. The Docker socket is root-equivalent, so the agent is a root-equivalent component. Its API surface must stay small and typed.
2. Untrusted source (archives, Git, Dockerfiles, Compose) running on the same host.
3. Secrets are plaintext in `localStorage` today, including database passwords in fixtures (`src/lib/deploy/fixtures.ts:817`, `:834`) and a password in a fixture log line (`src/lib/deploy/fixtures.ts:612`). The UI also exposes reveal/copy of saved secrets (`src/components/environment/environment-view.tsx:195`). A real backend must reverse this model.
4. There is no authentication, and the product will be network-reachable on a LAN.
5. The current contract assumes the browser owns the whole world state. It ships all of `AppState` to every view, and views compute logs, metrics, and deployment progress themselves, bypassing the provider (§5.3).

**Recommended first real backend milestone.**

- **Backend Phase 1 — Control-plane foundation, no Docker writes.** PostgreSQL plus migrations, `src/server/*` server-only modules, owner bootstrap plus session authentication, `/api/v1` for projects / environment (encrypted) / settings / activity / audit, a durable jobs table (no executors that touch hosts yet), and a `ServerDeployProvider` skeleton behind a server-side `ARCELLITE_PROVIDER=mock|server` switch. Mock remains the default.
- **First real infrastructure proof (Phase 3).** A pre-built image deployment such as `nginx:alpine` through the agent, with a direct host port, real logs, stop/start/restart, and reconciliation after restart.

**Key `DeployProvider` changes.**

- Split "whole-world snapshot" into resource queries plus an event stream.
- Route logs, metrics, and deployment progress through the provider. Today `metrics()` and `logs()` are never called (§5.3).
- Add idempotency keys to every mutation.
- Make secrets write-only, with an explicit, audited reveal.
- Separate environment-variable writes from `updateProject`.
- Replace `connectGitHub()` with an install-redirect flow.
- Move `resetDemo`, `clearWorkspace`, and `simulateFailure` into a mock-only dev extension.
- Replace `containerAction(id, action)` with confirmed, typed operations on *managed* containers.
- Return structured errors with stable codes instead of `DeployError(title, detail)` (`src/lib/deploy/types.ts:472-482`).

---

# 2. Current product map

## 2.1 Navigation (verified)

Source: `src/components/nav.ts:30-65`, bottom items `:67-69`, sidebar `src/components/shell/sidebar.tsx`.

| Group | Items (href) |
|---|---|
| Workspace | Overview `/`, Ask Arc `/chat`, Projects `/projects`, Deployments `/deployments` |
| Infrastructure | Servers `/servers`, Storage `/storage`, Domains `/domains`, Containers `/containers`, Databases `/databases` |
| Observe | Logs `/logs`, Alerts `/alerts`, Events `/events`, Metrics `/metrics`, Activity `/activity`, Pipelines `/pipelines`, Environment `/environment` |
| Bottom | Docs `/docs`, Settings `/settings`, Notifications `/notifications` |
| Profile menu | Profile `/profile`, Workspace settings, Developer tools `/developer`, Help & docs, Sign Out. Sign Out is a toast only: "No account to sign out of" (`src/components/shell/sidebar.tsx:180-192`). |
| Hidden / aliases | `/jobs` permanently redirects to `/pipelines` (`src/app/(dashboard)/jobs/page.tsx`). `/developer` is reachable only from the profile menu and the palette. |

Global surfaces:

- **Command palette** (⌘K/Ctrl K, `src/components/shell/shell.tsx:26-36`, `src/components/shell/command-palette.tsx`). It runs `searchGlobal` over the snapshot (`src/lib/deploy/filters.ts:88-151`).
- **Onboarding modal.** Three steps, completed through `deploy.completeOnboarding()` (`src/components/shell/onboarding.tsx:20-23`).
- **Toasts** (`src/components/ui/toast.tsx`), with per-browser preferences (`src/lib/toast-prefs.ts:13`).
- **Route transition template** (`src/app/(dashboard)/template.tsx`) and a route-level error boundary (`src/app/(dashboard)/error.tsx`).

## 2.2 Feature inventory

| Area | What the UI offers today | Backed by |
|---|---|---|
| Overview | Greeting, stat tiles, notices (server offline, failed projects, domains awaiting DNS), projects, "Releases this week" chart, latest deployments, server resources, activity, Ask Arc entry (`src/components/overview/overview-view.tsx:25-173`) | Snapshot, derived |
| Ask Arc | Rule-based Q&A over the snapshot, conversation history (`src/components/chat/project-chat.tsx`, `src/lib/deploy/assistant.ts`) | Snapshot and `localStorage` |
| Projects | Search/filter/sort, redeploy, logs, settings, copy endpoint, delete (`src/components/projects/projects-view.tsx:33-165`) | Store actions |
| New project | Five source routes (GitHub, upload, git, image, compose), analysis, configure, deploy (`src/components/projects/new-project.tsx`) | Store actions |
| Project detail | Overview, Deployments, Logs, Environment, Domains, Settings tabs (`src/components/projects/project-frame.tsx:19-26`, `project-panels.tsx`) | Store actions |
| Deployments | Table plus filters, service-status board, deployment detail with pipeline, logs, cancel, redeploy (`src/components/deployments/*`) | Engine materialization |
| Servers | Fleet list, detail with tabs, refresh/restart agent/disconnect/reconnect (`src/components/servers/*`) | Store actions, synthetic metrics |
| Containers | Table, inspect modal, start/stop/restart with confirmation (`src/components/containers/containers-view.tsx:44-178`) | Store actions |
| Domains | Local endpoints, hostnames, add/verify/remove, DNS records (`src/components/domains/domains-view.tsx`) | Store actions, timers |
| Storage | Volume cards and details (`src/components/storage/storage-view.tsx`) | Read-only fixtures |
| Databases | Services, credentials reveal/copy (`src/components/databases/databases-view.tsx`) | Read-only fixtures |
| Logs | Global log console, per-target log streams (`src/components/logs/*`) | `collectLogs` directly |
| Metrics | Server telemetry, container ranking (`src/components/metrics/metrics-view.tsx`) | `serverMetrics` directly |
| Alerts | Derived alerts and checks (`src/components/alerts/alerts-view.tsx:46-80`) | Derived |
| Events / Activity / Notifications | Three views over `state.activity` (`events-view.tsx`, `activity-view.tsx`, `notifications-view.tsx:27-32`) | Persisted in the snapshot |
| Pipelines | Pipeline runs plus per-stage analytics (`src/components/pipelines/pipelines-view.tsx:37-64`) | Engine materialization |
| Environment | Cross-project variable manager, `.env` import, reveal/copy (`src/components/environment/environment-view.tsx`) | `updateProject` |
| Settings | General, Appearance, Notifications, Git providers, Deployment defaults, Security, Server agent (`src/components/settings/settings-view.tsx:21`) | `updateSettings`, `toast-prefs` |
| Profile | Display name (`src/components/profile/profile-view.tsx:60`) | `updateSettings` |
| Developer tools | Provider/schema stats, developer mode, load demo, clear workspace, export JSON (`src/components/developer/developer-view.tsx`) | Store actions |
| Docs | Static guide (`src/components/docs/docs-view.tsx`) | Static |

---

# 3. Current route map

Every `page.tsx` under `src/app/(dashboard)/` is a thin **server component** that sets `metadata` and renders a **client** view. All data access happens client-side after hydration. The shared layout wraps everything in `Shell` (`src/app/(dashboard)/layout.tsx`). The project routes are additionally wrapped in `ProjectFrame` (`src/app/(dashboard)/projects/[projectId]/layout.tsx`).

Legend:

- **LS** = `localStorage` keys touched.
- **Methods** = `DeployProvider` methods invoked.
- **Stream** = a live stream is needed in the real system.
- **Sens.** = security sensitivity (L/M/H/Critical).
- **Phase** = the recommended backend phase from §39.

Every route reads `arcellite-deploy-state-v2` through the store, which is loaded once by `bootStore` (`src/lib/deploy/store.ts:403-423`). "All" in the LS column refers to that key.

| Route | Page → main component | Major children | Data read | Actions | Methods | LS | Real backend requirement | Stream | Sens. | Phase |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | `page.tsx` → `OverviewView` (`src/components/overview/overview-view.tsx`) | `ReleaseChart`, stat tiles, notices | projects, deployments, containers, domains, servers[0], activity, settings | Links only | none | All | Aggregated read endpoints (summary), server facts | Yes (deploy/server status) | M | 1 (read), 2 (server), 3 (deploys) |
| `/chat` | `ProjectChat` (`src/components/chat/project-chat.tsx`) | `ThinkingOrb`, history drawer | Entire snapshot via `answerProjectQuestion` | Ask, new chat, history | none | `arcellite-project-chat-v1`, `arcellite-project-chat-history-v1` | Read-only query API; conversations stay browser-side at first | No | M (reads everything) | 1 (read-only over API) |
| `/projects` | `ProjectsView` (`src/components/projects/projects-view.tsx`) | `ProjectsTable`, `ConfirmDialog` | projects, deployments, servers[0].ip | Redeploy, delete, copy endpoint | `redeploy`, `deleteProject` | All | `GET/DELETE /projects`, `POST /deployments` | Status updates | H (delete, deploy) | 1 (CRUD), 3 (deploy) |
| `/projects/new` | `NewProjectView` (`src/components/projects/new-project.tsx`) | Source cards, `DeployTargetCard` | settings, servers, projects | Choose source | none | All | None beyond settings | No | L | 1 |
| `/projects/new/[source]` (`github`, `upload`, `git`, `image`, `compose`, `src/app/(dashboard)/projects/new/[source]/page.tsx:7`) | `NewProjectView source=` | Repo picker, dropzone, URL form, analyze, configure, `EnvEditor` | repositories, github, settings, projects | Connect GitHub, analyze, create + deploy | `connectGitHub`, `createProject`, `startDeployment` | All | Source intake (upload store, git probe, registry probe), server analysis, project create, idempotent deployment create | Upload progress; analysis progress | Critical (untrusted source intake, secrets entry) | image: 3, upload: 4, git: 5, auto: 7, github: 8, compose: deferred |
| `/projects/[projectId]` | `ProjectFrame` + `ProjectOverview` (`src/components/projects/project-panels.tsx:60-179`) | `ProjectStatusCard`, stat cards | project, deployments, containers, domains, servers | Redeploy, copy/open endpoint | `redeploy` | All | Project read, release/runtime summary | Yes | M | 1/3 |
| `/projects/[projectId]/deployments` | `ProjectDeployments` (`project-panels.tsx:190-320`) | Timeline, summary bars | deployments of the project | Redeploy latest | `redeploy` | All | Paginated deployments per project | Yes | M | 3 |
| `/projects/[projectId]/logs` | `ProjectLogs` → `LogStream target="project"` (`project-panels.tsx:324-328`) | `LogStream` | `collectLogs` over the snapshot | Search, level, pause, follow, copy, download | none (bypasses `logs()`) | All | Log query plus tail with cursor | Yes | H (may leak secrets) | 3 |
| `/projects/[projectId]/environment` | `ProjectEnvironment` (`project-panels.tsx:332-404`) | `EnvEditor` | project.env, **plaintext values** | Add/edit/delete/reveal, save | `updateProject({env})` | All | Encrypted env var API, write-only secrets, audited reveal | No | Critical | 1 |
| `/projects/[projectId]/domains` | `ProjectDomains` (`project-panels.tsx:408-528`) | Domain cards | domains, project.exposedPort, servers[0].ip | Add, verify, remove | `addDomain`, `verifyDomain`, `deleteDomain` | All | Desired routes plus DNS check plus Caddy apply | Yes (status) | H | 6 (per §39 order) |
| `/projects/[projectId]/settings` | `ProjectSettingsForm` (`project-panels.tsx:553-728`) | Settings groups | project, settings.developerMode | Save, delete, simulate failure | `updateProject`, `deleteProject` | All | Validated project patch, soft delete plus teardown job | No | H | 1 (config), 3 (teardown) |
| `/deployments` | `DeploymentsView` (`src/components/deployments/deployments-view.tsx`) | `DataTable`, `ServiceStatusBoard` | deployments (materialized locally, `:35`), projects | Redeploy via menu (`:89`), copy | `redeploy` | All | Paginated, filterable deployments | Yes | M | 3 |
| `/deployments/[deploymentId]` | `DeploymentDetail` (`src/components/deployments/deployment-detail.tsx`) | Pipeline, `LogStream target="deployment"` | one deployment (materialized locally, `:42`), project, servers[0].ip | Cancel, redeploy, copy ID, open commit, visit | `cancelDeployment`, `redeploy` | All | Deployment read plus step events plus build log stream plus cancel | **Yes (core)** | H | 3 |
| `/servers` | `ServersView` (`src/components/servers/servers-view.tsx`) | Fleet cards, workloads | servers, containers, projects | Refresh, restart agent | `refreshServer`, `restartAgent` | All | Server facts, heartbeat, inventory | Yes | H | 2 |
| `/servers/[serverId]` | `ServerDetail` (`src/components/servers/server-detail.tsx`) | Tabs | server, `serverMetrics()` directly (`:39`), containers, volumes, activity | Refresh, restart agent, disconnect, reconnect | `refreshServer`, `restartAgent`, `disconnectServer`, `reconnectServer` | All | Agent lifecycle (pause scheduling, revoke, rotate) | Yes | Critical (agent identity) | 2 |
| `/containers` | `ContainersView` (`src/components/containers/containers-view.tsx`) | Table, inspect modal, confirm | containers, servers, projects | Start/stop/restart | `containerAction` | All | Observed inventory, typed lifecycle commands on managed containers | Yes | H | 2 (read), 3 (control) |
| `/domains` | `DomainsView` (`src/components/domains/domains-view.tsx`) | Endpoints, hostnames, add modal | projects, domains, servers[0] | Add (with a custom target port), verify, remove | `addDomain`, `verifyDomain`, `deleteDomain` | All | As for project domains | Yes | H | 6 |
| `/storage` | `StorageView` (`src/components/storage/storage-view.tsx`) | Volume cards | volumes, servers[0] | Inspect only | none | All | Volume inventory, attachments, backups | No | M | 9 |
| `/databases` | `DatabasesView` (`src/components/databases/databases-view.tsx`) | Credential modal | databases (**plaintext password**), containers, volumes | Reveal/copy password | none | All | Managed DB services, generated credentials, audited reveal | No | Critical | 9 |
| `/logs` | `LogsView` → `LogStream allowTarget insights` (`src/components/logs/logs-view.tsx:16`) | Log console | `collectLogs` directly | Search, filter, pause, copy, download | none | All | Log query plus tail over categories | Yes | H | 3 |
| `/metrics` | `MetricsView` (`src/components/metrics/metrics-view.tsx`) | Charts | `serverMetrics()` directly (`:41`), containers | Refresh | `refreshServer` | All | Metric series (downsampled), container stats | Yes (or poll) | L | 2 |
| `/events` | `EventsView` (`src/components/events/events-view.tsx`) | Paged timeline | `state.activity` | Filter | none | All | Event query | Optional | M | 1 |
| `/alerts` | `AlertsView` (`src/components/alerts/alerts-view.tsx`) | Alert list, checks | Derived from the snapshot (`collect()`, `:46`) | Links | none | All | Alert records with lifecycle | Yes | M | 3+ (basic), later |
| `/activity` | `ActivityView` (`src/components/activity/activity-view.tsx`) | `ActivityTimeline` | `state.activity` | Filter | none | All | Activity query (paginated) | Optional | M | 1 |
| `/pipelines` | `PipelinesView` (`src/components/pipelines/pipelines-view.tsx`) | Stage analytics, runs | deployments (materialized, `:37-38`) | Filter | none | All | Deployment plus step query, aggregates | Yes | M | 3 |
| `/environment` | `EnvironmentView` (`src/components/environment/environment-view.tsx`) | Project rail, `.env` import | all projects' env **with values** | Add, import, reveal, copy, delete | `updateProject({env})` | All | Encrypted env API, bulk import, audited reveal | No | Critical | 1 |
| `/notifications` | `NotificationsView` (`src/components/notifications/notifications-view.tsx`) | Timeline | activity filtered by `notify*` settings (`:27-32`) | Filter | none | All | Notification feed plus preferences | Optional | L | 1 (feed), later (delivery) |
| `/settings` | `SettingsView` (`src/components/settings/settings-view.tsx`) | Sections | settings, github, servers, projects' env counts | Save settings, connect/disconnect GitHub, restart agent, toast prefs | `updateSettings`, `connectGitHub`, `disconnectGitHub`, `restartAgent` | All + `arcellite-toast-prefs-v1` | Workspace/user settings API, GitHub App install | No | H | 1 (settings), 8 (GitHub) |
| `/profile` | `ProfileView` (`src/components/profile/profile-view.tsx`) | — | settings.displayName, activity | Rename | `updateSettings` | All | User profile API | No | M | 1 |
| `/developer` | `DeveloperView` (`src/components/developer/developer-view.tsx`) | — | Entire state (JSON export, `:46-54`) | Developer mode, load demo, clear, export | `updateSettings`, `resetDemo`, `clearWorkspace` | All | **Mock-only.** Must not exist against a real backend except as an admin-only diagnostic. | No | Critical if ported (bulk delete/export) | Mock only |
| `/docs` | `DocsView` (`src/components/docs/docs-view.tsx`) | — | Static | Links | none | none | None | No | L | — |
| `/jobs` | Redirect → `/pipelines` | — | — | — | — | — | — | — | — | — |
| Root `not-found` | `src/app/not-found.tsx` | — | — | — | — | — | — | — | — | — |

---

# 4. Current frontend architecture

## 4.1 Current Phase 1 architecture (diagram 1 of 7)

```mermaid
flowchart TB
  subgraph Browser["Browser tab (everything runs here)"]
    direction TB
    RootLayout["app/layout.tsx<br/>themeBootScript (localStorage prefs pre-paint)"]
    Providers["components/providers.tsx<br/>DeployProvider → ToastProvider → MotionBridge"]
    Ctx["lib/deploy/react.tsx<br/>DeployContext = mockDeployProvider<br/>useDeployState() via useSyncExternalStore"]
    Mock["lib/deploy/mock-provider.ts<br/>wraps store actions in Promise.resolve"]
    Store["lib/deploy/store.ts<br/>module singleton AppState<br/>listeners · commit() · tick() every 200ms"]
    Engine["lib/deploy/engine.ts<br/>PIPELINE timeline · materializeDeployment()"]
    Helpers["helpers.ts / logs.ts / detect.ts / filters.ts<br/>serverMetrics() sine waves · collectLogs() · detection"]
    Fixtures["fixtures.ts<br/>createInitialState / createEmptyState"]
    Views["Feature views (components/*)<br/>read snapshot; ALSO call engine/logs/helpers directly"]
    Chat["chat/project-chat.tsx + assistant.ts<br/>rule-based answers"]
    LS[("localStorage<br/>arcellite-deploy-state-v2 · theme · motion · sidebar<br/>toast prefs · chat · chat history")]
  end
  RootLayout --> Providers --> Ctx --> Mock --> Store
  Store --> Engine
  Store --> Helpers
  Store --> Fixtures
  Store <--> LS
  Views -->|useDeployState| Ctx
  Views -->|mutations| Mock
  Views -.->|bypass provider| Engine
  Views -.->|bypass provider| Helpers
  Chat -->|reads snapshot| Ctx
  Chat <--> LS
  NoServer["No API routes · no server actions · no DB · no Docker · no auth"]:::none
  classDef none fill:#fff,stroke:#e11d48,stroke-dasharray:4 3,color:#e11d48
```

## 4.2 Shell audit (§5)

| Element | File | Purely visual? | Uses deploy state? | Notes |
|---|---|---|---|---|
| Header, breadcrumb, search chip, "New Project" CTA | `src/components/shell/shell.tsx:39-62`, `crumbLabel` `:108-139` | Yes | No | Breadcrumb comes from the pathname only. |
| Mobile drawer | `src/components/shell/shell.tsx:64-101` | Yes | No | |
| Sidebar nav, collapse | `src/components/shell/sidebar.tsx:15-49`, `Sidebar` `:255-263` | Yes | No | Collapse is stored in `localStorage["arcellite-deploy-sidebar"]` (`:38`) and in `documentElement.dataset.sidebar`. It is read pre-paint by `src/lib/theme-script.ts`. |
| Sidebar counters | `src/components/shell/sidebar.tsx:82-87` | — | **Yes** | Containers, domains, volumes (Storage), and databases counts come straight from the snapshot. With a real backend these depend on **observed** inventory (containers, volumes) and **desired** state (domains, databases). They should come from a cheap `GET /api/v1/summary` plus events, not from shipping full collections. |
| Profile card | `src/components/shell/sidebar.tsx:78-80`, `:150-192` | — | Yes (`settings.displayName`, `settings.workspaceName`) | These become **user** and **workspace** attributes. |
| Command palette | `src/components/shell/command-palette.tsx:24-34` | — | Yes (`searchGlobal` over the full snapshot) | Needs a server search endpoint (`GET /api/v1/search?q=`), or it can search the client cache only. |
| Onboarding | `src/components/shell/onboarding.tsx:13-21` | — | Yes (`onboardingComplete`, the home server) | Becomes the **user** flag `onboarding_completed_at`. Real first-run is the admin bootstrap (§29). |
| Providers / motion | `src/components/providers.tsx:8-27` | — | Yes (`settings.motion`) | Motion is a **browser** preference that is currently stored inside the domain state. |

**Hydration today.**

1. `app/layout.tsx` injects `themeBootScript`, which sets `data-theme`, `data-motion`, and `data-sidebar` from `localStorage` before paint (`src/lib/theme-script.ts`).
2. On the server, and before boot, `getSnapshot()` returns `serverSnapshot = createEmptyState(0)` (`src/lib/deploy/store.ts:38`, `:58-64`) and `isReady()` is false. `useDeployState()` therefore returns `null` (`src/lib/deploy/react.tsx:20-25`), and every view renders a skeleton. That is why pages are client-only in practice.
3. `DeployProvider`'s `useEffect` calls `bootStore()` (`src/lib/deploy/react.tsx:12`). This reads `localStorage` (or creates an empty state), sets `ready = true`, emits, and runs `tick()` (`src/lib/deploy/store.ts:403-423`).
4. The timer runs only while something is pending (`hasPending`, `src/lib/deploy/store.ts:114-121`).

**Browser-only preferences (keep local).** Sidebar collapse, motion (`reduce/full/system`), toast position/style (`src/lib/toast-prefs.ts`), the legacy theme choice (`THEME_KEY`, `src/lib/deploy/store.ts:35`), and the chat drafts/history for now.
**Move to user/workspace later.** Display name, time zone, notification toggles, onboarding completion, workspace name, and deployment defaults (see §7.3).

## 4.3 Frontend layering observations

- **Every data view is a client component.** Server components only set metadata. This is compatible with a provider-driven client cache. Later, server components can prefetch initial data for first paint.
- **Views bypass the provider for derived data.** `collectLogs` (`src/components/logs/logs-view.tsx:16`, `src/components/logs/log-stream.tsx:59`), `serverMetrics` (`src/components/metrics/metrics-view.tsx:41`, `src/components/servers/server-detail.tsx:39`), and `materializeDeployment` (`src/components/deployments/deployments-view.tsx:35`, `deployment-detail.tsx:42`, `pipelines-view.tsx:38`, and via `latestDeployment`/`deploymentsFor` in `src/lib/deploy/helpers.ts:69-92`) are called directly. This is the single largest migration obstacle (§36).
- **Client time drives state.** `useNow(200)` on the deployment page (`src/components/deployments/deployment-detail.tsx:27`) and `useNow(1000)` elsewhere make wall-clock time an input to rendering deployment state. In a real system time must only format server-reported timestamps.

---

# 5. DeployProvider audit

## 5.1 How the abstraction works today

- **Interface.** `DeployProvider` (`src/lib/deploy/provider.ts:18-44`) mixes an external-store protocol (`subscribe`, `isReady`, `getSnapshot`, `getServerSnapshot`) with 21 async commands and 2 async queries.
- **Mock implementation.** `mockDeployProvider` (`src/lib/deploy/mock-provider.ts:9-36`) forwards to the synchronous `actions` in `store.ts` and wraps results in `Promise.resolve` (`:4-6`). A thrown `DeployError` therefore becomes a *synchronous throw inside the arrow function*, which surfaces as a rejected promise only because the call sites use `.then(ok, err)` or `await`.
- **Injection into React.** `DeployContext` defaults to the mock (`src/lib/deploy/react.tsx:9`). The `DeployProvider` component **always** provides `mockDeployProvider` (`:13`), so there is no selection mechanism yet.
- **Subscriptions and snapshots.** `useSyncExternalStore(deploy.subscribe, deploy.getSnapshot, deploy.getServerSnapshot)` (`src/lib/deploy/react.tsx:23`). The store replaces `current` immutably on each `commit` and notifies all listeners (`src/lib/deploy/store.ts:45-47`, `:134-140`). Any change re-renders every subscribed view, which is acceptable for a mock but not for large real datasets.

## 5.2 Per-method verdict

Column key:

- **Keep** = keep as-is.
- **Ren** = rename.
- **Pag** = needs pagination.
- **Filt** = needs filtering.
- **Idem** = needs idempotency.
- **Auth** = needs auth context.
- **Strm** = needs a streaming equivalent.
- **Srv** = executes only server-side.
- **Agt** = executes through the agent.
- **Split** = should be split into multiple operations.

| Method (`provider.ts`) | Keep | Ren | Pag | Filt | Idem | Auth | Strm | Srv | Agt | Split | Notes / recommended shape |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `subscribe` | Pattern yes | — | — | — | — | Yes (session) | **Is** the stream | — | — | Yes | Keep the external-store pattern for the client cache. Feed it from `GET /api/v1/events/stream` (SSE) with per-topic subscriptions (`deployment:<id>`, `project:<id>`, `server:<id>`) instead of one global emitter. |
| `isReady` | Yes | — | — | — | — | — | — | — | — | — | Means "initial cache loaded". |
| `getSnapshot` | Changed | → cache getter | — | — | — | Yes | — | — | — | Yes | Must no longer return the whole world including secret values. Return a **normalized client cache of sanitized DTOs**. Collections are loaded per page or view (see §36). |
| `getServerSnapshot` | Yes | — | — | — | — | — | — | — | — | — | Keep the empty snapshot, or a server-prefetched initial cache later. |
| `createProject` | Changed | — | — | — | **Yes** | Yes | — | Yes | No | Yes | Validate server-side (Zod). The env payload goes through the env API with encryption. Source intake (upload ID, git URL, image ref) is a separate prior step that returns a `sourceId`. Do not start a deployment implicitly. |
| `updateProject` | Changed | — | — | — | Yes (version) | Yes | — | Yes | No | **Yes** | Remove `env` from `ProjectPatch` (`src/lib/deploy/types.ts:412-437`) and move it to `setEnvironmentVariables`. Remove `simulateFailure` (mock-only). Add optimistic concurrency (`If-Match`/`version`). `hostname` edits must go through domains. |
| `deleteProject` | Changed | → `archiveProject` + `teardownProject` | — | — | Yes | Yes (confirm) | Job events | Yes | Yes (teardown) | Yes | Today it hard-deletes history (`src/lib/deploy/store.ts:519-548`). Real: soft-delete the project, create a teardown job (stop containers, remove routes), and keep deployments/audit. **Volumes are never auto-deleted.** |
| `startDeployment` | Changed | → `createDeployment` | — | — | **Yes** | Yes | **Yes** | Yes | Yes (via job) | — | Returns `{deployment, job}` immediately (202). Takes `{projectId, idempotencyKey, source ref/commit}`. |
| `cancelDeployment` | Yes | → `requestCancelDeployment` | — | — | Yes (natural) | Yes | Yes | Yes | Yes | — | Cancellation is a *request*. The final state arrives via events (`canceling` → `canceled`). |
| `redeploy` | Changed | → `createDeployment({fromReleaseId? / latest source})` | — | — | Yes | Yes | Yes | Yes | Yes | Yes | Today identical to `startDeployment` (`src/lib/deploy/store.ts:602-604`). Real systems need **rebuild latest source** vs **redeploy existing release (image digest)** vs **rollback to release X** (§22). |
| `refreshServer` | Changed | → `requestServerRefresh` | — | — | Natural | Yes | Yes | Yes | Yes (GetHostInfo) | — | Today it mutates synthetic numbers (`src/lib/deploy/store.ts:606-623`). Real: optional. Metrics arrive continuously, so this triggers an immediate fact re-collection. |
| `restartAgent` | Changed | → `requestAgentRestart` | — | — | Yes | Yes (manage_server) | Yes | Yes | Yes (agent asks systemd to restart itself) | — | Audited. Allowed only when connected. |
| `disconnectServer` | Changed | → `cordonServer` / `revokeAgent` | — | — | Yes | Yes (manage_server) | — | Yes | Partly | **Yes** | The current semantics are ambiguous. It sets `offline` locally (`src/lib/deploy/store.ts:643-665`). Real systems need **cordon** (stop scheduling new work, reversible) and **revoke** (invalidate credentials, irreversible without re-enroll). |
| `reconnectServer` | Changed | → `uncordonServer` / `createEnrollmentToken` | — | — | Yes | Yes | — | Yes | — | Yes | A server cannot be "reconnected" by clicking. The agent reconnects itself. |
| `containerAction(id, action)` | Changed | → `startContainer`/`stopContainer`/`restartContainer` | — | — | Yes | Yes (control_container) | Yes | Yes | Yes | Yes | Only **Arcellite-managed** containers (label check on the agent). The response is an accepted operation, and the final state comes via events. Unmanaged containers are read-only. |
| `addDomain` | Changed | → `createDomain` | — | — | Yes | Yes (manage_domain) | Yes | Yes | Yes (Caddy apply) | — | Returns the desired domain with `status=requested`. DNS/TLS progress arrives via events. |
| `verifyDomain` | Yes | → `requestDomainCheck` | — | — | Natural | Yes | Yes | Yes | CP does DNS, agent does proxy | — | |
| `deleteDomain` | Yes | — | — | — | Yes | Yes | Yes | Yes | Yes | — | Route removal is a job. |
| `connectGitHub` | **Replace** | → `beginGitHubInstallation(): {redirectUrl}` | — | — | — | Yes | — | Yes | No | Yes | GitHub App install/OAuth redirect plus a callback route. See §27. |
| `disconnectGitHub` | Changed | → `removeGitInstallation(id)` | — | — | Yes | Yes | — | Yes | No | — | Local unlink, plus a pointer to uninstall on GitHub. |
| `updateSettings` | Changed | — | — | — | Yes (version) | Yes | — | Split | No | **Yes** | Split into `updateUserPreferences`, `updateWorkspaceSettings`, and browser-local prefs (§7.3). Validate every field. |
| `completeOnboarding` | Yes | — | — | — | Natural | Yes | — | Yes | No | — | User-scoped. |
| `resetDemo` | **Mock-only** | — | — | — | — | — | — | — | — | — | Move to `MockDevTools` extension. Never exposed by the server provider. |
| `clearWorkspace` | **Mock-only** | — | — | — | — | — | — | — | — | — | Same. A real equivalent ("delete workspace") is an owner-only, multi-step, audited operation and out of scope. |
| `metrics(serverId)` | Changed | → `getServerMetrics(serverId, {range, step})` + stream | — | Range | — | Yes | **Yes** | Yes | Agent samples | — | **Currently unused.** Views call `serverMetrics` directly (§5.3). |
| `logs(query)` | Changed | → `queryLogs({target, level, search, cursor, limit})` + `tailLogs(...)` | **Yes** | **Yes** | — | Yes | **Yes** | Yes | Agent tails | Yes | **Currently unused.** Views call `collectLogs` directly. |

**Missing methods the UI implicitly needs:**

- `listProjects`, `getProject`, `listDeployments(projectId?, cursor)`, `getDeployment`, `listServers`, `getServer`, `listContainers`, `listDomains`, `listVolumes`, `listDatabases`, `listActivity`, `listEvents`, `search`, and `getSummary`.
- `listGitRepositories`, `listBranches`, `analyzeSource(sourceId)`, `createUploadSession`, `probeGitUrl`, and `resolveImage`.
- `setEnvironmentVariables`, `revealSecret(varId)` (audited), and `importDotenv`.
- `rollback(projectId, releaseId)`.
- `listAlerts` and `ackAlert`.

## 5.3 Should the provider remain the main frontend boundary?

**Yes, with a reshaped contract.** The provider is the correct seam. Every mutation in the UI already goes through `useDeploy()` (see the `deploy.*` call sites, for example `src/components/projects/new-project.tsx:240-263`, `src/components/containers/containers-view.tsx:47`, and `src/components/settings/settings-view.tsx:77`). Three issues must be fixed first, while still on the mock, so the UI stops depending on mock internals:

1. **Derived-data bypasses.** Views import `collectLogs`, `serverMetrics`, and `materializeDeployment` from `src/lib/deploy/*` and compute results locally (§4.3). With a server provider these results come from the backend. Fix by adding provider hooks (`useLogs(query)`, `useServerMetrics(id, range)`, `useDeployment(id)`) whose mock implementation calls the existing functions.
2. **Whole-world snapshot.** `AppState` includes secret values (`Project.env[].value`, `DatabaseService.password`) and all history. It must become a sanitized, partially loaded cache.
3. **Errors.** `DeployError(title, detail)` has no code, so UI branching is by `instanceof` only. Adopt the error envelope (§17.4).

---

# 6. Domain/type audit

## 6.1 Classification of every type in `src/lib/deploy/types.ts`

Categories: **UI** = UI view model · **Entity** = durable control-plane entity · **Observed** = observed host state · **DTO** = API DTO · **Proto** = agent protocol message · **VO** = value object · **Mock** = mock-only artifact.

| Type (line) | Classification | Notes / mock-only fields |
|---|---|---|
| `SCHEMA_VERSION` (1) | Mock | Browser storage schema. Unrelated to DB migrations. |
| `Framework` (3) | VO | Keep as a build-plan hint. Future builders may add `railpack`/`custom`. |
| `EnvironmentName` (15) | VO → Entity | Today a fixed union. Later an `environments` table (§20) if preview environments become first-class. |
| `DeploymentStatus` (17) | VO (DTO) | `stopped` is never produced for a deployment by the engine or store. It only appears through `projectBadge` (`src/lib/deploy/helpers.ts:82-85`), which conflates runtime state with deployment state. Future: add `canceling`, `interrupted`, and `superseded`; move `stopped` to the release/runtime. |
| `DeploymentPhase` (27) | VO | Fixed seven phases. Future steps are source-dependent (§22.2). |
| `StepStatus` (37) | VO | Add `skipped`. |
| `RestartPolicy` (39) | VO | Maps 1:1 to Docker restart policies. `always` needs care (§24). |
| `ServerStatus` (41) | VO | Future: `online`, `degraded`, `disconnected`, `unknown`, `cordoned`, `revoked`. |
| `ContainerState` (43) | Observed VO | Docker states also include `created`, `paused`, `dead`, `removing`. The mock `stopped` vs `exited` distinction is not a Docker distinction (Docker reports `exited` with an exit code). |
| `DomainKind` (45) | VO | `local` is declared but never produced by `classifyHostname` (`src/lib/deploy/helpers.ts:112`). The local endpoint is derived from the port instead. |
| `DomainStatus` (47) | VO | Future lifecycle in §26. |
| `SslState` (55) | VO, **Mock value** | `simulated-active` is mock-only. |
| `LogLevel` (57) | VO | |
| `ThemeChoice` (59) | UI (browser pref) | Legacy. The split shell is fixed (`src/lib/deploy/store.ts:108-110`). |
| `MotionChoice` (61) | UI (browser pref) | |
| `ProjectSource*` (63-102) | Entity (project_sources) + DTO | `ProjectSourceUpload.size` is set from browser `File.size` (`new-project.tsx:189`) and must be server-measured. `ProjectSourceDockerfile` has **no UI route** (`src/app/(dashboard)/projects/new/[source]/page.tsx:7`). A real upload source needs `uploadId` plus a digest. Git needs `url`, `ref`, and `resolvedCommit`. Image needs `ref` plus a resolved `digest`. |
| `EnvironmentVariable` (104) | Entity + DTO (**split**) | `value` is plaintext in the browser today. Future DB row: ciphertext, nonce, `key_version`, `secret` flag. Future DTO: `{id, key, scope, secret, valuePreview?: null, hasValue, updatedAt}`. Secrets are never returned. |
| `Project` (112) | Entity + DTO (**split**) | Mock-only or derived fields: `simulateFailure`; `runtime` (observed, belongs to release/container); `liveDeploymentId` (becomes `active_release_id`); `commitSha`/`commitMessage` (belong to releases); `hostname` (auto-generated `.local` string, `src/lib/deploy/store.ts:461`, not backed by a domain record); `env` (moves to its own resource); `exposedPort` (a port *reservation*, not a project attribute, in routed mode). |
| `DeploymentStep` (145) | Entity (deployment_steps) + DTO | Add `sequence`, `kind`, `exitCode`, `logCursor`. |
| `DeploymentError` (153) | DTO (→ error envelope) | Human copy is fine for the UI, but a stable `code` is required. |
| `Deployment` (160) | Entity + DTO | Mock-only: `failAt`. Derived: `previousRelease` (a boolean hint, becomes `previous_release_id`). Synthetic: `commitSha` (hash), `commitMessage: "Manual deployment"` (`src/lib/deploy/store.ts:564-565`). `triggeredBy` is a display name string and must become a `triggered_by_user_id` or trigger source. `sourceLabel` is derived. |
| `Server` (180) | Entity (servers) + Observed (facts) + DTO | Mock-only: `sampleShift` (sine phase). Observed: `cpuPercent`, `memoryUsedGb`, `storageUsedGb`, `networkMbps`, `dockerVersion`, `dockerStatus`, `agentVersion`, `agentStatus`, `startedAt`, `refreshedAt`, `os`, `arch`, `ip`, `iface`, `cidr`, `gateway`, `dns`, `cpuCount`, totals. Entity: `id`, `name`, (future) `enrolled_at`, `cordoned`. |
| `ContainerPort` (207) | Observed VO | Plus the desired `port_reservations` entity. |
| `Container` (213) | Observed (+ link to desired runtime) | Every field is observed except `projectId`/`role`, which come from **labels** in the real system. `cpuPercent`/`memoryMb` are synthetic constants (`src/lib/deploy/store.ts:236-237`, `memoryForFramework` `src/lib/deploy/helpers.ts:211-225`). |
| `DnsRecord` (230) | VO / DTO | `value: "arcellite-verify=demo"` is mock (`src/lib/deploy/helpers.ts:140`). The real value is a per-domain random token. |
| `Domain` (237) | Entity (desired) + Observed (DNS/TLS/route) | Mock-only: `failVerification`, `verifyStartedAt` (timer anchor). |
| `Volume` (253) | Observed + Entity (managed volumes) | `path` exposes a host path (`/var/lib/docker/volumes/...`). Show it to admins only. `lastBackupAt` is synthetic. `attachedTo` is a name string and must become an attachment relation. |
| `DatabaseEngine` (265) | VO | |
| `DatabaseService` (267) | Entity + Observed + DTO | `password` is **plaintext** (`src/lib/deploy/fixtures.ts:817`, `:834`). It must be an encrypted secret reference, never part of the DTO. |
| `ActivityEvent` (285) | Entity (activity) + DTO | `actor` is a name string. Needs `actor_user_id`/`actor_kind`. `href` is a UI concern and should be derived client-side from `objectType`+`objectId`. There is **no `objectId`** today. |
| `LogEntry` (297) | DTO (+ log store row) | Needs `seq`/cursor, `stream` (stdout/stderr), `source` category, `deploymentId`, `containerId`, and `redacted` flag. |
| `GitRepository` (307) | DTO (from GitHub API) + cache entity | Mock-only: `files` (a fake file list for detection), `importedProjectId` (derivable from project sources). |
| `GitHubState` (323) | Entity (git_installations) | Mock-only shape. The real one is installation ID, account, repository selection, and permissions. |
| `Settings` (329) | Mixed (**split**) | See §7.3. |
| `AppState` (350) | UI / Mock | The browser aggregate. It must not exist server-side. |
| `AnalysisCheck`/`AnalysisResult` (367/372) | DTO | Produced server-side in the future. `files` must be a bounded list. |
| `CreateProjectInput` (388) | DTO (request) | Remove `env` and `simulateFailure`. Add `sourceId`. |
| `ProjectPatch` (412) | DTO (request) | Remove `env`, `simulateFailure`, and `hostname`. |
| `AddDomainInput` (439) | DTO | `targetPort` should become `targetService` + `internalPort`, not a host port. |
| `ServerMetrics` (445) | DTO | `series` becomes timestamped points `{t, v}[]` with an explicit resolution. Synthetic today. |
| `LogQuery` (465) | DTO | Add `cursor`, `limit`, `since`, `until`, `category`. |
| `DeployError` (472) | Error DTO | Maps to `{code, message, requestId, details?}` (§17.4). |

## 6.2 Recommended boundaries

Keep **five distinct model layers**. Never let one type serve two layers.

1. **DB rows** in `src/server/db/schema/*`. These are generated or declared from migrations.
2. **Domain/service models** in `src/server/services/*`. These carry invariants.
3. **API DTOs.** Zod schemas in `src/lib/api/contracts/*`, shared by server and client. They are the only types the browser sees.
4. **Agent protocol messages.** Protobuf in `proto/arcellite/agent/v1/*.proto`, generated for Go and TS. Validated independently in Go.
5. **UI view models.** Existing `src/lib/deploy/types.ts`, gradually narrowed to derive from DTOs, plus presentation-only fields.

Docker API objects never leave the agent. The agent translates them into protocol `ObservedContainer` messages.

---

# 7. State and persistence audit

## 7.1 Browser persistence inventory

| Key | Writer | Contents | Classification |
|---|---|---|---|
| `arcellite-deploy-state-v2` | `src/lib/deploy/store.ts:93-100` (every `commit`) | **Entire `AppState`**: projects **with plaintext env values**, deployments, containers, domains, volumes, **databases with passwords**, activity (≤200, `:157`), operational logs, repositories, settings, GitHub state | Domain state. Must stop being canonical. |
| `arcellite-deploy-theme` | `src/lib/deploy/store.ts:104`, read in `src/lib/theme-script.ts` | Legacy theme choice | Browser pref |
| `arcellite-deploy-motion` | `src/lib/deploy/store.ts:105`, theme script | Motion pref | Browser pref |
| `arcellite-deploy-sidebar` | `src/components/shell/sidebar.tsx:38` | `collapsed` / `expanded` | Browser pref |
| `arcellite-toast-prefs-v1` | `src/lib/toast-prefs.ts:13-35` | Toast position/style | Browser pref |
| `arcellite-project-chat-v1` | `src/components/chat/project-chat.tsx:20`, `:56`, `:108` | Current conversation (≤60 messages) | Browser (for now) |
| `arcellite-project-chat-history-v1` | `src/components/chat/project-chat.tsx:29`, `:37-43`, `:70-73` | ≤30 archived conversations | Browser (for now) |

- **Validation on load.** `isState` is a shallow shape check: schema version plus array presence (`src/lib/deploy/store.ts:66-77`). Settings are merged over defaults (`:87`). Corrupt nested data is trusted.
- **Write failures** are swallowed (`src/lib/deploy/store.ts:97-99`). `syncPrefs` writes without try/catch (`:102-106`), so a thrown `QuotaExceededError` there would propagate from `commit`.

## 7.2 Canonical ownership (current → future)

| Data | Canonical today | Canonical in the real system |
|---|---|---|
| Project config | `localStorage` | PostgreSQL `projects` + `project_sources` |
| Environment values | `localStorage` plaintext | PostgreSQL ciphertext (`environment_variables`). KEK on the host, outside the DB. |
| Deployments / steps | `localStorage` + clock (`materializeDeployment`) | PostgreSQL `deployments`, `deployment_steps`, `jobs`. Progress from agent events. |
| Releases | Implicit (`liveDeploymentId`) | PostgreSQL `releases` (image digest + config snapshot) |
| Containers | `localStorage` (fixtures + `settleDeployment`) | **Docker**, observed by the agent. PostgreSQL holds the desired runtime spec and the last observation cache. |
| Ports | `Project.exposedPort` | PostgreSQL `port_reservations` (desired). Docker/host observed. |
| Domains | `localStorage` + timers | PostgreSQL desired. Caddy observed via agent. DNS observed via the CP resolver. TLS observed via Caddy. |
| Volumes / databases | Fixtures | Docker observed + PostgreSQL desired (managed only) |
| Server facts / metrics | Fixtures + sine | Agent observations. Latest in PostgreSQL. Series in a bounded metric store (§31.4). |
| Activity | `localStorage` (≤200) | PostgreSQL `activity` (retention policy) |
| Audit | None | PostgreSQL `audit_log` (append-only) |
| Logs | Synthesized on read + 6 fixture lines | Build logs: files on the agent host plus index/metadata in PG. Container logs: Docker, tailed by the agent. CP/agent logs: journald/stdout. |
| Settings | `localStorage` | Split (§7.3) |
| GitHub | Hard-coded boolean | PostgreSQL `git_installations`. The GitHub App private key is on the host as a secret file. |
| Chat | `localStorage` | Browser (initially) |

## 7.3 Settings ownership audit (§77)

Fields from `Settings` (`src/lib/deploy/types.ts:329-348`) and the other preferences:

| Setting | Current location / UI | Consumed by | Future owner |
|---|---|---|---|
| `theme` | Stored; split shell fixed (`src/lib/deploy/store.ts:108-110`) | Theme script | **Browser preference** (or delete) |
| `motion` | Settings → Appearance (`settings-view.tsx:134-142`) | `providers.tsx:18-27` | **Browser preference** (optionally synced as a user pref) |
| Sidebar collapse | `sidebar.tsx:38` | Shell | **Browser preference** |
| Toast position/style | `toast-prefs.ts` | Toasts | **Browser preference** |
| `displayName` | Profile (`profile-view.tsx:60`) | Greeting, activity actor (`store.ts:148`), `triggeredBy` (`store.ts:569`) | **User** (`users.display_name`) |
| `timezone` | Settings → General | Display only. Hint says timestamps follow the browser clock (`settings-view.tsx:113`). | **User preference** |
| `notifyDeploySuccess/Failure/Domains/Server` | Settings → Notifications | Feed filter (`notifications-view.tsx:27-32`), alerts | **User preference** (`notification_preferences`) |
| `workspaceName` | Settings → General | Sidebar, overview | **Workspace setting** |
| `defaultBranch`, `defaultEnvironment`, `portAllocation`, `portStart` | Settings → Deployment defaults (`settings-view.tsx:183-214`) | New-project defaults. **`portAllocation` is never read** outside Settings. | **Workspace setting** (`portStart` also as a **server setting**: allowed host-port range per server) |
| `buildConcurrency` | Settings → Deployment defaults | **Never read** | **Server/agent setting** (per-server build slots), enforced by the scheduler |
| `autoRollback` ("Keep the previous release on failure") | Settings → Releases (`settings-view.tsx:217`) | **Never read.** The mock always keeps the previous container because a failed deploy never touches it. | **Workspace deployment policy.** In the real system "keep previous on failure" is **not optional**. It is the cutover invariant (§22.3). Auto-*rollback* after promotion is a separate, later policy. |
| `redactSecrets` | Settings → Security (`settings-view.tsx:223`) | Read-time masking (`src/lib/deploy/logs.ts:158`), alerts, environment view | **Security policy that is always on.** Redaction must happen at ingestion, not display, and must not be user-disableable in the real system. Offer "show redaction markers" only. |
| `logRetentionDays` | Settings → Security | **Never read** | **Workspace setting** enforced by the GC job, bounded by a server disk policy |
| `developerMode` | Developer tools | Shows the simulate-failure switch (`project-panels.tsx:578`) | **Mock-only** |
| `onboardingComplete` | Onboarding | Modal | **User** flag |
| GitHub connection | Settings → Git providers | New project, deploy guard | **Workspace integration** (`git_installations`) |
| Agent version / Docker version | Settings → Server agent | Display | **Observed agent/server facts** |
| Install command | Settings → Server agent (`settings-view.tsx:253`) | Display | **Server enrollment flow** (per-token command). Never pipe an unsigned script (§19.6). |

---

# 8. Current deployment simulation

## 8.1 How state advances

- `startDeployment` (`src/lib/deploy/store.ts:550-590`):
  1. Checks that the project exists.
  2. Checks the home server is not offline (`requireServer`, `:166-176`). It always picks `HOME_SERVER_ID` or the first server.
  3. Checks GitHub is "connected" for GitHub sources (`assertGithub`, `:178-185`).
  4. Creates a `queued` deployment with `startedAt = now`, a fabricated `commitSha`, `failAt = "building"` if `project.simulateFailure`, and `previousRelease = Boolean(project.liveDeploymentId)`.
- **The deployment's state is a pure function of `(startedAt, now, failAt)`.** `materializeDeployment` (`src/lib/deploy/engine.ts:136-188`) walks `PIPELINE` (`:18-26`, 9.9 s total) and returns the active phase and derived steps.
- The store's `tick()` (`src/lib/deploy/store.ts:282-401`) persists status/phase changes and, on the transition to terminal, calls `settleDeployment` (`:187-280`):
  - On `ready`, it sets the project's `liveDeploymentId`, commit, branch, and `runtime: "running"`, and **mutates the existing web container in place** (new `image` tag, ports, command) or creates one. It then appends activity.
  - On `failed` or `canceled`, it appends activity only.
- **Failure.** When `failAt === active.phase` and 75% of that phase has elapsed (`FAIL_RATIO`, `src/lib/deploy/engine.ts:28`, `:167-178`), the deployment becomes `failed` with a generated `DeploymentError` (`:73-83`). The copy states whether a previous release "is still serving traffic".
- **Cancellation.** `cancelDeployment` (`src/lib/deploy/engine.ts:195-215`, store `:592-600`) freezes the current view, marks the active step `canceled`, and sets `status: canceled` with `finishedAt = now`. Nothing is rolled back because nothing was created.
- **Redeploy.** Literally `startDeployment` (`src/lib/deploy/store.ts:602-604`). There is no rollback, no rebuild vs. re-release distinction, and no concurrency guard. Two rapid clicks create two concurrent deployments of the same project. The later one to finish wins `liveDeploymentId`.
- **Progress fraction.** Wall-clock over the fixed total (`src/lib/deploy/engine.ts:217-227`).
- **Logs.** Deterministic scripts per phase and source type (`src/lib/deploy/logs.ts:12-78`), time-gated to `now` (`:80-136`). They are regenerated on every read, not stored.
- **URL behavior.** The endpoint is always `http://<servers[0].ip>:<exposedPort>` (`src/lib/deploy/helpers.ts:50-52`). It is shown only when `ready` (`src/components/deployments/deployment-detail.tsx:107-127`). Before that a placeholder is shown.
- **Health behavior.** The health phase is just a 900 ms timer that logs `Health check GET <healthPath>` then "Health check passed" (`src/lib/deploy/logs.ts:70-74`). No request is made.
- **Prior-release behavior.** Failed or canceled deployments never touch containers, so the previous container keeps "serving". The copy in `failure()` and `cancelDeployment` reflects `previousRelease`.

## 8.2 State inventory and real-event mapping

| Simulated (file) | Real backend event that should drive it |
|---|---|
| `status: queued`, phase `queued` (`engine.ts:19`) | `deployment.created` (row inserted, job enqueued). Stays queued until the job is leased **and** a build slot or project lock is acquired. |
| `preparing` / "Preparing source" (`engine.ts:20`) | `step.started{kind: source.fetch}`. Agent: fetch upload/clone/`image.resolve`. `step.completed` carries the resolved commit or image digest. |
| `installing` (status `building`) (`engine.ts:21`) | **Not a real separate phase** for Docker builds (install is a Dockerfile step). Map to BuildKit progress vertices, or drop. For image sources: `skipped`. |
| `building` (`engine.ts:22`) | `step.started{kind: build}` → BuildKit progress events → `build.completed{imageId, digest}` / `build.failed{exitCode}` |
| `creating-image` (status `deploying`) (`engine.ts:23`) | `release.created{imageDigest, configHash}` (the image is produced by the build). For image sources: `image.pulled{digest}`. |
| `starting` (`engine.ts:24`) | `runtime.candidate.created` → `runtime.candidate.started{containerId}` |
| `health-check` (`engine.ts:25`) | `health.probe{attempt, result}` … `health.passed` / `health.failed` |
| (none) | `route.switched` (Phase 6) / `port.bound` (Phase 3) |
| `ready` | `deployment.promoted{releaseId}` → project `active_release_id` updated, previous runtime `release.superseded` |
| `failed` + `DeploymentError` (`engine.ts:73-83`) | `deployment.failed{code, stepKind, message}`. The previous release is untouched. |
| `canceled` (`engine.ts:195-215`) | `deployment.cancel_requested` → agent aborts context → `deployment.canceled{atStep}` + cleanup of the candidate |
| `stopped` (only via `projectBadge`) | Runtime state `release.stopped` (user stop). Not a deployment status. |
| (none) | `deployment.interrupted` (agent lost mid-step), then reconciliation decides whether to resume or fail (§32) |
| Step statuses `pending/active/completed/failed/canceled` (`types.ts:37`) | Persisted `deployment_steps.status` from step events. Add `skipped`. |

## 8.3 Pipeline presentation

`PipelinesView` computes stage analytics by **array index** against the first job's steps (`src/components/pipelines/pipelines-view.tsx:47-59`). This works only because the mock always emits the same seven steps. Real pipelines vary by source (image: fetch, pull, start, health; Dockerfile: fetch, build, start, health; Phase 6 adds route), so analytics must key by `step.kind`. Record this as a UI change for Phase 3 (Appendix C).

## 8.4 Tests (read, not executed)

| File | Covers |
|---|---|
| `src/lib/deploy/engine.test.ts` | Pipeline order to `ready`; failure at `building` with previous-release copy; cancellation freezing; failure log omission; framework detection; failed analysis; project/deployment filtering; port allocation and hostname classification; relative time; `redactMessage` |
| `src/lib/deploy/assistant.test.ts` | Scoping to one project **without exposing env values or mutating state**; offline/DNS reporting; declining unsupported questions |
| `src/lib/deploy/assistant-format.test.ts` | Line → items/paragraph/note formatting |
| `src/lib/deploy/dotenv.test.ts` | Keys, quotes, comments, `export`, secret-name heuristic |

There are no store, provider, or component tests. There is no provider contract suite yet (§36.4).

---

# 9. Project/source flow audit

## 9.1 Source support today

| Source | Route | What really happens | Evidence |
|---|---|---|---|
| GitHub | `/projects/new/github` | Mock connect sets a hard-coded account. Repositories are fixtures with fake `files` lists. The branch comes from the fixture. Detection runs on the fixture file list. | `src/components/projects/new-project.tsx:378-481`, `src/lib/deploy/store.ts:799-817`, `src/lib/deploy/fixtures.ts` (repositories) |
| Upload | `/projects/new/upload` | Accepts a drop, a file (`.zip,.tar,.gz,.tgz,.html`), or a folder (`webkitdirectory`). **File bytes are never read.** "Progress" is a 700 ms `requestAnimationFrame` animation. The file list for detection is **guessed from the file name** (`filesForUpload`). Size is the browser-reported sum. | `src/components/projects/new-project.tsx:183-211`, `:510-529`, `src/lib/deploy/detect.ts:211-223` |
| Git URL | `/projects/new/git` | The URL string is stored verbatim. There is no scheme validation, and SSH `git@` is suggested as an example. The file list is guessed from URL substrings. Branch is hard-coded `main`. | `new-project.tsx:577`, `:584-585`, `src/lib/deploy/detect.ts:250-256` |
| Docker image | `/projects/new/image` | The image string is stored. Detection returns `["Dockerfile"]`, so the framework becomes **`dockerfile`** with build command `docker build …` and start command `docker run --rm -p 8080:8080 app:latest`. That is incorrect for a pre-built image, which needs no build. | `new-project.tsx:586-588`, `src/lib/deploy/detect.ts:85-94`, `:258-260` |
| Docker Compose | `/projects/new/compose` | Only a **file name** is entered. No file content is uploaded or parsed. The framework is `compose`. | `new-project.tsx:579`, `:589-590`, `src/lib/deploy/detect.ts:262-264` |
| Dockerfile | *(none)* | `ProjectSourceDockerfile` exists in types, but there is no route or UI. `detectFramework` returns `dockerfile` when a `Dockerfile` is in the list. | `src/lib/deploy/types.ts:91-94`, `src/app/(dashboard)/projects/new/[source]/page.tsx:7` |
| Auto-detection | All sources | Pure function over a file list, with priority compose > Dockerfile > Next > Vite > Python > Node > static. Defaults come from `FRAMEWORKS` profiles. | `src/lib/deploy/detect.ts:14-177` |

## 9.2 Current creation sequence (mock, entirely in the browser)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant V as NewProjectView (new-project.tsx)
  participant D as detect.ts
  participant P as mockDeployProvider
  participant S as store.ts (module state)
  participant LS as localStorage
  participant T as tick() 200ms timer
  U->>V: choose source (route /projects/new/[source])
  alt GitHub
    V->>P: connectGitHub() (if not connected)
    P->>S: github.connected = true (hard-coded account)
    U->>V: pick fixture repo + branch
  else Upload
    U->>V: drop file/folder
    V->>V: animate fake progress (700 ms), bytes never read
  else Git / Image / Compose
    U->>V: type URL / image / filename
  end
  V->>D: analysisFromFiles(guessed file list)
  D-->>V: framework + commands + port
  U->>V: edit Configure form (react-hook-form + zod, client only)
  V->>V: client checks: zod, envError, portTaken, github connected
  V->>P: createProject(input incl. env plaintext, simulateFailure)
  P->>S: actions.createProject → commit()
  S->>LS: write entire AppState
  V->>P: startDeployment(projectId)   (separate, non-atomic call)
  P->>S: queued deployment (fabricated commitSha) → commit()
  V->>V: router.push(/deployments/:id)
  loop every 200 ms while pending
    T->>S: materializeDeployment(dep, Date.now())
    S->>LS: persist status/phase changes
  end
  T->>S: on ready → settleDeployment: set liveDeploymentId, mutate/create web container, activity
```

## 9.3 Future creation sequence (real backend)

```mermaid
sequenceDiagram
  autonumber
  actor U as User (browser)
  participant API as Next.js /api/v1 (server-only)
  participant DB as PostgreSQL
  participant W as CP worker
  participant A as Go agent
  participant GH as GitHub API
  U->>API: POST /sources (kind=image|upload|git|github) + Idempotency-Key
  alt upload
    API-->>U: uploadSession {id, maxBytes, url}
    U->>API: PUT chunks (size-capped, streamed to staging, sha256)
  else git (public)
    API->>API: validate URL policy (https only, no creds, SSRF policy)
  else github
    API->>GH: list repos for installation (short-lived installation token)
  else image
    API->>API: parse reference (registry/name:tag@digest)
  end
  API->>DB: INSERT project_sources (status=pending) 
  API->>DB: INSERT jobs(type=source.analyze)
  API-->>U: 202 {sourceId, analysisJobId}
  W->>DB: lease job (FOR UPDATE SKIP LOCKED)
  W->>A: AnalyzeSource{sourceId, limits} (typed command)
  A->>A: fetch/extract/clone into /var/lib/arcellite/workspaces/<id> with limits; manifest scan only
  A-->>W: AnalysisResult{files(bounded), framework, hints} / image: ResolveImage{digest, exposedPorts}
  W->>DB: source.status=analyzed, analysis json
  API-->>U: SSE event source.analyzed
  U->>API: POST /projects {sourceId, config} (zod-validated)
  API->>DB: tx: INSERT projects, port_reservations (if direct-port), audit, activity
  U->>API: PUT /projects/:id/environment (secrets encrypted, write-only)
  U->>API: POST /deployments {projectId} + Idempotency-Key
  API->>DB: tx: INSERT deployments(queued) + jobs(deploy) + events
  API-->>U: 202 {deploymentId}
  Note over U,API: UI subscribes to SSE topic deployment:<id>
```

## 9.4 Form field → validation and storage map

| Field (`new-project.tsx` schema `:39-58`) | Today | Future validation (server, authoritative) | Future storage |
|---|---|---|---|
| `name` | zod `min(1)` + store trim | 1–64 chars, trimmed, unique per workspace (case-insensitive). Slug derived server-side. | `projects.name`, `projects.slug` |
| `environment` | zod enum | Enum. Must exist in the workspace. | `projects.environment` (or `environment_id`) |
| `rootDirectory` | zod `min(1)` | Relative POSIX path, normalized, no `..`, no absolute paths, no NUL, ≤255 chars. Re-checked by the agent against the extracted tree (must resolve inside the workspace). | `project_build_configs.root_directory` |
| `branch` | free string | Git ref-name rules (`git check-ref-format`), ≤255 chars. For GitHub, must exist via the API. | `project_sources.ref` |
| `autoDeploy` | boolean | Boolean. Effective only with a GitHub installation (Phase 8). | `project_sources.auto_deploy` |
| `framework` | zod enum | Enum. Advisory for build plan selection. | `project_build_configs.framework` |
| `installCommand`, `buildCommand`, `startCommand` | free strings (`startCommand` required) | ≤2 KiB, no NUL/control chars, stored verbatim. **Never executed by the host shell.** Used only inside the build container (generated Dockerfile `RUN`) or as the container `CMD` in exec form via a documented `sh -c` inside the container. | `project_build_configs.*` |
| `outputDirectory` | free string | Same rules as `rootDirectory` | `project_build_configs.output_directory` |
| `internalPort` | zod int 1–65535 | int 1–65535 | `project_runtime_configs.internal_port` |
| `portMode`/`exposedPort` | zod + `portTaken` over projects | Mode enum `private`/`direct`/`routed`. Direct: port within the server's allowed range, reserved atomically (§25.4). Agent verifies the host port is free before bind. | `port_reservations` |
| `healthPath` | zod `min(1)` | Must start with `/`, ≤512 chars, no scheme or host (prevents turning health checks into SSRF). | `project_runtime_configs.health_path` |
| `cpuLimit`, `memoryLimitMb` | strings → `Number()` (no range check, `new-project.tsx:257-258`) | CPU 0.1–N cores ≤ server cores. Memory 64 MiB–server total. Defaults applied when empty (§24.2). | `project_runtime_configs.*` |
| `restartPolicy` | zod enum | Enum. `always` discouraged. | `project_runtime_configs.restart_policy` |
| `simulateFailure` | boolean | **Removed** (mock-only) | — |
| `env[]` (`EnvEditor`, `envError` `env-editor.tsx:134-142`) | Key regex, unique, plaintext | Key `^[A-Z_][A-Z0-9_]*$`, ≤128 chars. Value ≤32 KiB. Reserved prefix `ARCELLITE_` blocked. Secrets are encrypted. | `environment_variables` |
| Source: GitHub repo | fixture | Installation owns the repo (API check) | `project_sources(kind=github, installation_id, repo_id, full_name)` |
| Source: upload | file name + browser size | Server-measured size, sha256, extraction limits (§23.4) | `project_sources(kind=upload, upload_id, sha256, bytes)` |
| Source: git URL | raw string | URL policy (§23.5) | `project_sources(kind=git, url_normalized)` |
| Source: image | raw string | Docker reference grammar. Resolved digest recorded at deploy time. | `project_sources(kind=image, reference)` + `releases.image_digest` |

**Bug (documented, not fixed).** `createProject` and `startDeployment` are two independent calls (`new-project.tsx:240-263`). If the second throws (for example, the server is offline), the project exists without a deployment and the user sees an error. Also, `createProject` sets `runtime: "running"` before anything is deployed (`src/lib/deploy/store.ts:464`). Phase 1 should make "create project" and "create deployment" separate API calls, and the UI should handle the created-but-not-deployed state explicitly.

---

# 10. Infrastructure UI audit

| Page | What the UI thinks exists | Mock today | Docker/host data required | Persist (PostgreSQL) | Observe (agent) | Agent operations |
|---|---|---|---|---|---|---|
| **Servers** (`src/components/servers/servers-view.tsx`, `server-detail.tsx`) | One or more machines with OS, arch, IP/iface/CIDR/gateway/DNS, CPU/RAM/disk, Docker version, agent version, uptime, containers, ports, activity. Copy claims "live resource usage from the agent" (`servers-view.tsx:26`). | Single fixture `srv_home` (`src/lib/deploy/fixtures.ts:772-796`, agent `0.1.0-mock`). Metrics are sine waves. `createEmptyState` **keeps the fixture server** (`src/lib/deploy/fixtures.ts:867-883`). | `/proc` or `gopsutil` (CPU, mem, disk, net, uptime), `os-release`, `uname`, interface/route table, Docker `/info` + `/version` | `servers` (name, enrollment, cordon), `agents` (versions, capabilities, last heartbeat), latest facts snapshot | Heartbeat, host facts, metric samples, Docker health | `GetHostInfo`, `Heartbeat`, `StreamMetrics`, `RequestSelfRestart` |
| **Containers** (`src/components/containers/containers-view.tsx`) | Named containers with project, role, image, state, ports, CPU/mem, command, restart policy. Start/stop/restart with confirmation. | Fixtures plus the mutation in `settleDeployment`. CPU/mem constants. | Docker `containers/json` + `inspect` + `stats` (one-shot or stream), filtered by label | Desired runtime spec per release (`runtimes`). Not a mirror of all containers. | Container inventory (managed and unmanaged, flagged), state transitions (Docker events), stats | `ListContainers`, `WatchDockerEvents`, `StartManagedContainer`, `StopManagedContainer`, `RestartManagedContainer` (label-gated) |
| **Domains** (`src/components/domains/domains-view.tsx`, `project-panels.tsx:408-528`) | Local endpoints (`ip:port`), private `.local` names (instantly "active"), public names with A + TXT records, verification, TLS. | Timers: `verifying` → `issuing` at 1.4 s → `active` at 3 s. `.invalid` fails (`src/lib/deploy/store.ts:306-334`, `helpers.ts:146-148`). `.local` names are marked active without any mDNS. | Caddy config (routes, TLS automation state), certificate status, upstream reachability. DNS resolution happens in the CP. | `domains` (desired), `domain_routes` (desired route spec + version), verification token | Applied Caddy route IDs/ETag, cert status, upstream health | `ApplyProxyRoutes`, `GetProxyState`, `RemoveProxyRoute`, `ProbeUpstream` |
| **Storage** (`src/components/storage/storage-view.tsx`) | Volumes with size, path, attachment, last backup | Four fixture volumes. `lastBackupAt` synthetic. No actions. | Docker `volumes` + `system df -v` (sizes), mounts from container inspect | `volumes` (managed), `volume_attachments`, `backups` (later) | Volume inventory and sizes | `ListVolumes`, `CreateManagedVolume`, `BackupVolume` (Phase 9) |
| **Databases** (`src/components/databases/databases-view.tsx`) | PostgreSQL/MySQL/Redis services with internal host:port, credentials (reveal/copy), storage | Three fixtures with plaintext passwords (`src/lib/deploy/fixtures.ts:817`, `:834`). The Redis container is attached to no project. | Container + volume + health for each managed DB | `database_services` + credential secret refs | Health, size | `CreateDatabaseService` (typed per engine), `BackupDatabase` (Phase 9) |

---

# 11. Observability audit

| Surface | Source today | Synthetic / derived / persisted / browser | Future real data source |
|---|---|---|---|
| Deployment/build logs | `deploymentLogs` scripts regenerated on read (`src/lib/deploy/logs.ts:80-136`) | **Synthetic, derived** | Agent streams BuildKit progress and step output → CP ingests into build log files (per deployment, append-only, seq-numbered) + metadata in PG. Tail over SSE with a cursor. |
| Runtime/container logs | 6 fixture `operationalLogs` (`src/lib/deploy/fixtures.ts:579-632`) | **Synthetic, persisted in LS** | Docker logs of managed containers, tailed on demand by the agent. **Not persisted in PG.** Optional bounded retention in agent log files. |
| Server logs | 2 fixture lines | Synthetic | Agent's own structured log (journald) exposed through `TailAgentLog`. Admin-only. |
| Log redaction | `redactMessage` at read time, toggleable (`src/lib/deploy/logs.ts:158`, `helpers.ts:205-209`) | Derived, browser | Redaction at **ingestion** in the agent (known secret values for that project + patterns), plus a second pass in the CP. Not user-disableable. |
| Metrics | `serverMetrics` sine waves (`src/lib/deploy/helpers.ts:150-203`) | **Synthetic** | Agent samples (host 10 s, containers 15 s) → CP keeps the latest in PG and aggregated series (1-min rollups for 24 h, 1-h rollups for 30 d) in a bounded table (§31.4). |
| Activity | `state.activity` appended by the store (≤200) | Persisted (LS) | PG `activity` written by services in the same transaction as the change |
| Events page | Same `state.activity` (`src/components/events/events-view.tsx:51`) | Persisted (LS) | PG `events` (machine events: deployment/step/container/domain transitions). The page may show events + activity. |
| Activity page | Same `state.activity`. Labels it "In the audit log" (`src/components/activity/activity-view.tsx:33`). | Persisted (LS) | PG `activity`. The audit log is separate (§31.5). **The "audit log" label is inaccurate today.** |
| Notifications | `state.activity` filtered by `notify*` settings (`src/components/notifications/notifications-view.tsx:27-32`) | Derived | PG `notifications` generated from events per user preference. Delivery channels later. |
| Alerts | `collect()` derives server offline, failed deploys, domains, stopped containers, disk ≥80%, memory ≥85%, CPU ≥90%, unbacked volumes, redaction off (`src/components/alerts/alerts-view.tsx:46-80`) | **Derived, not persisted.** No acknowledgement. | PG `alerts` with rule, fingerprint, `open → acknowledged → resolved`, opened by the CP evaluator from events/metrics |
| Service status / uptime | `projectHealth` from release outcomes; a degraded day counts as 98% (`src/components/status/service-status.tsx:31-58`) | **Derived. The "uptime %" is not an uptime measurement.** | Health observations (§22.6) aggregated per day: container running + readiness probe + route probe |
| Pipelines | `materializeDeployment` over all deployments, stage analytics by index (`src/components/pipelines/pipelines-view.tsx:37-59`) | Derived | PG `deployments` + `deployment_steps` aggregates by `step.kind` |
| Overview "Releases this week" | `ReleaseChart` over deployments | Derived | Aggregate query |

---

# 12. Ask Arc audit

- **What it reads.** The entire `AppState` snapshot (`src/components/chat/project-chat.tsx:51`, `:115`). Answers come from regex routing over the question (`src/lib/deploy/assistant.ts:7-34`). The topics are domains/DNS/TLS, servers/resources, failures/attention, logs, and status/containers. It never outputs env values (asserted in `src/lib/deploy/assistant.test.ts:7`).
- **Where conversations live.** `localStorage` keys `arcellite-project-chat-v1` (current, ≤60 messages) and `arcellite-project-chat-history-v1` (≤30 conversations) (`src/components/chat/project-chat.tsx:20`, `:29`, `:32-43`, `:70-80`, `:108`).
- **Can it mutate infrastructure?** **No.** It imports only `useDeployState` (`project-chat.tsx:11`), never `useDeploy`, and `answerProjectQuestion` is pure. The file's own comment says: "Read-only Phase 1 assistant. Never sends workspace data to an external model." (`src/lib/deploy/assistant.ts:6`).
- **Project context.** A select sets `projectId` (default `all`). A project named inside the question overrides it (`assistant.ts:9-11`).
- **Links/actions.** Only navigation links built by `assistant.ts` from IDs in the snapshot. On reload, stored links are filtered to internal routes matching `^/(projects|deployments|containers|domains|servers|metrics|logs)` (`project-chat.tsx:34`). This is good defense-in-depth against a tampered `localStorage` injecting `javascript:` or off-site links.
- **Thinking steps.** The steps are cosmetic timers (700 + 900 + 800 ms) "like a real agent would" (`project-chat.tsx:118-133`, `:279-293`). No work happens.

**Real-backend rules (Recommendation).**

- Ask Arc stays **read-only** and calls the *same* read APIs as the UI, with the user's session. There are no AI-specific endpoints.
- If an LLM is ever introduced, the tool list contains read tools only. Any future "action" is rendered as a *proposed* UI action that the user confirms. It then goes through the normal authenticated, authorized, idempotent, audited command path.
- Secrets are never included in model context.
- Conversation storage stays in the browser until there is a user-scoped server table with retention.

---

# 13. Mock-only assumptions

| Assumption | Where | Real-world consequence |
|---|---|---|
| Time drives state (`startedAt + now`) | `engine.ts:136-188`, `store.ts:282-401`, `useNow` in views | Real progress comes from events. Client time only formats. |
| One server, always `srv_home` / `192.168.1.50` | `helpers.ts:13-14`, `store.ts:166-176`, `servers[0]` in `project-panels.tsx:70`, `domains-view.tsx:65`, `deployment-detail.tsx:45` | Placement must be explicit (`project.server_id`). Endpoints use the server's advertised address. |
| Port uniqueness = no other *project* has the same `exposedPort` | `helpers.ts:61-63`, `store.ts:433-435` | Must also consider non-Arcellite listeners and UDP, and be race-safe (§25.4). |
| The web container is mutated in place on each release | `store.ts:205-222` | Violates immutable releases. Real: a new container per release (§22). |
| A failed deploy cannot hurt the running app | `settleDeployment` touches containers only on `ready` | Must be guaranteed by the cutover design, not by accident. |
| Cancel is instantaneous | `engine.ts:195-215` | Real cancel is asynchronous and may be too late (already promoted). |
| Commit SHA exists for every source | `store.ts:564` | Upload/image have no commit. Use a source digest or image digest. |
| Upload contents irrelevant; detection from file name | `detect.ts:211-223`, `new-project.tsx:210` | Real analysis requires server-side extraction under limits. |
| Image source "builds" with `docker build` | `detect.ts:85-94`, `:258-260` | Image source must skip build and resolve a digest. |
| GitHub = boolean + fixture repos | `store.ts:799-834`, fixtures | GitHub App installation, API access, webhooks. |
| `.invalid` fails domain verification; `.local` is instantly active | `helpers.ts:146-148`, `store.ts:743-746` | Real DNS lookups and a Caddy/TLS lifecycle. `.local` requires mDNS or LAN DNS the product does not control. |
| Secrets can be revealed/copied any time | `src/components/projects/env-editor.tsx:79-91`, `environment-view.tsx:179-195`, `databases-view.tsx:120-128` | Write-only secrets and an audited reveal. |
| Redaction is a user toggle at read time | `logs.ts:158`, `settings-view.tsx:223` | Ingestion-time, always on. |
| `simulateFailure`, `failAt`, `failVerification`, `sampleShift`, `developerMode`, `resetDemo`, `clearWorkspace` | `types.ts`, `store.ts`, `developer-view.tsx`, `project-panels.tsx:578` (special-cases `proj_api`) | Remove from real DTOs. Keep in the mock provider only. |
| Actor = display name string | `store.ts:148`, `:569` | User IDs + actor kinds (user, webhook, system, agent). |
| No auth; "Sign Out" is a toast | `sidebar.tsx:180-192`, `settings-view.tsx:232` | Real sessions. |
| Agent install is `curl … \| sh` | `settings-view.tsx:253` | Signed artifacts + one-time enrollment token (§19). |
| Activity capped at 200 and called "audit log" | `store.ts:157`, `activity-view.tsx:33` | Separate audit log with retention. |
| "Keep previous release on failure" is a toggle | `settings-view.tsx:217` | It is an invariant, not a setting. |
| `buildConcurrency`, `portAllocation`, `logRetentionDays` saved but unused | `settings-view.tsx:183-229` | Wire to the scheduler, allocator, and GC. |

---

# 14. Backend requirements derived from the current UI

Every visible control implies a backend capability:

1. **Identity.** Display name, workspace name, "by you" counts (`activity-view.tsx:27`), and sign-out require users, sessions, and workspaces.
2. **Project CRUD** with search/filter/sort. Sort by `updatedAt`, status (derived from the latest deployment), and name. Needs list endpoints with server-side filtering once projects exceed ~200.
3. **Source intake** for 4 kinds (plus Compose, deferred): upload sessions, Git URL probe, image resolve, GitHub repo/branch listing.
4. **Analysis** returning a checklist + detected profile (`AnalysisResult`). The UI animates the checks, so the server may return them at once.
5. **Deployments.** Create (returns immediately), cancel, redeploy, list per project/global with status/environment/search filters, step timeline with timings, success rate, average duration (`project-panels.tsx:199-217`), and "Live"/"Serving now" (`project-panels.tsx:200`, `:274`).
6. **Live updates.** Deployment status/steps, logs, container state, server status, domain status, sidebar counts.
7. **Logs.** Target selection (all/project/deployment/container/server), level filter, search, pause, follow, copy, **download** (`log-stream.tsx`), and volume insights (`insights` prop).
8. **Environment.** Per-project variables, scopes, secret flag, `.env` import (`environment-view.tsx:107-116`), cross-project view, and a "saved → redeploy to apply" workflow.
9. **Domains.** Add with a target port, DNS record display, verify, remove. Local endpoint display, copy, and open.
10. **Servers.** Facts, resources, ports in use, workloads, refresh, restart agent, disconnect/reconnect, agent install instructions.
11. **Containers.** Inventory, inspect, start/stop/restart with confirmation.
12. **Storage/databases.** Inventory, attachments, credentials (reveal/copy), backups.
13. **Alerts/notifications.** Rule evaluation and preferences.
14. **Metrics.** 24-hour series by server with range selection (`metrics-view.tsx`, `RANGES`), container ranking.
15. **Service status.** 30-day daily health history per project.
16. **Settings** (§7.3), **GitHub connect/disconnect**, and **export** (Developer, mock-only).

---

# 15. Proposed production architecture

## 15.1 Evaluation of the proposed target architecture (§14 of the spec)

The proposed picture is directionally right. Changes recommended:

| Proposed | Change | Reason |
|---|---|---|
| "Durable Jobs" as a separate box beside PostgreSQL | **Jobs live in PostgreSQL**, executed by a **separate CP worker process** built from the same TS codebase (`node dist/worker.js`), not inside Next.js request handlers | Route handlers are request-scoped and may be restarted or scaled independently. A dedicated worker gives leases, heartbeats, and graceful shutdown. There is no second datastore to operate. |
| GitHub App drawn as a peer of the DB | GitHub is an **external integration** behind the CP (API client + webhook receiver) | Only the CP holds App credentials. The agent never receives the App private key, only short-lived, repo-scoped tokens for a single fetch. |
| Agent → Caddy | Keep, but make the **agent the only writer of Caddy config**, via the admin API over a **permissioned Unix socket** | Caddy admin is local by default. Binding it to a Unix socket that only the agent can reach removes it from any network namespace that workloads share (Appendix A). |
| Agent → BuildKit | Phase 4: **Docker's bundled BuildKit** (`docker buildx build` with the default `docker` driver, or the Docker API build endpoint with BuildKit). Later: a **dedicated `buildkitd` container** with its own cgroup limits and GC policy. | Starts simple. The dedicated builder gives hard resource limits and cache GC separate from the daemon. |
| (missing) Event fan-out | PostgreSQL `events` table + `LISTEN/NOTIFY` → CP SSE hub | Live UI updates without Redis. The events table also provides replay and cursors. |
| (missing) Reconciler | Periodic + event-triggered **reconciliation loop** in the CP worker, using agent observations | Drift detection (§32). |
| (missing) Metrics store | Bounded rollup tables in PG (or agent-local ring buffer + CP rollups) | Avoids unbounded raw samples in PG (§31.4). |
| Browser → CP "HTTPS" | Add: CP itself served **through Caddy with TLS** (internal CA on LAN IP or a public hostname) | Secure cookies require HTTPS. See §41 for the HTTP-on-LAN open question. |

## 15.2 Proposed single-server architecture (diagram 2 of 7)

```mermaid
flowchart TB
  B["Browser<br/>React UI + provider cache"]
  subgraph Host["Single Linux host (level 1: single owner)"]
    Caddy["Caddy<br/>:80/:443 public listener<br/>admin API → unix socket only"]
    subgraph CP["Control plane (user: arcellite, no Docker access)"]
      Web["Next.js app<br/>UI + /api/v1 route handlers<br/>src/server/* (server-only)"]
      Worker["CP worker process<br/>jobs · reconciler · event hub · GC · alert evaluator"]
    end
    PG[("PostgreSQL<br/>intent · history · jobs · events<br/>secrets ciphertext · audit")]
    KEK[["/etc/arcellite/keys/kek-v1<br/>(0400, not in DB)"]]
    Agent["arcellite-agent (Go, systemd)<br/>typed commands only<br/>/run/arcellite/agent.sock"]
    Docker["Docker Engine<br/>(rootful or rootless)"]
    BK["BuildKit<br/>(bundled → dedicated buildkitd later)"]
    FS[("/var/lib/arcellite<br/>workspaces · builds · logs · agent state")]
    subgraph Workloads["Arcellite-managed containers (labels io.arcellite.*)"]
      App1["project A web (release N)"]
      App2["project B web"]
      Data["data services (Phase 9)"]
    end
  end
  B -- "HTTPS (session cookie) · SSE" --> Caddy
  Caddy -- "reverse_proxy 127.0.0.1:3000" --> Web
  Web <--> PG
  Worker <--> PG
  Web -.->|reads KEK at start| KEK
  Worker -.->|reads KEK| KEK
  Worker -- "HTTP/JSON over unix socket<br/>versioned envelopes · SSE for streams" --> Agent
  Agent -- "/var/run/docker.sock (only the agent)" --> Docker
  Agent -- "admin unix socket" --> Caddy
  Docker --> BK
  Agent <--> FS
  Docker --> Workloads
  Caddy -- "arc-edge network → container:port" --> App1
  Caddy --> App2
```

## 15.3 Future remote-agent architecture (diagram 3 of 7)

```mermaid
flowchart LR
  B["Browser"] -- HTTPS/SSE --> CPE
  subgraph CPHost["Control-plane host"]
    CPE["Caddy (TLS)"] --> CP["Next.js + worker"]
    CP <--> PG[("PostgreSQL")]
    CP --- GW["Agent gateway (in CP)<br/>wss://cp.example/agent/v1<br/>mTLS client-cert auth"]
    LA["local agent (unix socket)"]
    CP --> LA
  end
  subgraph Home["Home-lab node behind NAT (no inbound ports)"]
    RA["arcellite-agent"] --> D2["Docker"]
    RA --> C2["Caddy (node-local)"]
  end
  subgraph VPS["VPS node"]
    RB["arcellite-agent"] --> D3["Docker"]
  end
  RA -- "outbound WSS (mTLS, same envelopes)" --> GW
  RB -- "outbound WSS (mTLS)" --> GW
  GH["GitHub"] -- "webhooks (HMAC)" --> CPE
```

All of it remains self-hostable. The "gateway" is part of the user's own control plane, and there is no Arcellite cloud dependency.

## 15.4 Comparison with Coolify and Dokploy

(Validated via official-domain search snippets. See Appendix A.)

- **Dokploy.** A Next.js app, PostgreSQL for "all the configuration and operational data", Traefik as proxy, Redis present in self-hosted installs, and remote servers "connected via SSH" or joined to Docker Swarm.
- **Coolify.** A per-server proxy container (Traefik default, Caddy optional via caddy-docker-proxy labels). The proxy "joins the coolify network and the resource-specific networks". Servers are managed over SSH with key auth.

**What Arcellite should share.**

- Separate control-plane state (DB) from workload state (Docker).
- Put a reverse proxy on a shared network plus per-resource networks.
- Use PostgreSQL as the configuration store.

**Where Arcellite should differ, and why.**

1. **Agent instead of SSH.** Both competitors drive remote hosts over SSH, which grants a general shell. Arcellite's premise is a *typed, least-surface* agent that can refuse anything outside its protocol. It supports outbound connections for NAT'd home labs without opening inbound SSH.
2. **No Redis** until a measured need. PG covers jobs, events, and locks at single-owner scale.
3. **No Swarm or orchestrator** in v1. Placement is explicit per server.
4. **Caddy via the JSON admin API, not container labels.** Label-driven proxies need Docker socket access inside the proxy and derive routing from workload metadata that the workload's own Compose file could influence. Arcellite keeps routing desired-state in PG and applies it through one privileged component.

---

# 16. Trust boundaries

## 16.1 Trust-boundary diagram (diagram 7 of 7)

```mermaid
flowchart TB
  subgraph Z0["Zone 0 — Internet / LAN (untrusted)"]
    Browser["Browser (authenticated user)"]
    Attacker["Anyone on the network"]
    GitHub["GitHub (webhooks, API)"]
    Registries["Registries / Git remotes"]
  end
  subgraph Z1["Zone 1 — Edge"]
    CaddyPub["Caddy public listeners :80/:443"]
  end
  subgraph Z2["Zone 2 — Control plane (unprivileged OS user, no docker group)"]
    API["Next.js /api/v1<br/>authn · authz · CSRF · validation"]
    WK["CP worker"]
    PG[("PostgreSQL")]
  end
  subgraph Z3["Zone 3 — PRIVILEGED (root-equivalent)"]
    Agent["arcellite-agent<br/>typed commands · own validation · label gate"]
    Sock["/var/run/docker.sock"]
    CaddyAdmin["Caddy admin unix socket"]
    Docker["Docker daemon"]
  end
  subgraph Z4["Zone 4 — Untrusted workloads"]
    Build["Build containers (user Dockerfile, user commands)"]
    Apps["App containers"]
  end
  Browser -- "B1: HTTPS + session + CSRF" --> CaddyPub --> API
  GitHub -- "B2: HMAC-signed webhook" --> CaddyPub
  Attacker -.-x|must never reach| Sock
  Attacker -.-x|must never reach| CaddyAdmin
  API --> PG
  WK --> PG
  WK -- "B3: unix socket, peer-cred + agent identity,<br/>versioned typed envelopes" --> Agent
  Agent -- "B4: only Z3 touches" --> Sock --> Docker
  Agent --> CaddyAdmin
  Docker -- "B5: namespaces, caps dropped, no socket mount,<br/>no host mounts, limits" --> Build
  Docker --> Apps
  Agent -- "fetch with short-lived creds" --> Registries
```

## 16.2 Boundary rules

- **B1 Browser → CP.** Authentication on every non-public route. Authorization per capability. CSRF (§29). Zod validation. Per-user rate limits. The browser never learns host paths, Docker IDs of unmanaged containers, or secret values (unless explicitly revealed).
- **B2 GitHub → CP.** HMAC verification before parsing. Allowlisted events. Dedupe on the delivery ID (§27).
- **B3 CP → Agent.** The only path into Zone 3. The agent re-validates *every* field (Go validation independent of Zod). The agent enforces its own policy (label gate, path jail, hardening defaults) even if the CP is compromised. **A compromised CP can still deploy arbitrary images, and therefore run arbitrary code in containers.** That is inherent. It must not be able to mount the Docker socket, bind-mount host paths, run privileged, or use host namespaces, because the agent refuses these unconditionally at level 1.
- **B4 Agent → Docker.** Docker socket access is root-equivalent: the Docker docs state the `docker` group "grants privileges equivalent to the root user" and that "only trusted users should be allowed to control your Docker daemon" (Appendix A). The socket is never exposed on TCP, never mounted into any container, and never reachable by the CP user.
- **B5 Docker → Workloads.** Containers are **not** VMs. The kernel is shared. Hardening reduces but does not eliminate escape risk (§24).

---

# 17. Control-plane responsibilities

1. **Identity and sessions.** Users, sessions, and bootstrap (§29). Authorization checks (§30).
2. **Resource APIs** `/api/v1/*` (§17.3). Input validation. The error envelope.
3. **Desired state.** Projects, sources, build/runtime config, env vars (encrypted), domains, port reservations, settings.
4. **Orchestration.** Deployment state machine, job scheduling, per-project locks, build-slot accounting per server, idempotency.
5. **Integrations.** GitHub App (API + webhooks), DNS checks for domains (the CP's resolver, with timeouts).
6. **Secrets.** Encryption/decryption, key versioning, redaction lists sent to the agent.
7. **Observation ingestion.** Heartbeats, facts, metric samples, container events, build logs.
8. **Reconciliation** (§32). **GC scheduling** (§23.8). **Alert evaluation** (§31.6).
9. **Event fan-out** to browsers (SSE).
10. **Audit and activity** writes, in the same transaction as the change.

## 17.1 Browser → CP communication

- **CRUD.** JSON over HTTPS to `/api/v1`, cookie session, `Idempotency-Key` on mutations, `If-Match` on updates.
- **Live.** One `EventSource` per tab: `GET /api/v1/events/stream?topics=…`, with `Last-Event-ID` resume from the `events` table sequence.
- **Logs.** `GET /api/v1/deployments/:id/logs?cursor=` for history, and `GET /api/v1/deployments/:id/logs/stream` (SSE) for tail.
- **Why not WebSocket?** SSE rides plain HTTP through Caddy, has built-in reconnect/resume, and is enough for server→client. The browser's client→server messages are ordinary POSTs. WebSockets are reserved for agent ↔ CP (remote).
- **Polling fallback.** 5–10 s for summary counts if SSE is blocked.

## 17.2 API design principles

- Resource-oriented, versioned (`/api/v1`), plural nouns. Sub-resources for ownership. **No** `POST /run`, `/execute`, or `/exec`.
- Long-running operations return `202 Accepted` with a resource (`deployment`, `operation`) plus `Location`. Progress is visible via SSE or GET.
- Cursor pagination (`?cursor=&limit=`), with a maximum `limit` of 100.

## 17.3 Proposed endpoints (v1)

```text
POST   /api/v1/auth/bootstrap            (one-time setup code) 
POST   /api/v1/auth/login | /logout      GET /api/v1/auth/session
GET    /api/v1/me                        PATCH /api/v1/me/preferences
GET    /api/v1/workspace                 PATCH /api/v1/workspace/settings
GET    /api/v1/summary                   (sidebar counts, overview tiles)
GET    /api/v1/search?q=

GET/POST        /api/v1/projects
GET/PATCH/DELETE /api/v1/projects/:id                      (DELETE = archive + teardown job)
GET/PUT         /api/v1/projects/:id/environment           (values write-only)
POST            /api/v1/projects/:id/environment/:varId/reveal   (re-auth, audited)
POST            /api/v1/projects/:id/environment/import    (.env)
GET             /api/v1/projects/:id/releases
POST            /api/v1/projects/:id/rollbacks             {releaseId}

POST   /api/v1/sources                   {kind: image|upload|git|github,...}
PUT    /api/v1/uploads/:id               (streamed, size-capped)
GET    /api/v1/sources/:id               (analysis result)

GET/POST /api/v1/deployments             (?projectId=&status=&environment=&cursor=)
GET      /api/v1/deployments/:id
POST     /api/v1/deployments/:id/cancel
GET      /api/v1/deployments/:id/logs    (+ /stream)

GET    /api/v1/servers | /servers/:id | /servers/:id/metrics?range=
POST   /api/v1/servers/:id/enrollment-tokens
POST   /api/v1/servers/:id/cordon | /uncordon | /revoke | /agent/restart

GET    /api/v1/containers?serverId=&projectId=
POST   /api/v1/containers/:id/start | /stop | /restart        (managed only)
GET    /api/v1/containers/:id/logs (+ /stream)

GET/POST /api/v1/domains       GET/DELETE /api/v1/domains/:id    POST /api/v1/domains/:id/verify
GET    /api/v1/volumes | /databases                                (read; writes Phase 9)
GET    /api/v1/activity | /events | /audit (owner) | /alerts
POST   /api/v1/alerts/:id/acknowledge
GET    /api/v1/git/installations         POST /api/v1/git/installations/begin   (redirect URL)
GET    /api/v1/git/installations/:id/repositories | …/branches
POST   /api/v1/webhooks/github           (public, HMAC)
GET    /api/v1/events/stream             (SSE)
```

## 17.4 Structured errors

```json
{
  "error": {
    "code": "PORT_CONFLICT",
    "message": "Port 8082 is already reserved on home-server.",
    "requestId": "req_01J…",
    "details": { "field": "exposedPort", "port": 8082 },
    "retryable": false
  }
}
```

- Stable `code` (UPPER_SNAKE), user-safe `message`, `requestId` echoed in the `X-Request-Id` header, optional `details` (never secrets or stack traces), and `retryable`. Internals go to server logs keyed by `requestId`.
- **Mapping from `DeployError`** (`src/lib/deploy/types.ts:472-482`). `title` becomes a UI-side lookup from `code` (i18n-able), and `detail` becomes `message`. Current throw sites map as follows:

| Current throw site | Future `code` |
|---|---|
| `Name the project` (`store.ts:432`) | `VALIDATION_FAILED` (field `name`) |
| `Port unavailable` (`:434`, `:496`) | `PORT_CONFLICT` |
| `Project unavailable` (`:162`) | `NOT_FOUND` |
| `No server` / `Server unavailable` (`:168-173`) | `SERVER_NOT_ENROLLED` / `AGENT_DISCONNECTED` |
| `Repository access lost` (`:180-183`) | `GIT_INSTALLATION_UNAVAILABLE` |
| `Deployment unavailable` (`:594`) | `NOT_FOUND` |
| `Container unavailable` (`:694`) | `NOT_FOUND` / `CONTAINER_NOT_MANAGED` |
| `Check the domain` (`:731`) | `INVALID_HOSTNAME` |
| `Domain already added` (`:733`) | `DOMAIN_EXISTS` |

- New codes: `UNAUTHENTICATED`, `FORBIDDEN`, `CSRF_FAILED`, `RATE_LIMITED`, `IDEMPOTENCY_CONFLICT`, `VERSION_CONFLICT`, `DEPLOYMENT_IN_PROGRESS`, `BUILD_SLOTS_EXHAUSTED`, `SOURCE_TOO_LARGE`, `ARCHIVE_REJECTED`, `GIT_URL_REJECTED`, `IMAGE_NOT_FOUND`, `AGENT_PROTOCOL_UNSUPPORTED`, `INTERNAL`.
- `DeploymentError` (in-deployment failure) keeps its human fields but gains `code` and `stepKind`.

## 17.5 Correlation IDs

| ID | Minted by | Carried in |
|---|---|---|
| `requestId` | CP middleware (or accepted from a sanitized inbound `X-Request-Id`) | Logs, error envelope, audit, jobs created by the request |
| `idempotencyKey` | Browser (UUID per user intent) | `idempotency_keys` table, job |
| `deploymentId`, `jobId`, `jobAttemptId` | CP | Events, agent commands |
| `agentCommandId` | CP (UUIDv7) | Agent envelope. Agent logs. Docker labels `io.arcellite.command`. |
| `webhookDeliveryId` | GitHub `X-GitHub-Delivery` | `webhook_deliveries`, deployment trigger |
| `eventSeq` | PG sequence | SSE `id:`, UI resume |

Every structured log line on both sides includes whichever IDs apply. A full distributed-tracing stack is not needed (non-goal).

---

# 18. Go agent responsibilities

## 18.1 Responsibilities

Host facts. Docker inventory/events. Image pull (digest-resolved). Builds via BuildKit. Container lifecycle for **managed** resources only. Managed networks and volumes. Log tailing. Metrics sampling. Health probes (from the host network namespace or a helper container on the project network). Caddy route application. Workspace/extraction/clone jail. GC of agent-owned files and managed images. A local command journal for crash recovery.

## 18.2 Typed command surface (protocol v1)

| Command | Phase | Notes |
|---|---|---|
| `Hello` / `Heartbeat` | 2 | Versions, capabilities, clock |
| `GetHostInfo`, `StreamMetrics` | 2 | Read-only |
| `ListContainers`, `ListImages`, `ListVolumes`, `ListNetworks`, `WatchDockerEvents` | 2 | Read-only. Unmanaged resources are flagged, not hidden. |
| `ResolveImage{ref, registryAuthRef?}` → `{digest, config.exposedPorts, os/arch}` | 3 | |
| `StartDeployment{deploymentId, releaseSpec, commandId}` | 3 | One typed spec: image digest, env (sealed), ports, limits, network, health spec, labels. The agent derives Docker calls. |
| `CancelDeployment{deploymentId}` | 3 | |
| `PromoteRelease` / `StopRelease` / `RemoveRelease` | 3 | Cutover pieces (§22.3) |
| `StartManagedContainer`, `StopManagedContainer{timeout}`, `RestartManagedContainer` | 3 | Label-gated |
| `TailLogs{containerId|deploymentId, since, follow}` | 3 | Streaming |
| `ProbeHealth{spec}` | 3 | |
| `ReserveHostPort` check (`CheckPortFree`) | 3 | Advisory. The DB reservation is authoritative. |
| `FetchSource{upload|git}` → `AnalyzeSource` | 4/5 | Jail + limits |
| `BuildImage{workspaceId, dockerfilePath, buildArgs(non-secret), secretRefs, cacheKey, limits, timeout}` | 4 | |
| `ApplyProxyRoutes{routes[], expectedVersion}` / `GetProxyState` | 6 | |
| `CreateManagedVolume`, `BackupVolume` | 9 | |
| `RunGC{policy}` | 4+ | |
| `RequestSelfRestart`, `RotateCredential` | 2 | |

**Explicitly absent:** `ExecShell`, `RunDocker(args)`, `WriteFile(path)`, `ReadFile(path)`, `docker exec` passthrough, arbitrary bind mounts, `privileged`, `--network host`, `--pid host`, device passthrough. If a future "console" feature is wanted, it must be a separate, opt-in, audited capability scoped to one managed container. It is out of scope.

## 18.3 Command execution safety

- Prefer the **Docker Engine API via the Go SDK** over the CLI. Where a binary must be called (for example `git`, or `docker buildx` in early Phase 4), use `exec.CommandContext(ctx, absPath, args...)` with a fixed binary path, argument arrays, a minimal allowlisted environment (`PATH`, `HOME` in the jail, `GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`), and `--` separators before user-controlled positional args. Never `sh -c` with interpolated input on the host.
- **User build/start commands** run *inside* containers only:
  - Build commands become `RUN` steps in a generated Dockerfile (Phase 7) or are the user's own Dockerfile (Phase 4).
  - Start commands become the container `CMD`: exec form, or `["/bin/sh","-c", cmd]` *inside the container*, which is the user's own sandbox.
- **Validation at the agent** is independent of the CP: IDs match `^[a-z]+_[0-9a-z]{10,40}$`, paths are resolved and jailed, and ports, limits, and label values are range-checked.

## 18.4 Go layout (§72)

```text
agent/                              (same repo, own go.mod)
  cmd/arcellite-agent/main.go       (flags, config load, wiring only)
  internal/
    config/        config file + defaults + validation
    api/           unix-socket HTTP server (Phase 2–3), WSS client (Phase 10); envelope decode, version negotiation
    protocol/      generated types from proto/ + validators
    auth/          identity keys, enrollment, peer-cred check, request verification
    commands/      one file per command handler; dispatcher; idempotency journal
    docker/        Docker SDK adapter (interface → fake for tests)
    build/         BuildKit driver, build limits, cache policy
    source/        upload extraction jail, git fetch, analysis
    deployments/   release spec → container create/start/promote/stop
    containers/    managed lifecycle, label gate
    networks/      arc-edge + per-project networks
    volumes/       managed volumes
    caddy/         admin-socket client, route rendering, ETag handling
    health/        http/tcp probes
    metrics/       host + container sampling, ring buffer
    logs/          tail, redaction, build log files
    events/        docker events watcher → protocol events
    gc/            workspace/build/image/cache cleanup
    security/      path jail, hardening defaults, policy refusals
    journal/       on-disk command journal (/var/lib/arcellite/agent/journal)
proto/arcellite/agent/v1/*.proto    shared schema (Go + TS codegen)
```

**Same repo or another?** **Same repo (monorepo), separate module and release artifact.** Protocol changes land atomically with CP changes, and contract tests run in one CI. Version skew is still handled explicitly (§19.4) because installed agents lag CP upgrades.

---

# 19. Agent enrollment and protocol

## 19.1 Enrollment flow

1. The owner clicks "Add server". The CP creates `enrollment_tokens(id, server_id, token_hash, expires_at = now + 15 min, used_at NULL, created_by)` and shows a one-line install command containing the token and the CP URL. **Only the hash is stored.**
2. The installer (a signed release binary, §19.6) runs preflight (§19.7) and writes config. The agent **generates its own Ed25519 key pair** in `/var/lib/arcellite/agent/identity/` (0600, agent user).
3. The agent calls `POST /agent/v1/enroll {token, publicKey, hostFacts, agentVersion, protocolVersion, capabilities[]}`. For remote servers the call is over TLS, and the CP's CA fingerprint is pinned from the install command.
4. In one transaction the CP verifies the token (constant-time hash compare, unexpired, unused), marks it used, and creates `agents(id, server_id, public_key, status=active)`. Remote only: it signs a **short-lived client certificate** (30 days) from the CP's internal CA.
5. Subsequent calls are authenticated as that agent identity. The token is dead.

**Same-host (Phase 2).**

- The transport is a Unix socket at `/run/arcellite/agent.sock`, owned `arcellite-agent:arcellite-cp`, mode 0660.
- The agent checks the connecting peer via `SO_PEERCRED` (the uid must be the CP service user).
- The CP proves possession of a per-install shared **CP identity key**, generated at install and readable only by the CP user. It signs each request (Ed25519 over method+path+body-hash+timestamp+nonce, ±60 s window, nonce cache).
- The agent's public key is still enrolled in PG so that the same identity model extends to remote agents.

**Comparison.**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| mTLS client certs (CP internal CA) | Standard; channel-level auth; key never leaves the agent; revocation by short TTL + DB check at handshake | CA management, cert renewal | **Remote transport (Phase 10)** |
| Signed short-lived tokens (agent signs assertion with its key, JWT/PASETO-style) | Simple, stateless verify, works through TLS-terminating proxies | Replay window needs nonces | **Same-host request signing now**; fallback for remote when mTLS termination is impossible |
| Shared static API key | Trivial | Theft = permanent impersonation, no per-agent revocation | **Rejected** |
| SSH (Coolify/Dokploy style) | Familiar | Grants a shell; inbound port; not typed | **Rejected** |

## 19.2 Agent enrollment sequence (diagram 5 of 7)

```mermaid
sequenceDiagram
  autonumber
  actor O as Owner
  participant UI as Browser
  participant CP as Control plane
  participant DB as PostgreSQL
  participant I as Installer (signed)
  participant A as Agent
  O->>UI: Add server
  UI->>CP: POST /servers/:id/enrollment-tokens
  CP->>DB: INSERT enrollment_tokens(hash, expires 15m)
  CP-->>UI: one-time command (token + CP URL + CA fingerprint)
  O->>I: run on target host
  I->>I: verify signature/checksum, preflight checks
  I->>A: install unit, write config (no token persisted after use)
  A->>A: generate Ed25519 key (0600)
  A->>CP: enroll {token, pubkey, facts, agentVersion, protocolVersion, capabilities}
  CP->>DB: tx: check+consume token, INSERT agents, audit(server.enrolled)
  CP-->>A: {agentId, serverId, [clientCert 30d], cpPublicKey}
  A->>CP: Hello {agentId, versions, capabilities} (authenticated)
  CP-->>A: {accepted protocolVersion, requiredCapabilities}
  loop every 10s
    A->>CP: Heartbeat {seq, facts delta, journal summary}
  end
```

## 19.3 Rotation and revocation

- **Rotation.** `RotateCredential` makes the agent create a new key or CSR and present it signed with the old key. The CP records the new key, and the old key stays valid for a 10-minute overlap. Remote certs auto-renew at 2/3 of their lifetime.
- **Revocation.** `agents.status = revoked` is checked on every connection and request. Open connections are closed immediately. Short cert TTL bounds the exposure if a check is bypassed.
- **Stolen credential response.** Revoke, re-enroll with a new token, and audit. The UI's "Disconnect" maps to **cordon**, and a separate "Revoke agent" is a destructive, confirmed action.

## 19.4 Protocol versioning

Envelope, identical across transports:

```json
{ "v": 1, "id": "cmd_01J…", "type": "StartDeployment", "ts": "…", "corr": {"requestId":"…","deploymentId":"…","jobId":"…"},
  "payload": { … }, "sig": "…(same-host only)" }
```

- The `Hello` handshake exchanges `agentVersion` (semver), `protocolVersions` supported (for example `[1]`), and `capabilities[]` (for example `docker.pull`, `docker.build.buildkit`, `caddy.admin`, `rootless`, `cgroup.v2`, `metrics.host`).
- The CP picks the highest common protocol version, and **gates features on capabilities**, never on agent version strings.
- Messages evolve additively (protobuf field rules). Unknown fields are ignored. Breaking changes require `v: 2`, and the CP supports N and N-1.
- Messages are defined once in `proto/`. The same-host transport uses **protojson over HTTP/1.1 on the Unix socket**, which is curl-debuggable (`curl --unix-socket`). Streams (logs, events, metrics) are SSE on that socket.
- Remote uses the **same JSON envelopes over an agent-initiated WebSocket** with mTLS.
- gRPC was considered: strong typing and streaming, a native fit for Go. It is deferred because the protobuf schema already gives typing, HTTP/2-only transport complicates Node and reverse proxies, and JSON envelopes let both transports share code. Adopting gRPC later is a transport swap, not a schema change.

## 19.5 Outbound remote agents

The agent dials `wss://<cp>/agent/v1/connect` with mTLS and keeps one multiplexed connection: CP → agent commands, agent → CP events/results, with application-level acks and heartbeats. Benefits: no inbound port on home-lab nodes, NAT-friendly, instant revocation (drop the socket), and works with the user's own self-hosted CP. There is no Arcellite cloud relay. **Offline:** the agent keeps running workloads and buffers events in its journal (bounded) until it reconnects.

## 19.6 Agent service (systemd) and install

```ini
# /etc/systemd/system/arcellite-agent.service (proposal)
[Service]
User=arcellite-agent
Group=arcellite-agent
SupplementaryGroups=docker          # root-equivalent: see compromise note
ExecStart=/usr/local/bin/arcellite-agent --config /etc/arcellite/agent.toml
StateDirectory=arcellite/agent      # /var/lib/arcellite/agent
RuntimeDirectory=arcellite          # /run/arcellite
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/arcellite
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
CapabilityBoundingSet=
AmbientCapabilities=
SystemCallArchitectures=native
SystemCallFilter=@system-service
Restart=on-failure
```

**Compromise, stated plainly.** Membership in `docker` (or access to a rootful socket) makes the agent root-equivalent regardless of these directives. The daemon will do on its behalf what systemd forbids the agent itself from doing. The hardening still matters: it limits damage from bugs in the agent process (file writes outside the state dir, loading kernel modules, device access), but it is **not** a privilege boundary around Docker. The real boundary is the agent's refusal policy (§24). **Rootless Docker** (§23.5) is the way to reduce what "root-equivalent" means. Installing the agent must be an explicit, owner-performed action.

**Install artifacts.** Replace the `curl … | sh` placeholder (`src/components/settings/settings-view.tsx:253`) with versioned release binaries, published SHA-256 checksums and signatures (for example cosign or minisign), and an install script that verifies before executing. The one-time token is passed via stdin or an env var, not argv (process listings).

## 19.7 Install validation (preflight)

The installer checks the following. It only **reports**, never silently changing the firewall.

- Linux kernel ≥ 5.4 (≥ 5.11 recommended for rootless overlay2). Architecture `amd64`/`arm64`.
- Docker present, API version ≥ minimum, daemon reachable. Rootful vs rootless detected (`docker info` `SecurityOptions` contains `rootless`). BuildKit available.
- cgroup v2 (`/sys/fs/cgroup/cgroup.controllers`) and controllers `cpu memory pids io`.
- Free disk ≥ 10 GiB on the Docker root and `/var/lib/arcellite`.
- Ports 80/443 (if Caddy enabled) and the CP port are free. The host-port range is free.
- Writable state directory with correct ownership.
- Outbound network to registries (optional), DNS resolution.
- Time sync: NTP synchronized, via `timedatectl show -p NTPSynchronized`. Warn if skew > 2 s, because tokens and TLS depend on it.
- Caddy version and admin socket reachability, if enabled.
- Firewall presence (ufw, firewalld, nftables) **reported only**, with the exact rules the user may want to add.

---

# 20. PostgreSQL decision and proposed schema

## 20.1 Decision: PostgreSQL from Backend Phase 1

| Consideration | PostgreSQL | SQLite (considered) |
|---|---|---|
| Simple self-host install | One more container or service, managed by the installer. Dokploy ships it the same way. | Zero extra process |
| Transactions + row locks | Full. `SELECT … FOR UPDATE SKIP LOCKED` for jobs, advisory locks for per-project serialization | Single-writer; no `SKIP LOCKED` |
| Concurrency (Next.js process + worker + many SSE clients) | Designed for it | WAL helps, but writer contention across processes |
| `LISTEN/NOTIFY` event fan-out | Built in | None (polling) |
| Migrations | Mature tooling | Fine |
| Multi-server future (remote agents, many writers) | Fits | Weak |
| Backup/restore | `pg_dump`/PITR; documented runbook | File copy (easier) |

**Decision.** Use PostgreSQL 16+ from the first backend milestone, installed by the Arcellite installer as a dedicated container:

- It sits on a private Docker network with no published port, or listens only on a Unix socket or loopback.
- It is labeled `io.arcellite.system=true` so the agent treats it as platform infrastructure and never as a user workload.
- A migration tool such as Drizzle Kit or node-pg-migrate (to be chosen in Phase 1) is run by the CP at startup behind an advisory lock.

This is the *same* conclusion Dokploy reached for "configuration and operational data" (Appendix A), reached independently for the reasons in the table. **Backup:** a nightly `pg_dump` to `/var/lib/arcellite/backups/` with retention, plus a documented restore. The KEK must be backed up separately (§28).

## 20.2 Schema — Phase 1 (needed now)

All tables have `id` (text, prefixed ULID/UUIDv7, e.g. `proj_01J…`), `created_at`, `updated_at`. Every tenant-scoped table has `workspace_id`.

```text
users(id, email UNIQUE, display_name, password_hash, password_updated_at,
      onboarding_completed_at, disabled_at, timezone)
sessions(id, user_id, token_hash UNIQUE, created_at, last_seen_at, idle_expires_at,
         absolute_expires_at, revoked_at, ip, user_agent, reauth_at)
login_attempts(id, identifier_hash, ip, at, success)           -- throttling
bootstrap_codes(id, code_hash, expires_at, used_at)             -- first admin
workspaces(id, name, slug)
workspace_members(workspace_id, user_id, role)                  -- 'owner' only in P1
workspace_settings(workspace_id PK, default_branch, default_environment,
                   port_range_start, port_range_end, log_retention_days, version)
notification_preferences(user_id, workspace_id, deploy_success, deploy_failure,
                         domains, servers)
servers(id, workspace_id, name, status, cordoned_at, advertised_address)  -- row for "this host"
projects(id, workspace_id, server_id, name, slug, environment, framework,
         active_release_id NULL, archived_at NULL, version)
project_sources(id, project_id NULL, workspace_id, kind, reference_json,
                status, analysis_json, created_by)
project_build_configs(project_id PK, root_directory, install_command, build_command,
                      output_directory, package_manager)
project_runtime_configs(project_id PK, start_command, internal_port, network_mode,
                        health_path, restart_policy, cpu_limit, memory_limit_mb, pids_limit)
environment_variables(id, project_id, key, scope, is_secret,
                      value_ciphertext, value_nonce, key_version, value_sha256_prefix NULL,
                      updated_by, UNIQUE(project_id, key, scope))
deployments(id, workspace_id, project_id, status, trigger_kind, triggered_by_user_id,
            source_snapshot_json, config_snapshot_json, release_id NULL,
            previous_release_id NULL, error_code, error_message,
            idempotency_key, created_at, started_at, finished_at)
deployment_steps(id, deployment_id, seq, kind, label, status, started_at, finished_at,
                 exit_code, detail)
jobs(...), job_attempts(...)                                    -- §21
idempotency_keys(key, user_id, route, request_hash, response_json, status, expires_at)
events(seq BIGSERIAL, id, workspace_id, topic, type, payload_json, at)
activity(id, workspace_id, actor_kind, actor_id, action, result, object_type,
         object_id, object_name, detail, at)
audit_log(id, workspace_id, actor_kind, actor_id, action, target_type, target_id,
          request_id, ip, user_agent, metadata_json, at)          -- append-only
```

Phase 1 creates deployments and jobs but has **no executor that touches a host**. A deployment created in Phase 1 stays `queued` with the explicit reason `AGENT_NOT_AVAILABLE`, or the API refuses creation. Recommend refusing, with `SERVER_NOT_ENROLLED`.

## 20.3 Schema — later

| Phase | Tables |
|---|---|
| 2 | `agents(id, server_id, public_key, cert_serial, status, agent_version, protocol_version, capabilities[], last_heartbeat_at)`, `enrollment_tokens`, `agent_credentials` (rotation history), `server_facts` (latest JSON), `metric_rollups(server_id, container_id NULL, metric, bucket_start, resolution, min, max, avg)` |
| 3 | `releases(id, project_id, deployment_id, image_ref, image_digest, config_snapshot_json, config_hash, status[candidate/active/superseded/failed/rolled_back], promoted_at)`, `runtimes(id, release_id, server_id, container_name, container_id, desired_state, observed_state, observed_at)`, `port_reservations(server_id, protocol, bind_address, port, project_id, UNIQUE(server_id, protocol, bind_address, port))`, `container_observations` (latest per managed container), `alerts` (basic) |
| 4 | `uploads(id, bytes, sha256, status, expires_at)`, `builds(id, deployment_id, server_id, status, cache_key, duration, log_path, image_digest)` |
| 6 | `domains(id, project_id, hostname UNIQUE, kind, desired_state, verification_token, dns_status, dns_checked_at, tls_status, route_status, upstream_status, last_error_code)`, `domain_routes(domain_id, target_release_id, internal_port, applied_version, applied_at)`, `proxy_state(server_id, caddy_etag, applied_at)` |
| 8 | `git_installations(id, workspace_id, github_installation_id, account_login, repository_selection, permissions_json, suspended_at)`, `git_repositories(id, installation_id, github_repo_id, full_name, default_branch, private)`, `webhook_deliveries(delivery_id PK, event, installation_id, received_at, signature_valid, status, deployment_id)` |
| 9 | `volumes`, `volume_attachments`, `database_services`, `backups`, `encrypted_secrets` (non-env secrets: DB passwords, registry creds) |
| 10 | Multi-server scheduling fields, `build_workers` |
| Later | `environments` (first-class preview envs), `notifications` (delivery), `roles/capabilities` custom |

---

# 21. Durable job model

**Choice: PostgreSQL-backed jobs executed by the CP worker. Long operations are *executed* by the agent, with its own local journal.** No Redis or dedicated queue until there is measured contention.

```text
jobs(
  id, workspace_id, type,                       -- deploy | cancel | teardown | analyze_source | gc | domain_apply | reconcile
  subject_type, subject_id,                     -- e.g. deployment / dep_…
  status,                                       -- queued | leased | running | waiting_agent | succeeded | failed | canceled | dead
  priority, run_after, attempt, max_attempts,
  lease_owner, lease_expires_at, heartbeat_at,
  timeout_at, cancel_requested_at,
  idempotency_key UNIQUE NULLS NOT DISTINCT,
  agent_command_id NULL,
  result_json, error_code, error_message,
  created_at, updated_at)
job_attempts(id, job_id, attempt, worker_id, started_at, finished_at, outcome, error_code, error_message)
```

- **Lease.** `UPDATE jobs SET status='leased', lease_owner=$w, lease_expires_at=now()+'30s' WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_after<=now() ORDER BY priority, id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. The worker heartbeats every 10 s. An expired lease is reclaimable.
- **Agent execution.** For `deploy`, the worker sends `StartDeployment` with `agent_command_id = hash(jobId, attempt=1)` (stable across retries), then sets `waiting_agent`. Progress arrives as events. The job holds no open HTTP request.
- **Timeouts.** Per type (for example, deploy of an image: 10 min; build: 30 min, configurable). Expiry sends `CancelDeployment`, then marks the job failed with `TIMEOUT`.
- **Cancellation.** Sets `cancel_requested_at`. The worker forwards `CancelDeployment`, and the agent aborts the context (kills the build, removes the candidate). The final state comes from the agent's ack.
- **Retries.** Only for idempotent, safe steps (source fetch, pull, `ApplyProxyRoutes`). *Never* auto-retry a promotion that may have partially happened. Reconcile instead.

## 21.1 Idempotency

| Scenario | Mechanism |
|---|---|
| Double-click Deploy | Button disabled while pending (UI), **plus** `Idempotency-Key` per intent. The server stores `(key, user, route, request_hash)` and returns the original response for 24 h. A different body with the same key gets `409 IDEMPOTENCY_CONFLICT`. Additionally, per project, a new deployment while one is `queued|running` returns `409 DEPLOYMENT_IN_PROGRESS` unless `supersede=true` (queues after or cancels the older one, per policy). |
| Browser retry / API timeout | The same key is replayed by the client retry wrapper → same deployment. |
| Duplicate GitHub webhook | `webhook_deliveries.delivery_id` PRIMARY KEY. `INSERT … ON CONFLICT DO NOTHING`. Only the inserting transaction creates a deployment (§27). |
| Agent reconnect | The agent replays unacked events with `(agentId, eventSeq)`. The CP upserts by that pair. |
| Duplicate agent command | The agent journal records `commandId → state/result`. A repeated `commandId` returns the stored result or attaches to the in-flight execution and does **not** re-run. |
| Container actions | `Idempotency-Key`. Stop on a stopped container is a no-op success (already true in the mock, `src/lib/deploy/store.ts:699`). |

**Alternatives considered.** A dedicated queue (Redis/BullMQ, NATS) adds an operational dependency with no benefit at level-1 scale. Agent-only execution without DB jobs loses durability when the agent is offline. The hybrid (PG jobs + agent journal) keeps one source of truth and survives the crash of either side.

## 21.2 Concurrency boundaries (§66)

| Scenario | Rule |
|---|---|
| Simultaneous deploys, same project | One `running` deployment per project (advisory lock + status guard). Others queue FIFO, or are rejected with `DEPLOYMENT_IN_PROGRESS` unless `supersede` is set, in which case the older queued one becomes `superseded`. |
| Multiple project builds | Per-server build slots = `buildConcurrency` (today unused, `src/components/settings/settings-view.tsx:211-213`). Pulls and starts do not consume build slots. |
| Restart during deploy | Container actions on a project's runtime while its deployment is in `starting`/`verifying`/`promoting` → `409 DEPLOYMENT_IN_PROGRESS`. Actions on the *active* release are allowed before `promoting`. |
| Server disconnect during build | Deployment → `interrupted`; the build slot is held until the agent reports or the timeout expires (§32.2). |
| Domain update during cutover | Domain route changes and promotion both take the per-project lock. Route application is serialized per server (a single Caddy writer with ETag). |
| Settings change during deploy | The deployment uses the config snapshot taken at job start. Changes apply next time (matches current UI copy "apply on the next deploy", `project-panels.tsx:607`). |

---

# 22. Deployment and release lifecycle

## 22.1 Release model

```text
Project ──< Deployment (attempt: intent, trigger, steps, logs, outcome)
                 └──(on success)── Release (immutable: image digest + config snapshot + env version hash)
Project.active_release_id ──► Release
Release ──< Runtime (container on a server; desired vs observed)
```

**Mapping to current types.**

- `Project.liveDeploymentId` (`src/lib/deploy/types.ts:142`) → `projects.active_release_id`.
- `Deployment.previousRelease: boolean` (`:175`) → `deployments.previous_release_id`.
- `Project.commitSha/commitMessage` → `release.source_commit` (or the image digest).
- `Container` (web) → a `Runtime` per release, with the container name `arc-<projectSlug>-<releaseShort>-web`.
- The mock's in-place mutation of one container (`src/lib/deploy/store.ts:205-222`) is replaced by a **new container per release**.

## 22.2 Real deployment sequence (diagram 4 of 7)

```mermaid
sequenceDiagram
  autonumber
  actor U as Browser
  participant API as CP API
  participant DB as PostgreSQL
  participant W as CP worker
  participant A as Agent
  participant D as Docker
  participant C as Caddy (Phase 6+)
  U->>API: POST /deployments {projectId} Idempotency-Key
  API->>DB: tx: check idempotency, project lock free, INSERT deployment(queued), job(deploy), event, audit
  API-->>U: 202 {deploymentId}
  U->>API: SSE subscribe deployment:<id>
  W->>DB: lease job, pg_advisory_xact_lock(project), acquire build slot (server)
  W->>DB: decrypt env (KEK) → sealed payload; snapshot config
  W->>A: StartDeployment{commandId, releaseSpec, secretsSealed, limits, health}
  A->>A: journal(commandId)
  A->>D: pull image@digest  /  build (BuildKit) → digest
  A-->>W: step events (source.fetch, pull/build, …) + log lines (redacted)
  W->>DB: steps + events (NOTIFY) → SSE to browser
  A->>D: create candidate container (labels, limits, network, no host port if routed)
  A->>D: start candidate
  loop readiness until timeout
    A->>A: probe http://candidate:port/healthPath (from project network)
  end
  alt healthy
    A-->>W: candidate.ready
    W->>DB: tx: release(active), project.active_release_id, previous → superseded
    W->>A: PromoteRelease (Phase 3: port handover / Phase 6: ApplyProxyRoutes)
    A->>C: PATCH routes If-Match etag
    A->>D: stop previous runtime (grace period), keep per retention
    A-->>W: promoted
    W->>DB: deployment ready, activity, audit, event
  else unhealthy / canceled / timeout
    A->>D: stop + remove candidate
    A-->>W: failed{code, step}
    W->>DB: deployment failed; active release unchanged
  end
```

## 22.3 Safe cutover (evaluation of the 13-step transaction)

The proposed sequence is adopted with these refinements:

1. **Create the deployment record** in a transaction with the idempotency row and the job.
2. **Lock** with `pg_advisory_xact_lock(hashtext(project_id))` while mutating project/release rows, plus a `deployments` status guard: at most one `running` per project. Queued deployments run FIFO.
3. **Resolve the source** to an immutable identity: a commit SHA (Git), an upload SHA-256, or an image **digest** (`ResolveImage`). Record it in `source_snapshot_json`.
4. **Prepare an isolated workspace**: `/var/lib/arcellite/workspaces/<deploymentId>` (§23.4).
5. **Build or pull** to an image digest. The tag is `arcellite/<projectSlug>:<deploymentShort>`, but identity is **the digest**.
6. **Create the candidate runtime** with a new name and labels. Do not reuse the old container.
7. **Start the candidate.**
8. **Readiness** per §22.6.
9. **Switch traffic.**
   - *Phase 3 (direct host port):* a port can have only one binder. Cutover is **stop old → start new bound to the port**, which gives a brief gap. The UI must say "brief interruption". Alternative: publish the candidate on a temporary port for the probe, then recreate on the reserved port. The candidate is verified before the old one stops, and the gap is only the recreate time.
   - *Phase 6 (routed):* Caddy upstream switch. Near-seamless. The old container is kept until in-flight requests drain (grace period).
10. **Mark the candidate active** (DB transaction), **after** the switch is acknowledged.
11. **Stop the previous runtime** after grace.
12. **Retain** the previous healthy release: keep the image, and keep the container stopped (not removed) for N=1 by default. Keep the last N=5 release images per project for rollback.
13. **Cleanup asynchronously** (GC job).

**Do not claim zero downtime** in Phase 3. In Phase 6, claim "no downtime for HTTP routes when the new release passes its health check", and only after testing it.

## 22.4 Rollback

`POST /projects/:id/rollbacks {releaseId}` creates a deployment with `trigger_kind=rollback`. It reuses the target release's **image digest and config snapshot**. The env snapshot is re-encrypted from stored ciphertext as of that release, or current values with a warning; this is a policy decision (§41). The rollback skips the build and runs steps 6–13. It requires: the target release exists, its image is present (or pullable by digest), the failure cause of the current release is recorded, and an audit event is written. Automatic rollback after promotion (the `autoRollback` setting) is **deferred** until post-promotion health monitoring exists.

## 22.5 Deployment states (real)

`queued → preparing → building | pulling → starting → verifying → promoting → ready`

Terminal states: `failed`, `canceled`, `superseded` (a newer deployment was queued with supersede).

Non-terminal pause: `interrupted` (agent lost; awaiting reconciliation).

Steps are **dynamic by source**:

- image: `resolve`, `pull`, `start`, `health`, `promote`.
- Dockerfile: `fetch`, `build`, `start`, `health`, `promote`.
- Routed: adds `route`.

## 22.6 Health model

| Level | Signal | Source | Used for |
|---|---|---|---|
| L1 Process running | Container `State.Running`, restart count, exit code, OOMKilled | Docker inspect/events via agent | Container status, crash-loop alert |
| L2 App ready | HTTP GET `healthPath` returns 2xx/3xx within 2 s, N=3 consecutive successes (TCP connect for non-HTTP), probed by the agent over the project network. The Docker `HEALTHCHECK` is honored if the image defines one. | Agent | Cutover gate, "Operational" |
| L3 Proxy → upstream | Caddy active/passive upstream health, or an agent probe through Caddy with the Host header | Agent / Caddy | Domain "Serving" |
| L4 Public route | Optional external check of `https://hostname/healthPath` from the CP (SSRF policy applies) | CP | Domain status, uptime |

**Mapping current simulated status.**

- `ProjectHealth.health` (`src/components/status/service-status.tsx:31-58`): `up` = L1 ∧ L2 (∧ L3 if routed); `degraded` = L1 but L2 failing, or a previous release is serving after a failed deploy; `down` = no running runtime.
- The 30-day bars become daily rollups of L2 probes (every 60 s). "Uptime %" becomes (successful probes / total probes), and is only shown once probes exist.

---

# 23. Docker/BuildKit architecture

## 23.1 Managed resource labels and names

Labels on **every** Arcellite-created container, image, network, and volume:

```text
io.arcellite.managed=true
io.arcellite.workspace=<wsId>
io.arcellite.project=<projId>
io.arcellite.deployment=<depId>
io.arcellite.release=<relId>
io.arcellite.role=web|worker|data|build|system
io.arcellite.command=<agentCommandId>     (creation provenance)
io.arcellite.schema=1
```

Deterministic names (Docker names: `[a-zA-Z0-9][a-zA-Z0-9_.-]`, ≤63 chars; project slug capped at 24 chars):

| Resource | Name |
|---|---|
| App container | `arc-<slug>-<rel8>-<role>` (for example `arc-arciin-7f3a2c1d-web`) |
| Build container / builder | `arc-build-<dep8>` (ephemeral) |
| Image | `arcellite/<slug>:<dep8>` (tag); identity = digest |
| Project network | `arc-p-<proj8>` |
| Edge network | `arc-edge` (Caddy + routed web containers) |
| Managed volume | `arc-v-<slug>-<name>` |
| System | `arc-sys-postgres`, `arc-sys-caddy` (role `system`, never user-mutable) |

**The agent mutates only resources with `io.arcellite.managed=true`**, and refuses `role=system` except via dedicated platform commands. Unmanaged containers are listed read-only, with a "not managed by Arcellite" badge.

## 23.2 Build pipeline

- **Engine.** BuildKit, which Docker documents as the default builder. It supports secret mounts, cache, and parallel stages (Appendix A).
- **Build job.** `BuildImage` executes `buildx build` (or the Docker API build with BuildKit) with:
  - Context = the jailed workspace subdirectory `rootDirectory`.
  - The Dockerfile path validated to be inside the context.
  - `--network=default` (egress allowed for package installs). `--network=host` and `--allow` entitlements (`network.host`, `security.insecure`) are **never** used.
  - `--provenance`/`--sbom` optional later.
  - Output: image loaded into the Docker image store. Record the digest.
- **Cancellation/timeout.** A context deadline kills the buildx process (process group). The partial image is discarded. The step becomes `canceled`/`failed{BUILD_TIMEOUT}`.
- **Resource limits.** The bundled Docker builder inherits the daemon's limits, so limits are weak in Phase 4 (documented). The upgrade path is a dedicated `docker-container` driver builder (`arc-sys-buildkit`) with cgroup CPU/memory/pids limits and `max-parallelism`. Build slots per server enforce `buildConcurrency`.
- **Cache.** BuildKit layer cache in the builder, with GC policy (`keepStorage`, e.g. 10 GiB default, configurable), keyed per project via `--cache-from/--cache-to type=local,dest=/var/lib/arcellite/cache/<proj>`, or relying on the builder's shared cache.
- **Logs.** `--progress=rawjson` (or the plain progress stream) is parsed by the agent into step/vertex events + log lines, redacted, then written to `/var/lib/arcellite/logs/builds/<deploymentId>.log` with sequence numbers and streamed to the CP.
- **Failed builds.** Exit code + last N lines stored in `builds`. Workspace kept for 24 h for debugging (configurable), then GC.

## 23.3 Build secrets

- Never pass secrets via `ARG`/`ENV`/`COPY`. Docker's docs state build args and env "are inappropriate for passing secrets to your build, because they're exposed in the final image" (Appendix A).
- Build-time secrets that the user marks "available at build" are passed as `--secret id=<KEY>,env=<…>` or via a tmpfs file. The Dockerfile consumes them with `RUN --mount=type=secret,id=KEY`. For generated Dockerfiles (Phase 7) Arcellite emits those mounts itself.
- **Private Git credentials never enter the build context or layers.** Git fetch happens **outside** the build, in the agent with a short-lived token held in memory and passed via `GIT_ASKPASS`/an auth header. The resulting tree has `.git` stripped, or kept without credentials. If a remote Git context is ever used, use BuildKit's `GIT_AUTH_TOKEN` secret mechanism.
- Runtime env vars are injected at container create, not at build.

## 23.4 Upload / archive extraction limits

Extraction is done by the agent (Go `archive/zip`, `archive/tar` + `compress/gzip`) in `/var/lib/arcellite/workspaces/<id>/src`:

| Threat | Control |
|---|---|
| `../` traversal, absolute paths | Reject any entry whose cleaned path is absolute, contains `..`, or resolves outside the root (`filepath.Rel` check after `Clean`). Reject Windows drive letters and backslashes. |
| Symlink escapes | Reject symlink and hard-link entries by default. If allowed later, only relative targets that resolve inside the root, and never followed during extraction (`O_NOFOLLOW`, create dirs with `0755` via `openat`-style walking, or Go 1.24 `os.Root`). |
| Hard links | Rejected. |
| Device/FIFO/setuid | Reject non-regular, non-dir entries. Strip setuid/setgid/sticky. Files `0644`/`0755` only. Owner = agent user. |
| Decompression bombs | Cap **uploaded bytes 200 MiB**, **extracted total 1 GiB**, **per-file 256 MiB**, **compression ratio > 100:1 per entry → reject**, streaming counters (do not trust headers). |
| Excessive files | **≤ 50,000 entries**, **≤ 32 path depth**, **path ≤ 1024 bytes**. |
| Time | 120 s extraction deadline. |
| Nested archives | Not extracted. |
| Upload transport | Streamed to disk with a running SHA-256. Content-Length enforced. Temp files expire after 24 h if unused. |

## 23.5 Git fetch policy

| Threat | Control |
|---|---|
| `file://`, local paths, `ext::`, `fd::` | Allow **`https://` only** in Phase 5 (SSH via deploy keys later). `GIT_ALLOW_PROTOCOL=https`, `protocol.allow=never` except `https`. |
| Embedded credentials in the URL | Reject `user:pass@` in user input. |
| Submodules | Not fetched by default (`--no-recurse-submodules`). Later: opt-in, same protocol policy. |
| Huge clones | `--depth=1 --single-branch --no-tags --filter=blob:limit=50m`, workspace quota 1 GiB, 300 s timeout, `http.lowSpeedLimit`/`lowSpeedTime`. |
| Hooks / config abuse | Fresh `HOME`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `core.hooksPath=/dev/null`, `GIT_TERMINAL_PROMPT=0`. No checkout of `.gitattributes` filters. |
| Credential leakage | Tokens only via env/askpass for that process. Never in the URL stored in the DB, logs, or `.git/config`. |
| SSRF via Git host | §23.7 |

## 23.6 Build context protections

The context is only the jailed workspace. `.dockerignore` from the source is respected, and Arcellite additionally excludes `.git`, `.env*`, `*.pem`, and `id_*`, **with a visible warning** if files like `.env` were found (the upload tips already tell users not to include secrets, `new-project.tsx:567`). The context size is capped at **1 GiB**. The agent never adds host paths.

## 23.7 SSRF policy (nuanced for home labs)

| Input | Policy |
|---|---|
| Git URL | https only. Resolve DNS in the agent and **pin the resolved IP** for the connection. Block loopback (`127.0.0.0/8`, `::1`), link-local incl. cloud metadata (`169.254.0.0/16`, `fe80::/10`), `0.0.0.0/8`, and the CP/agent's own admin ports. **Allow RFC1918/ULA by default at level 1** (home labs host Gitea/registries on the LAN), with a workspace setting "Allow private network sources" (default **on** at level 1, **off** at level ≥2). |
| Image registry | Same rules. Registry hostnames are recorded. |
| Health endpoint | Not a URL. Only a **path** probed against the project's own container (§9.4). No scheme or host input, so no SSRF. |
| L4 public route check | Only hostnames verified as the user's domains. |
| Future outgoing webhooks | Block private ranges by default, with an explicit allowlist. |

## 23.8 Garbage collection

The GC job runs daily and on disk pressure:

| Target | Rule |
|---|---|
| Failed workspaces | Delete after 24 h. |
| Successful workspaces | Delete right after build. |
| Stale build dirs | Delete when older than 24 h and no running job references them. |
| Temp uploads | Delete when unclaimed after 24 h. |
| Unused images | Keep the images of the active release plus the last N=5 releases per project. Remove other `managed=true` images older than 7 days. Never touch unmanaged images. |
| BuildKit cache | Builder GC `keepStorage`. |
| Old releases | Containers of superseded releases are removed after retention (default: keep 1 stopped). |
| Build logs | Delete after `logRetentionDays`. |
| Orphan networks | Delete `arc-p-*` networks when no project exists and they have no endpoints. |
| **Volumes** | **Never auto-deleted.** Orphans are reported for explicit, confirmed deletion. |

## 23.9 Rootless Docker (§19 of the spec)

| Arcellite function | Rootless |
|---|---|
| Pull, create/start/stop, logs, stats, networks, named volumes | Works |
| BuildKit builds | Works (rootless BuildKit) |
| Binding host ports < 1024 (Caddy 80/443, direct ports) | **Limited.** Needs `net.ipv4.ip_unprivileged_port_start` or `setcap cap_net_bind_service` on rootlesskit, or Caddy on the host. |
| cgroup resource limits | **Only with cgroup v2 + systemd** (Docker docs) |
| AppArmor profiles, checkpoint, overlay network, SCTP | **Not supported** (Docker docs) |
| Storage driver | overlay2 requires kernel ≥ 5.11. Otherwise fuse-overlayfs (slower). |
| Client source IP seen by containers | May show the rootlesskit address unless using a different port driver (known limitation; verify) |
| Socket location | `$XDG_RUNTIME_DIR/docker.sock` |

**Recommendation.** **Recommended, not mandatory.** It meaningfully reduces the blast radius of daemon or container escape (a "root" escape lands as an unprivileged host user). Its limitations mainly affect privileged ports and cgroup limits, which Arcellite can work around (Caddy with `CAP_NET_BIND_SERVICE` or a sysctl; cgroup v2 required by preflight). The installer detects rootless mode via `docker info --format '{{json .SecurityOptions}}'` containing `name=rootless`, records the capability `rootless`, and adapts: socket path and port strategy.

---

# 24. Runtime security model

## 24.1 Threat levels (§55)

| Level | Description | Arcellite stance |
|---|---|---|
| **1. Single owner / home lab** | One trusted operator deploys their own or third-party software onto their own host | **Target for the first real backend.** Protect the host and the other projects from *buggy or compromised apps*, and protect the control plane from the network. |
| 2. Trusted team | Several authenticated users with different roles, all trusted not to attack the host | Needs RBAC (§30), audit, and restricted Compose. Same isolation primitives. |
| 3. Hostile multi-tenant hosting | Unknown users run arbitrary code for others | **Not supported.** Docker namespaces alone are not a hostile multi-tenant sandbox. It would require VM/gVisor/Kata isolation, network policy, and quota enforcement. Out of scope, and the product must not claim it. |

## 24.2 Default container hardening (enforced by the agent, not configurable in v1)

- `Privileged=false`. No `--device`. `CapDrop=ALL` then `CapAdd=[CHOWN, SETUID, SETGID, NET_BIND_SERVICE, DAC_OVERRIDE, FOWNER]`. This is a compatibility baseline to validate in Phase 3. The target is a narrower set.
- `SecurityOpt=["no-new-privileges:true"]`. The default seccomp profile stays on (`seccomp=unconfined` is never allowed). The AppArmor `docker-default` profile applies where available.
- `NetworkMode` = the project network (`arc-p-*`) + `arc-edge` for routed web. **Never `host`.** No `PidMode=host`, `IpcMode=host`, or `UsernsMode=host`.
- **Mounts:** managed named volumes only (Phase 9). **No bind mounts** in v1. **Never** `/var/run/docker.sock` or any host root path.
- Limits: default `Memory` = 512 MiB (configurable), `NanoCPUs` = 1 core, `PidsLimit` = 512, `ulimits nofile` = 65536. Log driver `local` with `max-size=10m,max-file=3`.
- `RestartPolicy`: `unless-stopped` (default) or `on-failure:5`. `always` is allowed but not the default. Crash-loop detection: restart count > 5 in 10 min raises an alert.
- `ReadonlyRootfs`: an opt-in per project (many frameworks write to the root filesystem), with a tmpfs `/tmp` when enabled.
- User: honor the image's `USER`. Warn in the UI when the image runs as root (UID 0).
- Published ports: bind to the server's **selected LAN address**, not `0.0.0.0`, unless the user opts in.

**What these defaults do not do.** They reduce but do not eliminate kernel-level escape risk, and a malicious image can still use CPU/network within its limits and reach the LAN (egress is not restricted in v1).

## 24.3 Compose recommendation (§54)

**Defer real Compose** through Phase 8. The current UI only records a file name (`src/components/projects/new-project.tsx:589-590`).

When it is implemented (Phase 9+), use a **restricted Compose parser**. Arcellite parses the file and translates each service into its own typed runtime spec. It never runs `docker compose up` on raw input. The parser rejects `privileged`, `cap_add`, `devices`, `network_mode: host|container:*`, `pid`, `ipc`, `userns_mode`, `security_opt` weakening, `sysctls`, bind mounts / absolute or relative host paths, `docker.sock`, `extra_hosts` pointing at the host, `build.args` containing secrets, and `ports` outside the reservation system. Allowed are `image`, `build` (via BuildKit), `environment`, `command`, `depends_on`, named volumes (managed), internal `expose`, and `healthcheck`.

"Raw Compose" may later exist only as a **trusted-admin-only, explicitly warned** mode at level 1. It is never available at level ≥2.

## 24.4 Storage classes (§56–57)

| Class | Where | Lifetime | Survives release replacement? | Deletion |
|---|---|---|---|---|
| Temp source workspace | `/var/lib/arcellite/workspaces/<dep>` | Minutes to 24 h | n/a | GC automatically |
| Build cache | BuildKit cache / `/var/lib/arcellite/cache/<proj>` | Size-capped | n/a | GC automatically |
| App volume | Docker named volume `arc-v-<slug>-<name>`, label `io.arcellite.managed` | Until explicitly deleted | **Yes.** Re-attached to each new release container by the runtime spec. | Explicit, confirmed, audited only |
| Database volume | Same, `role=data` | Until explicitly deleted | Yes | Explicit, confirmed, audited only. Backup offered first. |
| Backup artifact | `/var/lib/arcellite/backups/<service>/<ts>` (optionally off-host later) | Retention policy | n/a | Retention job |

Arbitrary host bind mounts are **not supported** in v1 (§24.2). A future allowlisted "host path" feature would be owner-only, restricted to a configured parent directory (for example `/srv/arcellite-data`), and never allow `/`, `/etc`, `/var/run`, `/proc`, `/sys`, or home directories.

**Managed databases (Phase 9, not the first deployment milestone).**

- PostgreSQL, MySQL, and Redis from pinned official images (by digest).
- Project-private network only. Generated credentials stored as encrypted secrets and injected into the consuming project as `DATABASE_URL`.
- Persistent volume. Engine-specific health (`pg_isready`, `mysqladmin ping`, `redis-cli ping`). Scheduled logical backups.
- **Ports private by default.** External exposure is an explicit, warned, audited host-port reservation bound to a chosen address.

---

# 25. Networking model

## 25.1 Modes

| Mode | Use | Mechanism | Host port? |
|---|---|---|---|
| **Private** | Workers, databases, internal APIs | Per-project network `arc-p-<proj8>`. Docker DNS by service alias (`web`, `db`). | No |
| **Direct host port** | Home-lab/LAN access, non-HTTP (TCP/UDP) services; **the only public mode before Phase 6** | Publish `bindAddress:hostPort → internalPort` from a DB reservation | Yes (reserved) |
| **Domain routed** | HTTP/HTTPS apps (preferred from Phase 6) | Web container joins `arc-edge`. Caddy on `arc-edge` proxies `hostname → arc-<slug>-<rel8>-web:<internalPort>`. | **No** |

This matches the current UI's endpoint model (`http://ip:exposedPort`, `src/lib/deploy/helpers.ts:50-52`) for Phase 3, and adds routed mode later. The UI's "Exposure" select (`new-project.tsx:741-749`) should become Private / Local port / Domain.

## 25.2 Per-project networks and cross-project access

- Each project gets its own bridge network, so projects cannot reach each other by default.
- Caddy joins `arc-edge`, and **only routed web containers** join `arc-edge`. Caddy does not join each project network, which keeps the proxy's reach minimal.
- Databases join only their project's network and are never on `arc-edge`.
- **Later cross-project access** is an explicit "link": attach consumer project Y to provider X's network under an alias, recorded as a DB relation and audited. There is no implicit shared network.
- Note: `arc-edge` lets routed web containers reach each other. To avoid that, use one edge network per routed project that Caddy joins, which Caddy supports. **Recommend per-project edge attachment for Caddy** if the number of networks stays manageable (≤ ~100). Decide in Phase 6.

## 25.3 Firewall awareness

Docker-published ports bypass ufw on many distros because Docker inserts iptables rules. The UI must warn that a direct-port app is reachable by anyone who can reach that address. Arcellite binds to the selected LAN address by default, and preflight reports the firewall situation without changing it.

## 25.4 Race-safe host-port allocation

- Table `port_reservations(server_id, protocol, bind_address, port) UNIQUE`.
- Allocation happens in the same transaction as project create/update. `INSERT … SELECT candidate FROM generate_series($start,$end) … WHERE NOT EXISTS … LIMIT 1 ON CONFLICT DO NOTHING RETURNING port` retries on conflict, so concurrent requests cannot receive the same port.
- The allowed range is per server (default 8080–8999, from `portStart`, `src/lib/deploy/types.ts:333-334`). Before binding, the agent checks the OS (`CheckPortFree`), because a non-Arcellite process may hold the port. If it is taken, the result is `PORT_CONFLICT` and the reservation is flagged `blocked_by_host`.
- A reservation is released only when the project is archived **and** its runtimes are removed.
- Routed apps have **no reservation**.

---

# 26. Caddy/domain architecture

## 26.1 Approach options

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Caddy JSON admin API** (agent-applied) | Granular updates by `@id`. Optimistic concurrency via `ETag`/`If-Match`. Changes are applied without restarting. A bad config is rejected while the running config stays in place. Scriptable read-back for observation. | JSON is verbose, so the agent needs a renderer | **Recommended** |
| Generated Caddyfile + `caddy reload` | Human-readable | Whole-file replacement, adaptation step, weaker read-back, a race with manual edits | Fallback / debugging export only |
| Container-label discovery (caddy-docker-proxy, Coolify's Caddy mode) | Zero agent code | Proxy needs Docker socket access; routing derived from workload labels | Rejected (§15.4) |

**Exact recommendation.**

- Caddy runs as `arc-sys-caddy`: container or systemd, installer's choice. The **admin endpoint is bound to `unix//run/arcellite/caddy/admin.sock|0660`**, group `arcellite-agent`, and is never on TCP. The Caddy docs recommend a permissioned Unix socket when running untrusted code, which is exactly our case.
- Arcellite owns one server block, `srv_arcellite`, and each domain route has `@id: "arc-route-<domainId>"`.
- The agent applies the complete desired route set for Arcellite with `If-Match: <etag>` from its last `GET`. On `412` it re-reads, re-diffs, and retries once.
- Caddy's `--resume` / autosave keeps the last good config across restarts, and the agent re-applies desired state on reconnect.
- The CP's own UI route (`deploy.<host>` → `127.0.0.1:3000`) is a separate, platform-managed `@id` that user routes cannot overwrite.
- **Automatic HTTPS.** Public hostnames with a DNS A/AAAA record pointing at the server and ports 80/443 reachable get ACME certificates automatically. LAN IPs and `localhost` get certificates from Caddy's internal CA (Appendix A). **On-demand TLS is disabled** (certificate abuse risk). Only explicitly verified hostnames are configured.

## 26.2 Domain lifecycle (desired vs observed)

```text
requested → validated (hostname syntax, not already claimed, belongs to workspace)
  → dns_required (show A/AAAA + TXT _arcellite-challenge.<host> = <random token>)
  → dns_verified (CP resolver sees A/AAAA → server public IP; TXT matches)
  → proxy_prepared (agent applied route; Caddy accepted; read-back matches)
  → tls_pending (Caddy obtaining cert)
  → active (cert present; L3 upstream healthy)
failure/side states: dns_mismatch · tls_failed (ACME error, retried with backoff) · upstream_unhealthy · proxy_rejected
```

Columns are stored separately: `desired_state` (present/absent, target release, port), `dns_status`, `tls_status`, `route_status` (applied version + etag), and `upstream_status`.

**A broken update never destroys a healthy route.** The new route is applied as a *new* `@id` version and verified first. Only then is the old one removed. If Caddy rejects the config, the previous config remains active, the domain shows `proxy_rejected`, and the serving route is untouched.

**`.local` names** (`classifyHostname` treats them as instantly active, `src/lib/deploy/helpers.ts:125`). Arcellite cannot make `.local` resolve without mDNS or LAN DNS. Recommendation: label them "LAN hostname — add it to your router/Pi-hole DNS". Serve them via Caddy with the internal CA, and keep the `ip:port` endpoint as the guaranteed path.

---

# 27. GitHub App architecture

- **GitHub App, not a PAT.** The App is registered by the self-hoster, using a manifest flow to make that one-click. Credentials (App ID, private key PEM, webhook secret, client secret) are stored **server-side** as encrypted secrets or files under `/etc/arcellite/github/` (0400 CP user), never in `NEXT_PUBLIC_*` or the browser.
- **Minimum permissions.** Repository `contents: read`, `metadata: read`, `commit statuses: write` (to report deploy status, optional), `deployments: write` (optional). Events: `push`, `installation`, `installation_repositories`. Pull requests later, for previews. GitHub recommends minimum permissions and subscribing only to needed events (Appendix A).
- **Repository-scoped installation.** Users choose "selected repositories". The CP stores `installation_id` and the repository selection, and re-reads it on `installation_repositories` events.
- **Short-lived tokens.** Installation access tokens expire after one hour (GitHub docs). The CP mints them on demand, **scoped down** with the `repositories` + `permissions` request body to exactly the one repo and `contents:read`. It caches them in memory until near expiry and passes them to the agent only inside a single `FetchSource` command. They are never persisted.
- **Flow.** `beginGitHubInstallation` → redirect to `https://github.com/apps/<app>/installations/new?state=<csrf-state>` → callback verifies `state`, resolves the installation via the App JWT, and stores it.

## 27.1 Webhook security

1. Size limit (for example 5 MiB, since GitHub caps payloads) enforced before reading.
2. Verify `X-Hub-Signature-256` = HMAC-SHA256(secret, raw body), constant-time compare, **before** JSON parse. Invalid → 401, logged, counted.
3. Event allowlist (`push`, `installation*`, `ping`). Others → 204 ignored.
4. `INSERT webhook_deliveries(delivery_id = X-GitHub-Delivery)` `ON CONFLICT DO NOTHING`. A duplicate → 200 no-op (dedupe and replay protection).
5. Verify `installation.id` is a known, non-suspended installation for some workspace, and `repository.id` is in its selection **and** linked to a project whose `project_sources` references that repo ID. Never match by name only.
6. Branch rule: `ref == refs/heads/<project.branch>` and `project.autoDeploy`.
7. Create the deployment with `idempotency_key = "gh:" + delivery_id + ":" + project_id` and `trigger_kind=push`. Commit SHA = `after`.
8. Audit + activity (actor = `github:<sender.login>`).

A push can therefore never deploy an unlinked or unauthorized repository.

---

# 28. Secrets architecture

## 28.1 Model

- **Envelope encryption.**
  - KEK = 256-bit key in `/etc/arcellite/keys/kek-v<N>` (0400, owner = CP service user). Or a systemd credential (`LoadCredential=`). Or an env var for containerized installs. **Never stored in PostgreSQL.**
  - Each workspace has a DEK wrapped by the KEK (`workspace_keys(workspace_id, version, wrapped_dek, kek_version)`).
  - Values are encrypted with **AES-256-GCM** (or XChaCha20-Poly1305) with a random nonce and **AAD = `workspace_id|project_id|variable_id|key|scope`**, so ciphertext cannot be swapped between rows.
  - `key_version` is stored per value.
- **Rotation.**
  - KEK rotation: write `kek-v<N+1>` and re-wrap DEKs (small, online).
  - DEK rotation: background re-encryption job. Old versions are kept until nothing references them.
  - Documented procedures plus audit entries.
- **Least privilege.** Only the CP process can read the KEK. The agent never sees the KEK. It receives decrypted runtime values only inside a `StartDeployment` command over the authenticated channel, holds them in memory, and passes them to Docker `Env`.
  - Known limitation: anyone with Docker access can `docker inspect` env. That is accepted at level 1 and documented. A future option is file-mounted secrets via tmpfs.
- **Browser.** After save, a secret's value is **never returned**. The DTO is `{key, scope, secret: true, hasValue: true, updatedAt, updatedBy}`. "Reveal" is `POST …/reveal`: it requires a session re-auth within 5 min, is rate-limited, audited (`secret.revealed`), and returns the value once. Copy works only after reveal. Non-secret variables are returned in plaintext.
- **Logs.** No plaintext secrets in any log.
  - The CP's structured logger has a denylist of field names (`password`, `token`, `secret`, `authorization`, `cookie`, `value`).
  - The agent redacts known secret values of the current project (exact-match, min length 6) plus patterns (`helpers.ts:205-209` style) at ingestion.
  - Redaction is not user-disableable.
- **Audit metadata.** Who created/updated/revealed/deleted which key (never the value), when, and from which IP and request.
- **Backups.** DB dumps contain only ciphertext. The KEK is backed up separately. Losing the KEK means secrets are unrecoverable, and the UI must say so during setup.

This follows OWASP's guidance: least privilege, rotation, audit, and envelope encryption with the KEK stored on a different system/location than the DEK-protected data (Appendix A).

## 28.2 Current exposure (documented)

Plaintext secret values are in `localStorage` (`src/lib/deploy/store.ts:93-100`), fixture database passwords (`src/lib/deploy/fixtures.ts:817`, `:834`), a fixture log line containing a password (`:612`, masked only when `redactSecrets` is on), and reveal/copy UIs (`environment-view.tsx:179-195`, `databases-view.tsx:120-128`, `env-editor.tsx:79-91`). The Developer "Export" downloads everything including secrets (`developer-view.tsx:46-54`). This is acceptable for demo data, and must not carry over to the server provider.

---

# 29. Authentication/session architecture

- **Initial admin bootstrap.**
  - The installer generates a one-time **setup code** (random 128-bit, displayed in the installer output and written to `/var/lib/arcellite/setup-code` 0400). The DB stores only its hash, with a 24 h TTL.
  - The first visit shows "Create owner account" and requires the code. This prevents a LAN neighbor from racing to claim the instance.
  - After use the code is invalidated and the setup route returns 404.
- **Password hashing.** Argon2id (OWASP minimum m=19 MiB, t=2, p=1; recommend m=64 MiB, t=3). Minimum length 12, maximum 128, checked against a breached-password list offline (optional). Constant-time compare. Upgrade parameters on login.
- **Server-side sessions.** A random 256-bit token. The DB stores `sha256(token)`. Rotate the token on login and privilege change.
- **Cookie.** `__Host-arcellite_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`. Lax permits the top-level GitHub callback navigation. Strict would break it. The OWASP session guidance mandates HttpOnly and SameSite=Strict/Lax (Appendix A).
- **CSRF.**
  - (1) SameSite=Lax.
  - (2) All state-changing requests must be non-GET and carry `Content-Type: application/json`.
  - (3) An `Origin` (fallback `Referer`) exact-match against the configured public origin. Mismatch → 403 `CSRF_FAILED`.
  - (4) A synchronizer token header `X-CSRF-Token`, bound to the session, for defense in depth.
  - The webhook route is exempt (HMAC instead).
- **CORS.** Same-origin only. No `Access-Control-Allow-Origin` header at all on `/api/v1`, and never `*`.
- **Host check.** Reject requests whose `Host` is not in the configured allowlist (DNS-rebinding protection for LAN installs).
- **Expiry.** Idle 12 h, absolute 7 days. "Remember device" can extend the absolute limit to 30 days later. Sensitive actions (secret reveal, agent revoke, password change, owner transfer) require re-auth within 5 min (`sessions.reauth_at`).
- **Revocation.** Logout deletes the session. "Sign out everywhere". Password change revokes all other sessions. Owner can list and revoke sessions.
- **Throttling.** Per-identifier and per-IP: after 5 failures, exponential backoff up to 15 min. Generic error messages. `login_attempts` retention 30 days. The bootstrap route is also throttled.
- **Future.** TOTP (RFC 6238) as a second factor, then WebAuthn/passkeys, with recovery codes stored hashed.
- **HTTP on LAN** is an open issue (§41). The recommendation is to serve the CP through Caddy with the internal CA by default. The `Secure` cookie then works, and the user trusts the CA once or uses a public hostname.

---

# 30. Authorization model

- **Model.** `workspace_members(role)` with roles `owner | admin | developer | viewer`. A central `can(actor, capability, resource)` function in `src/server/auth/authorize.ts` maps roles to capabilities:

| Capability | owner | admin | developer | viewer |
|---|---|---|---|---|
| `read_project` | ✓ | ✓ | ✓ | ✓ |
| `deploy_project` | ✓ | ✓ | ✓ | — |
| `edit_environment` | ✓ | ✓ | ✓ | — |
| `view_secret` | ✓ | ✓ | — | — |
| `manage_domain` | ✓ | ✓ | ✓ | — |
| `control_container` | ✓ | ✓ | ✓ | — |
| `manage_server` (enroll, revoke, cordon) | ✓ | ✓ | — | — |
| `manage_workspace` (members, settings, Git App) | ✓ | — | — | — |
| `read_audit` | ✓ | ✓ | — | — |

- **Phase 1 minimum boundary.**
  - (a) Every API route is authenticated except `auth/*`, the bootstrap route, and the webhook route.
  - (b) Every service function takes an `ActorContext {userId, workspaceId, role, requestId}` and calls `can()`, even though the only role is `owner`.
  - (c) Every query filters by `workspace_id` from the actor, never from the request body.
  - (d) The agent trusts only the CP identity, not browser-supplied IDs.

  This avoids baking "everyone is root" into the code while shipping single-owner.

---

# 31. Logs/events/metrics architecture

## 31.1 Event/log flow (diagram 6 of 7)

```mermaid
flowchart LR
  subgraph AgentHost["Agent"]
    DE["Docker events"] --> AE["events/ normalizer"]
    BK["BuildKit progress"] --> RL["logs/ redactor<br/>(project secrets + patterns)"]
    CL["container stdout/stderr (tail)"] --> RL
    MS["metrics sampler (10s/15s)"]
    RL --> BF[("build log files<br/>/var/lib/arcellite/logs/builds")]
    AE --> J[("journal (unacked events)")]
  end
  J -- "event envelopes (agentId, seq)" --> ING
  RL -- "log frames (seq)" --> ING
  MS -- "samples" --> ING
  subgraph CPW["CP worker"]
    ING["ingest: validate · dedupe (agentId,seq) · 2nd redaction"] --> EV[("PG events (seq)")]
    ING --> ST[("PG deployments/steps/observations")]
    ING --> MR[("PG metric_rollups")]
    EV -- "NOTIFY" --> HUB["SSE hub"]
  end
  HUB -- "SSE id=seq (resume with Last-Event-ID)" --> BR["Browser provider cache"]
  BR -- "GET logs?cursor= / SSE tail" --> CPW
  CPW -- "TailLogs (on demand)" --> AgentHost
```

## 31.2 Log categories

| Category | Producer | Storage | Retention | Access |
|---|---|---|---|---|
| Control-plane logs | Next.js + worker (structured JSON to stdout → journald) | Host journal | OS policy | Admin (host) |
| Agent logs | Agent (JSON → journald) | Host journal. `TailAgentLog` for UI. | OS policy | Owner/admin |
| Build logs | Agent, per deployment | Files (seq-numbered NDJSON) + PG `builds.log_path` | `logRetentionDays` (default 14) | `read_project` |
| Container logs | Docker `local` driver (rotated), tailed by the agent on demand | Docker (bounded by rotation) | Rotation size | `read_project` |
| Audit log | CP services | PG `audit_log` (append-only; no UPDATE/DELETE grants for the app role except the retention job) | 1 year default | owner/admin |

Every line carries: `ts` (RFC3339Nano, from the agent clock, with the CP receive time too), `level`, `source` (category + component), `workspaceId`, `projectId?`, `deploymentId?`, `containerId?`, `seq`, `requestId?`. Log injection protection: control characters are escaped, and the message length is capped at 16 KiB. The OWASP logging guidance covers these fields, sanitization, and excluding sensitive data (Appendix A: validated by knowledge; the fetch was blocked).

## 31.3 Real-time transport comparison

| | SSE | WebSocket | Polling |
|---|---|---|---|
| Browser ← server events/logs | **Chosen**: HTTP-native, auto-reconnect + `Last-Event-ID` resume, passes through Caddy | Overkill for one-way. Needs its own auth/CSRF handling. | Fallback for counters |
| Agent ↔ CP (remote) | Possible but one-way | **Chosen**: bidirectional over one outbound connection | No |
| Agent ↔ CP (same host) | **Streams on the Unix socket** (logs, events) + request/response for commands | Not needed | No |
| gRPC | — | — | Deferred (§19.4) |

CRUD remains plain request/response.

## 31.4 Metrics

- **Host samples every 10 s:** CPU %, load, memory used/total, disk used/total per mount (Docker root + `/var/lib/arcellite`), network rx/tx bytes/s, uptime, Docker daemon ping, agent heartbeat.
- **Container samples every 15 s** for managed containers: CPU %, memory, network rx/tx, state, restart count, uptime.
- **The agent keeps a 1-hour raw ring buffer in memory** for "live" charts, served via `GetMetrics`. The CP stores **1-min rollups (min/avg/max) for 48 h** and **1-hour rollups for 30 days** in `metric_rollups`. A daily job prunes them. The latest value lives on `servers`/`runtimes`. Raw high-frequency samples are never persisted indefinitely.
- Today's `ServerMetrics.series` (36 synthetic points, `src/lib/deploy/helpers.ts:150-160`) maps to `?range=24h&step=1h`. It needs timestamps.

## 31.5 Activity vs audit (§78)

- **Activity** (existing `ActivityEvent`, human-friendly): "Deployment succeeded · Arciin". Shown in the UI and used for notifications. Retained 90 days. Written by services.
- **Audit log** (new, security): `auth.login.succeeded/failed`, `auth.session.revoked`, `secret.created/updated/revealed/deleted`, `deployment.triggered` (user/webhook), `rollback.triggered`, `domain.created/deleted`, `server.enrollment_token.created`, `agent.enrolled/rotated/revoked`, `container.stopped/restarted` (manual), `project.archived`, `settings.security.changed`, `git.installation.added/removed`. Includes actor, IP, user agent, `requestId`, and target. **Separate table, append-only, longer retention, owner/admin read only.** The current Activity page's "audit log" wording (`src/components/activity/activity-view.tsx:33`) should change when this exists.

## 31.6 Alerts and notifications (§79, not implemented)

- An alert evaluator in the worker consumes events and metric rollups. Rules:
  - `deployment.failed`.
  - `server.offline` (no heartbeat for 60 s).
  - `disk.pressure` (≥ 85% warn, ≥ 95% critical, measured on the Docker root).
  - `container.crash_loop` (> 5 restarts in 10 min).
  - `route.unhealthy` (L3 failing for 3 min).
  - `certificate.failed` / `certificate.expiring` (< 14 days).
  - `backup.missing` (Phase 9).
  - `redaction` rules are removed, because redaction is always on.
- Alerts have a stable `fingerprint` (rule + subject) and a lifecycle of `open → acknowledged → resolved`. Auto-resolve when the condition clears. Resolving and reopening keep history.
- Notifications are generated from events filtered by `notification_preferences`. Delivery channels (email, webhook, ntfy) come later.
- The current derived alerts (`src/components/alerts/alerts-view.tsx:46-80`) map 1:1 to these rules, except "secret redaction is off".

---

# 32. Reconciliation and crash recovery

## 32.1 Desired vs observed

The reconciler (in the CP worker) runs **on every agent `Hello`**, **on relevant Docker events**, and **every 60 s** per server:

| Drift | Detection | Action |
|---|---|---|
| DB says running, Docker says exited | Observation `state=exited` for the active release runtime | Record `observed_state`. If the restart policy should have restarted it, raise a crash-loop alert. **Never silently redeploy.** Offer "Start". |
| Container missing entirely | Not in the managed inventory | `observed_state=missing`, alert. Offer "Recreate from release" (same digest). |
| Container changed manually (image/labels/env differ) | `config_hash` label ≠ desired | Flag `drifted`. Do not auto-fix in v1. Offer "Recreate". |
| Unknown managed container (labels but no DB record) | Label with an unknown release | Report as an orphan. GC after 7 days only if stopped. |
| Caddy route missing or different | `GetProxyState` diff vs desired | Re-apply desired routes (idempotent). Audit. |
| Old image removed (rollback target) | Image digest absent | Mark the release `image_missing`. Rollback then pulls by digest if the source is a registry, else it is unavailable. |
| Agent restarted | New `Hello` with a journal summary | Resume or ack in-flight commands (§32.2) |
| Host rebooted | `Hello` with a new boot ID + uptime reset | Full inventory reconcile. Containers with restart policies come back via Docker. Others are reported `stopped`. |

**Browser state is never authoritative.** The provider cache is replaced by server truth on every SSE reconnect (full resync if `Last-Event-ID` is too old).

## 32.2 Crash and disconnect behavior

| Event | Behavior |
|---|---|
| **Heartbeat stops** | After 30 s → server `unknown`. After 90 s → `disconnected`. Runtime observations are marked `stale` (UI shows the last-known state with a "stale" indicator). **Nothing is marked failed yet.** New deployments to that server stay `queued` (`waiting_agent`) with a visible reason. |
| **Docker goes down** | The agent reports `docker: unavailable`. Server `degraded`. Commands fail fast with `DOCKER_UNAVAILABLE`. In-flight deployment → `interrupted`. |
| **Connection lost during a deployment** | Job → `waiting_agent`, deployment → `interrupted` (UI: "Waiting for home-server to reconnect"). On reconnect the agent's journal reports the command outcome (completed / failed / still running / unknown). The CP applies it. If the outcome is unknown after reconnect, the deployment fails with `AGENT_LOST_STATE` and cleanup of any candidate by labels. |
| **Control-plane restart** | All state is in PG. Expired leases are reclaimed by the worker. SSE clients reconnect and resume. Agents reconnect or the worker re-dials the socket. |
| **Postgres restart** | The CP returns 503 `DB_UNAVAILABLE` and retries the connection. The agent keeps running workloads and journals events. Nothing is lost. |
| **Agent restart** | Workloads are unaffected (Docker owns them). The agent replays its journal and reconciles. |
| **Docker restart** | Containers follow their restart policies. The agent re-subscribes to events and the reconciler runs. |
| **Host reboot** | As above, plus boot-ID detection. Caddy resumes its last config and the agent re-applies desired routes. |
| **Browser closes** | No effect. Deployments are server jobs. |
| **Worker crash** | Lease expiry (30 s) → another worker (or the restarted one) reclaims it. Agent commands are idempotent by `commandId`. |

---

# 33. Security threat model

Current Phase 1 exposure is minimal for host threats (nothing touches the host). The main current exposures are data in `localStorage` and the absence of authentication, which does not matter while the app is only a local demo.

| # | Threat | Attack surface | Impact | Current Phase 1 exposure | Future exposure | Mitigation | Phase | Residual risk |
|---|---|---|---|---|---|---|---|---|
| 1 | Docker socket compromise | Agent process; any container with the socket mounted; TCP daemon | Full host root | None (no Docker) | Critical | Socket only in Zone 3. Never mounted into containers. No TCP daemon. Agent typed API + refusal policy. Systemd hardening. Rootless recommended. | 2–3 | An agent RCE = host compromise (rootful) |
| 2 | Command injection | Agent exec of git/buildx; user commands | Host RCE | None | High | Docker SDK first; `exec.CommandContext` + arg arrays; `--` separators; no host `sh -c`; user commands only inside containers | 3–5 | Bugs in third-party binaries (git) |
| 3 | Path traversal | Archive entries, `rootDirectory`, `outputDirectory`, Dockerfile path | Host file write/read | None (bytes never read, `new-project.tsx:183-211`) | High | Jail + `Rel` checks + reject links (§23.4); agent re-validates paths | 4 | Low |
| 4 | Archive bomb | Uploads | Disk/CPU exhaustion | None | High | Byte/entry/ratio/time limits; streaming counters; quota | 4 | Low |
| 5 | Malicious Dockerfile | User builds (`RUN` anything, huge layers, network egress) | Resource abuse, LAN attacks from the build, cache poisoning | None | High | BuildKit without host/insecure entitlements; limits; dedicated builder; per-project cache keys; timeouts | 4 | Egress to LAN is allowed at level 1 |
| 6 | Malicious Compose | `privileged`, host mounts, devices, host net, socket | Host root | None (filename only, `new-project.tsx:589-590`) | Critical | Defer; then a restricted parser (§24.3) | 9+ | Low if restricted |
| 7 | Host-mount abuse | Runtime spec, Compose, volume config | Host compromise/data theft | None | Critical | No bind mounts in v1; managed named volumes only; the agent refuses absolute host paths | 3 | None in v1 |
| 8 | Secret leakage (storage/transport/UI) | DB, browser, exports, API responses | Credential theft | **Present**: plaintext in `localStorage`, reveal/copy, JSON export (`store.ts:93-100`, `developer-view.tsx:46-54`) | High | Envelope encryption; KEK off-DB; write-only DTOs; audited reveal; no export of secrets | 1 | Docker `inspect` shows env at level 1 |
| 9 | Secret leakage through logs | Build/runtime output echoes env; error messages | Credential exposure | Partial: fixture log with a password; redaction toggle (`fixtures.ts:612`, `logs.ts:158`) | High | Ingestion-time redaction (known values + patterns), always on; structured logger denylist | 3 | Transformed secrets (base64) can slip through |
| 10 | CSRF | Cookie-authenticated mutations | Unauthorized deploy/delete | N/A (no server) | High | SameSite=Lax + Origin check + CSRF header + JSON-only | 1 | Low |
| 11 | Session theft | XSS, network sniffing, shared machines | Account takeover | N/A | High | HttpOnly/Secure/`__Host-`; HTTPS; short idle; re-auth for sensitive ops; CSP; React escaping | 1 | Malware on the client |
| 12 | SSRF | Git URL, registry, health, future webhooks, DNS checks | Metadata/LAN pivot | None (URLs never fetched) | Medium | Scheme allowlist; IP pinning; block loopback/link-local/metadata; health is path-only (§23.7) | 5 | LAN targets allowed at level 1 by design |
| 13 | Webhook spoofing | `/api/v1/webhooks/github` | Unauthorized deploys | None | High | HMAC-SHA256 before parse; installation + repo ID + link + branch checks | 8 | Webhook secret theft |
| 14 | Webhook replay | Re-sent deliveries | Duplicate deploys | None | Medium | `delivery_id` PK dedupe; idempotent deployment key | 8 | None |
| 15 | Agent impersonation | Agent endpoints/socket | Fake observations, stolen commands incl. env secrets | None | High | Enrollment with one-time token; per-agent key/mTLS; peer-cred on socket; CP CA pinning | 2 | Host already compromised |
| 16 | Stolen agent credential | Agent identity files | Impersonation until revoked | None | High | 0600 keys; short cert TTL; rotation; instant revoke; anomaly audit (new IP) | 2/10 | Window until detection |
| 17 | Unauthorized proxy route | Caddy admin; domain API | Traffic hijack, cert for a foreign domain | None | High | Admin on a Unix socket only; agent-only writer; DNS TXT ownership check; no on-demand TLS; platform routes protected by `@id` | 6 | DNS takeover of the user's own zone |
| 18 | Privilege escalation (in app) | Role checks, IDOR via IDs | Cross-workspace access | N/A | Medium | Central `can()`; workspace filter from the actor; opaque prefixed IDs; tests | 1 | Logic bugs |
| 19 | Container escape | Kernel/runtime bugs; weak defaults | Host root (rootful) | None | High | Hardening defaults (§24.2); seccomp/AppArmor; no privileged; patching guidance; rootless recommended; no hostile multi-tenancy claim | 3 | Kernel 0-days |
| 20 | Resource exhaustion | Builds, apps, logs, uploads, metrics | Host outage, CP DoS | Browser only (200 ms timer) | High | Default limits; pids limit; build slots; log rotation; upload caps; rate limits; disk-pressure alerts; GC | 3–4 | Noisy neighbors within limits |
| 21 | Database compromise | PG credentials, network exposure, backups | Config/secret ciphertext theft, tampering | None | High | PG on a private network/socket only; strong generated password; least-privilege app role; ciphertext + off-DB KEK; encrypted backups | 1 | KEK + dump both stolen |
| 22 | Dependency / supply-chain compromise | npm deps (`package.json`), Go modules, base images, installer, Caddy/BuildKit binaries | CP or agent RCE | Present for the CP build (npm) | High | Lockfiles (`pnpm-lock.yaml` exists); `pnpm audit` / `govulncheck` in CI; pinned image digests for system containers; signed agent releases with checksums; replace `curl \| sh` (`settings-view.tsx:253`) | 1 (CI), 2 (release signing) | Upstream compromise |
| 23 | DNS rebinding against the LAN CP | Browser on the LAN | CSRF-like access | N/A | Medium | Host header allowlist; Origin checks | 1 | Low |
| 24 | Bootstrap takeover | First-run page on the LAN | Instance takeover | N/A | High | Setup code from installer output (§29) | 1 | Local attacker with host console |

---

# 34. Feature backend-gap table

| Feature | Current implementation | Frontend entry point | Provider method | Mock dependency | Required CP backend | Required agent op | DB entities | Streaming? | Security concerns | Phase |
|---|---|---|---|---|---|---|---|---|---|---|
| Projects | Store CRUD in LS (`store.ts:430-548`) | `projects-view.tsx`, `project-panels.tsx` | `createProject/updateProject/deleteProject` | fixtures, `uniqueSlug` | Project API, validation, archive + teardown job | Teardown (3) | projects, configs, activity, audit | Status only | IDOR, delete safety | 1 |
| GitHub source | Hard-coded account + fixture repos | `new-project.tsx:378-481` | `connectGitHub` | fixtures repositories | GitHub App, installations, repo/branch listing, token minting | `FetchSource(git, token)` | git_installations, git_repositories | No | App key custody, scoped tokens | 8 |
| Upload | Fake progress; name-based detection | `new-project.tsx:183-211` | (none) | `filesForUpload` | Upload sessions, size caps, SHA-256 | `FetchSource(upload)` + `AnalyzeSource` | uploads, project_sources | Upload progress | Traversal, bombs | 4 |
| Git URL | Stored string; URL-substring detection | `new-project.tsx:575-621` | (none) | `filesForGitUrl` | URL policy, probe | Clone (jail) + analyze | project_sources | Analysis progress | SSRF, protocol abuse | 5 |
| Docker image | Stored string; wrongly treated as `dockerfile` | `new-project.tsx:586-588` | (none) | `filesForImage` | Reference parse | `ResolveImage`, pull | project_sources, releases | Pull progress | Registry creds, tag mutability | **3** |
| Compose | File name only | `new-project.tsx:589-590` | (none) | `filesForCompose` | Restricted parser | Per-service runtime | services model | Yes | Critical privileges | Deferred (9+) |
| Framework analysis | `detectFramework` over guessed lists | `new-project.tsx:157-181` | (none) | detect.ts | Analysis job | `AnalyzeSource` (bounded file list) | project_sources.analysis | Optional | Reading untrusted trees | 4–7 |
| Environment variables | Plaintext in LS, reveal/copy | `EnvEditor`, `environment-view.tsx` | `updateProject({env})` | — | Encrypted env API, import, audited reveal | Receive values in `StartDeployment` | environment_variables, workspace_keys, audit | No | Secret leakage | 1 |
| Deploy | Timer engine | `new-project.tsx:263`, `project-frame.tsx:82` | `startDeployment` | engine.ts | Deployments + jobs + locks + idempotency | `StartDeployment` | deployments, steps, jobs, releases | **Yes** | Idempotency, resource abuse | 3 |
| Redeploy | = start | project header, lists, detail | `redeploy` | — | Rebuild vs re-release vs rollback | same | releases | Yes | — | 3 |
| Cancel | Freeze view | `deployment-detail.tsx:54-66` | `cancelDeployment` | engine.ts | Cancel request + job | `CancelDeployment` | jobs | Yes | Late cancel after promote | 3 |
| Deployment logs | Scripted, regenerated | `LogStream target="deployment"` | (bypassed) `logs` | logs.ts | Log index + SSE tail | Build log stream, container tail | builds (log_path) | **Yes** | Secret redaction | 3 |
| Pipelines | Materialized, index-keyed analytics | `pipelines-view.tsx` | (bypassed) | engine.ts | Aggregates by step kind | — | steps | Yes | — | 3 |
| Service status | Release-derived "uptime" | `service-status.tsx` | (none) | helpers | Health observations + rollups | `ProbeHealth` | health_checks (rollup) | Yes | — | 3 (basic) / 6 (routes) |
| Servers | Fixture + sine metrics | `servers-view.tsx`, `server-detail.tsx` | `refreshServer/restartAgent/disconnect/reconnect` | fixtures, `serverMetrics` | Enrollment, cordon, revoke, facts | `Hello`, `Heartbeat`, `GetHostInfo`, `RequestSelfRestart` | servers, agents, enrollment_tokens | Yes | Agent identity | 2 |
| Containers | Fixture + timers | `containers-view.tsx` | `containerAction` | store timers | Inventory + managed control | `List*`, `WatchDockerEvents`, `Start/Stop/RestartManagedContainer` | runtimes, observations | Yes | Unmanaged mutation, DoS | 2 (read) / 3 |
| Domains | Timers, `.invalid` rule | `domains-view.tsx`, `ProjectDomains` | `addDomain/verifyDomain/deleteDomain` | helpers | DNS verification, desired routes | `ApplyProxyRoutes`, `GetProxyState` | domains, domain_routes, proxy_state | Yes | Route hijack, ACME abuse | 6 |
| Storage | Read-only fixtures | `storage-view.tsx` | (none) | fixtures | Volume inventory | `ListVolumes` (2), managed volumes (9) | volumes, attachments | No | Host paths, data loss | 2 (read) / 9 |
| Databases | Fixtures with passwords | `databases-view.tsx` | (none) | fixtures | Managed services, credentials | `CreateDatabaseService`, backups | database_services, encrypted_secrets | No | Credential exposure, public ports | 9 |
| Metrics | Sine waves | `metrics-view.tsx` | (bypassed) `metrics` | helpers | Rollups + range API | `StreamMetrics` | metric_rollups | Yes/poll | — | 2 |
| Alerts | Derived in the view | `alerts-view.tsx` | (none) | — | Evaluator + lifecycle | — | alerts | Yes | Alert fatigue | 3 (basic) |
| Events | `state.activity` | `events-view.tsx` | (none) | store | Events API | events from agent | events | Optional | — | 1 |
| Activity | `state.activity` (≤200) | `activity-view.tsx` | (none) | store | Activity API | — | activity | Optional | — | 1 |
| Notifications | Filtered activity | `notifications-view.tsx` | (none) | settings | Notification feed + prefs | — | notification_preferences | Optional | — | 1 |
| Settings | LS, several unused | `settings-view.tsx` | `updateSettings` | — | Split per §7.3 | agent config for build slots (4) | workspace_settings, users, notification_preferences | No | Security policies | 1 |
| Ask Arc | Rule-based over the snapshot | `project-chat.tsx` | (none) | assistant.ts | Read-only APIs (reuse) | — | — | No | Data exposure scope; no mutations | 1 |

---

# 35. Route-to-backend table

| Route | Component(s) | Current data | Current actions | Future API | Future events (SSE topics) | Agent dependency | DB dependency | Phase |
|---|---|---|---|---|---|---|---|---|
| `/` | `OverviewView`, `ReleaseChart` | Full snapshot | Links | `GET /summary`, `/projects?limit`, `/deployments?limit=3`, `/activity?limit=5`, `/servers` | `summary`, `deployment:*`, `server:*` | Server facts (2) | projects, deployments, activity, servers | 1→3 |
| `/chat` | `ProjectChat` | Snapshot + LS chat | Ask | Same read APIs | — | No | Read tables | 1 |
| `/projects` | `ProjectsView`, `ProjectsTable` | projects, deployments | Redeploy, delete, copy | `GET/DELETE /projects`, `POST /deployments` | `project:*` | 3 (deploy) | projects | 1 |
| `/projects/new` | `NewProjectView` | settings, server | Choose | `GET /workspace/settings`, `/servers` | — | — | settings | 1 |
| `/projects/new/[source]` | `NewProjectView` | repos, github | Analyze, create, deploy | `/sources`, `/uploads`, `/git/installations/*`, `/projects`, `/deployments` | `source:<id>` | FetchSource/Analyze/Resolve | project_sources, uploads | 3–8 |
| `/projects/[id]` | `ProjectFrame`, `ProjectOverview`, `ProjectStatusCard` | project + related | Redeploy, copy | `GET /projects/:id`, `/releases`, `/containers?projectId` | `project:<id>` | Observations | projects, releases, runtimes | 1→3 |
| `/projects/[id]/deployments` | `ProjectDeployments` | deployments | Redeploy | `GET /deployments?projectId&cursor` | `project:<id>` | — | deployments | 3 |
| `/projects/[id]/logs` | `LogStream` | `collectLogs` | Search/pause/copy/download | `GET /logs?projectId&cursor` + stream | `logs:project:<id>` | TailLogs | builds | 3 |
| `/projects/[id]/environment` | `ProjectEnvironment`, `EnvEditor` | env with values | Save | `GET/PUT /projects/:id/environment`, `/reveal` | — | — | environment_variables | 1 |
| `/projects/[id]/domains` | `ProjectDomains` | domains | Add/verify/remove | `/domains?projectId`, `POST /domains`, `/verify` | `domain:<id>` | ApplyProxyRoutes | domains | 6 |
| `/projects/[id]/settings` | `ProjectSettingsForm` | project | Save, delete | `PATCH /projects/:id` (If-Match), `DELETE` | `project:<id>` | Teardown | projects, configs | 1 |
| `/deployments` | `DeploymentsView`, `ServiceStatusBoard` | deployments | Redeploy | `GET /deployments?filters` | `deployment:*` | — | deployments | 3 |
| `/deployments/[id]` | `DeploymentDetail`, `LogStream` | deployment + logs | Cancel, redeploy, copy | `GET /deployments/:id`, `/cancel`, `/logs` | `deployment:<id>`, `logs:deployment:<id>` | Start/Cancel | deployments, steps, builds | 3 |
| `/servers` | `ServersView` | servers, containers | Refresh, restart agent | `GET /servers`, `/servers/:id/agent/restart` | `server:*` | Hello/Heartbeat | servers, agents | 2 |
| `/servers/[id]` | `ServerDetail` | server, metrics, containers, volumes, activity | Refresh, restart, disconnect, reconnect | `/servers/:id`, `/metrics`, `/cordon`, `/revoke`, `/enrollment-tokens` | `server:<id>` | yes | servers, agents, metric_rollups | 2 |
| `/containers` | `ContainersView` | containers | Start/stop/restart | `GET /containers`, `POST /containers/:id/{start,stop,restart}` | `container:*` | yes | runtimes, observations | 2/3 |
| `/domains` | `DomainsView` | domains, endpoints | Add/verify/remove | `/domains` | `domain:*` | yes | domains | 6 |
| `/storage` | `StorageView` | volumes | Inspect | `GET /volumes` | — | ListVolumes | volumes | 2/9 |
| `/databases` | `DatabasesView` | databases (passwords) | Reveal/copy | `GET /databases`, `/databases/:id/credentials/reveal` | `database:*` | Phase 9 ops | database_services | 9 |
| `/logs` | `LogsView`, `LogStream` | all logs | Filter, copy, download | `GET /logs?target&cursor` + stream | `logs:*` (scoped) | TailLogs | builds | 3 |
| `/metrics` | `MetricsView` | synthetic series | Refresh | `GET /servers/:id/metrics?range&step` | `metrics:server:<id>` (throttled) | StreamMetrics | metric_rollups | 2 |
| `/events` | `EventsView` | activity | Filter | `GET /events?cursor` | `events` | — | events | 1 |
| `/alerts` | `AlertsView` | derived | Links | `GET /alerts`, `POST /alerts/:id/acknowledge` | `alert:*` | Indirect | alerts | 3 |
| `/activity` | `ActivityView` | activity | Filter | `GET /activity?cursor` | `activity` | — | activity | 1 |
| `/pipelines` | `PipelinesView` | deployments | Filter | `GET /deployments?include=steps`, `/pipelines/stats` | `deployment:*` | — | deployments, steps | 3 |
| `/environment` | `EnvironmentView` | all env with values | Add/import/reveal/copy/delete | `/projects/:id/environment` (+ `/import`, `/reveal`) | — | — | environment_variables | 1 |
| `/notifications` | `NotificationsView` | activity + prefs | Filter | `GET /notifications`, `PATCH /me/preferences` | `notification` | — | notification_preferences | 1 |
| `/settings` | `SettingsView`, `ToastSettings` | settings, github, servers | Save, GitHub, restart agent | `/workspace/settings`, `/me/preferences`, `/git/installations`, `/servers/:id/agent/restart` | — | restart | workspace_settings etc. | 1/8 |
| `/profile` | `ProfileView` | displayName | Rename | `GET/PATCH /me` | — | — | users | 1 |
| `/developer` | `DeveloperView` | full state | Mock tools | **none for the server provider** (admin diagnostics later: versions, schema, health) | — | — | — | mock only |
| `/docs` | `DocsView` | static | — | — | — | — | — | — |
| `/jobs` | redirect | — | — | — | — | — | — | — |

---

# 36. Provider migration plan

## 36.1 Steps

1. **(Phase 1, on the mock) Close the bypasses.** Add provider-level hooks: `useDeployment(id)`, `useDeploymentLogs(query)`, `useServerMetrics(id, range)`, `useProjectHealth(id)`. In the mock provider they call the existing `materializeDeployment`, `collectLogs`, `serverMetrics`, and `projectHealth`. Replace direct imports in:
   - `logs-view.tsx:16`
   - `log-stream.tsx:59`
   - `metrics-view.tsx:41`
   - `server-detail.tsx:39`
   - `deployments-view.tsx:35`
   - `deployment-detail.tsx:42`
   - `pipelines-view.tsx:38`
   - `helpers.latestDeployment` / `deploymentsFor` call sites

   The UI stops knowing that progress is time-derived.
2. **Introduce DTO contracts** (`src/lib/api/contracts/*.ts`, Zod), with `ProjectDTO`, `DeploymentDTO`, `EnvVarDTO` (write-only secrets), and so on. Make the mock produce DTO-shaped data (mask secret values in the mock too, with a mock-only reveal).
3. **Reshape the provider interface** to `DeployProviderV2`:
   - **Queries.** `list*`/`get*` return cached resources and trigger fetches.
   - **Commands.** Each takes `{…, idempotencyKey}` and returns an accepted resource.
   - **`subscribe(topic, listener)`**.
   - **`capabilities`** (for example `{mock: true, sources: ['image','upload',…]}`), so the UI hides unsupported sources instead of faking them.

   Keep `useDeployState()` as a thin compatibility selector over the cache during migration.
4. **Mock-only extension.** `resetDemo`, `clearWorkspace`, and `simulateFailure` move to `provider.dev?: MockDevTools`. Developer tools render only when `provider.dev` exists.
5. **`ServerDeployProvider`** (`src/lib/deploy/server-provider.ts`, client code, no secrets): `fetch('/api/v1/...', {credentials:'same-origin', headers: {'X-CSRF-Token', 'Idempotency-Key'}})` plus one `EventSource`. It normalizes into the same cache shape.
6. **Selection.**
   - `ARCELLITE_PROVIDER=mock|server` is read **server-side** in the root layout, a server component, and passed as a prop (`<Providers provider="server">`). It is **not** a `NEXT_PUBLIC_*` variable.
   - The value is non-secret. The server provider needs no secrets in the browser: auth is by cookie.
   - Default `mock` until Phase 3 passes. In `server` mode, unauthenticated users are redirected to `/login`.
7. **Contract tests** (§36.4) must pass for both providers before switching the default.

## 36.2 Provider method changes (summary)

See §5.2. Most important:

- Split whole-world snapshot into queries + a topic stream.
- Add idempotency keys.
- Secrets are write-only and reveal is audited.
- Env gets its own API.
- GitHub becomes an installation redirect.
- Mock tools are isolated.
- Typed container operations apply to managed containers only.
- Server cordon/revoke replaces disconnect/reconnect.
- Structured errors.
- Logs and metrics become streaming queries.

## 36.3 UI adjustments the backend will force (documented, not done)

- Pipelines analytics keyed by `step.kind` (`pipelines-view.tsx:47-59`).
- Dynamic step lists per source (`deployment-detail.tsx:140-154` already maps `view.steps`, so this is fine).
- The "Image" source must skip build fields.
- Secret reveal/copy flows must become an explicit, audited action.
- "Disconnect/Reconnect" becomes Cordon/Revoke/Enroll.
- The service-status "uptime" label changes until probes exist.
- Remove `showFailure` special-casing of `proj_api` (`project-panels.tsx:578`).
- Server-mode "Sign Out" becomes real.
- Wire or remove the unused settings.

## 36.4 Provider contract tests (§81)

Write a behavioral suite `src/lib/deploy/provider.contract.ts` parameterized by a provider factory:

- create project → appears in `listProjects`.
- duplicate idempotency key → same deployment.
- deploy → reaches a terminal status via subscription.
- cancel in flight → `canceled`, and the previous release is unchanged.
- secrets never returned in read DTOs.
- invalid input → `VALIDATION_FAILED` code.
- delete → archived, and deployments remain queryable.

Run it against `MockDeployProvider` in unit tests (fast, uses fake timers), and against `ServerDeployProvider` in integration (Postgres + fake agent in Phase 1, real agent + Docker in Phase 3). The mock must implement idempotency and secret masking so the contract means the same thing.

---

# 37. Type/model migration plan

| Current type | Phase 1 action | Later |
|---|---|---|
| `Project` | Derive `ProjectDTO` without `env`, `simulateFailure`, `runtime`, `commitSha`, `commitMessage`, `liveDeploymentId`. Add `activeRelease?: ReleaseSummaryDTO` and `runtimeState` (observed). Keep the UI `Project` as a view model built from DTOs. | Split build/runtime configs |
| `EnvironmentVariable` | `EnvVarDTO {id,key,scope,secret,hasValue,value?: string /* only non-secret */,updatedAt}`, `EnvVarWrite {key,scope,secret,value?}` (omitting value keeps the existing value) | Build-time secret flag |
| `Deployment` | `DeploymentDTO` minus `failAt`, `previousRelease` → `previousReleaseId`, `triggeredBy` → `{kind, user?}`, add `code` to the error, `steps[].kind` | `releaseId` |
| `DeploymentStatus` | Add `canceling`, `interrupted`, `superseded`. Drop `stopped` from deployments. | — |
| `Server` | `ServerDTO` = entity + `facts?` + `latestMetrics?` + `agent?`. Drop `sampleShift`. | Multi-server |
| `Container` | `ContainerDTO` (observed) + `managed: boolean` + `releaseId?` | — |
| `Domain` | `DomainDTO` with separate `dns/tls/route/upstream` statuses. Drop `failVerification`, `verifyStartedAt`. `ssl: simulated-active` removed. | — |
| `DatabaseService` | Drop `password` from the DTO. Add `credentialsRef`. | Phase 9 |
| `ActivityEvent` | Add `objectId`, `actor {kind,id,name}`. `href` derived in the UI. | — |
| `LogEntry` | Add `seq`, `category`, `stream`, `deploymentId`, `containerId` | — |
| `Settings` | Split: `UserPreferencesDTO`, `WorkspaceSettingsDTO`, browser prefs (unchanged local), mock-only (`developerMode`) | — |
| `AppState` | Becomes the mock's internal store only. The client cache type is `DeployCache` (normalized maps + load states). | — |
| `DeployError` | Replace with `ApiError {code, message, requestId, details?, retryable}`. Keep a `title` lookup table in the UI. | — |
| `GitRepository`, `GitHubState` | `GitInstallationDTO`, `GitRepositoryDTO` (no `files`) | Phase 8 |

Agent protocol types are generated from `proto/`. They are never imported by UI code.

---

# 38. Proposed backend directory structure

```text
src/
  app/
    (dashboard)/…                     (unchanged UI routes)
    (auth)/login/page.tsx, setup/page.tsx
    api/v1/…/route.ts                 thin handlers: parse → authn → service → DTO
  server/                             import "server-only" at each entry
    http/        request context, requestId, error envelope, CSRF/origin checks, rate limit
    auth/        passwords (argon2id), sessions, bootstrap, authorize.ts (can())
    db/          client, migrations/, schema/
    repositories/ one per aggregate (projects, deployments, env, …)
    services/    projects, deployments, releases, environment, domains, servers, settings
    jobs/        queue (lease/heartbeat), handlers/, scheduler
    agents/      transport (unix, wss), envelope, protocol client, gateway (Phase 10)
    reconcile/   desired vs observed loops
    git/         GitHub App client, webhook verify, installations
    secrets/     keyring (KEK/DEK), aead, redaction lists
    domains/     DNS verification, route rendering inputs
    events/      events table writer, LISTEN/NOTIFY hub, SSE handler
    logs/        build log index/reader, redaction, logger
    metrics/     ingestion, rollups
    audit/       audit writer
  worker/main.ts                      CP worker entry (jobs, reconcile, GC, alerts)
  lib/
    api/contracts/                    Zod DTOs shared by client + server (no server imports)
    deploy/                           UI domain: types (view models), mock provider, server-provider.ts
agent/                                Go module (§18.4)
proto/arcellite/agent/v1/             protocol schema
deploy/                               installer, systemd units, caddy base config, compose for PG
```

**Keeping server-only code out of client bundles.**

- Every module under `src/server/` starts with `import "server-only"`, so a build error occurs if a client component imports it.
- An ESLint `no-restricted-imports` rule forbids `@/server/*` from `src/components/**` and `src/lib/deploy/**`.
- Secrets and environment reads happen only in `src/server/*`.
- There are no `NEXT_PUBLIC_*` secrets.
- (Per `AGENTS.md`, read `node_modules/next/dist/docs/` for the Next 16 route-handler and `server-only` conventions before implementing. That was not possible here because `node_modules` is absent.)

## 38.1 Linux filesystem layout (§49)

| Path | Owner:group | Mode | Contents | Cleanup | Visible to project code? |
|---|---|---|---|---|---|
| `/etc/arcellite/` | root:arcellite | 0750 | `agent.toml`, `cp.env` | — | No |
| `/etc/arcellite/keys/` | arcellite-cp:arcellite-cp | 0700 (files 0400) | KEK versions, CP identity key | Rotation only | **Never** |
| `/var/lib/arcellite/agent/` | arcellite-agent | 0700 | identity key/cert, journal, state | Journal compaction | No |
| `/var/lib/arcellite/workspaces/<id>/` | arcellite-agent | 0700 | extracted uploads, clones (build context) | Success: immediate. Failure: 24 h. | Only as the build context of *its own* build |
| `/var/lib/arcellite/uploads/` | arcellite-agent | 0700 | staged archives | 24 h if unclaimed | No |
| `/var/lib/arcellite/cache/<project>/` | arcellite-agent | 0700 | BuildKit local cache exports | Size-capped GC | Only via BuildKit cache |
| `/var/lib/arcellite/logs/builds/` | arcellite-agent | 0750 (group arcellite-cp read) | build logs | `logRetentionDays` | No |
| `/var/lib/arcellite/backups/` | arcellite-cp | 0700 | pg_dump, volume backups | Retention policy | No |
| `/run/arcellite/agent.sock` | arcellite-agent:arcellite-cp | 0660 | agent API | tmpfs | No |
| `/run/arcellite/caddy/admin.sock` | caddy:arcellite-agent | 0660 | Caddy admin | tmpfs | No |
| Docker data root (`/var/lib/docker` or rootless `~/.local/share/docker`) | Docker | Docker | images, volumes | GC (managed only) | Volumes mounted into the owning containers only |

"Releases" are not a directory. They are images (by digest) plus DB rows.

---

# 39. Backend implementation phases

Changes from the spec's suggested order:

- (a) **Domains/Caddy move before automatic framework builds.** Routed HTTP plus TLS removes host-port exposure and is a larger safety and UX win than auto-detection. It is also independent of the build system.
- (b) **Release/rollback lands with the first real deployment** (Phase 3), since image digests make it cheap and cutover depends on the release model.
- (c) **Compose is explicitly deferred** to after data services.

| Phase | Scope | Out of scope |
|---|---|---|
| **1 — Control-plane foundation** | PostgreSQL + migrations + backup script; `src/server/*` skeleton with `server-only`; owner bootstrap + login/logout + sessions + CSRF/origin/host checks; `can()` with owner-only; `/api/v1`: session, me, workspace settings, projects CRUD (archive), sources(kind=image) stub, environment (encrypted, write-only, audited reveal), activity, events, audit, summary; jobs table + worker process skeleton (no host executors); error envelope + requestId; `DeployProviderV2` + mock bypass removal (§36.1 steps 1–4); `ServerDeployProvider` skeleton behind `ARCELLITE_PROVIDER=server` (deploy returns `SERVER_NOT_ENROLLED`); CI workflow **proposal** (needs approval) | Docker, agent, builds, domains, GitHub |
| **2 — Read-only Go agent** | `agent/` module; enrollment tokens + Ed25519 identity; same-host Unix socket transport + request signing + peer-cred; Hello/version/capabilities; heartbeat; host facts; Docker inventory (read-only) + events; metrics sampling + rollups; server status (online/unknown/disconnected); cordon/revoke; signed release + installer preflight (report-only) | Any Docker write |
| **3 — First real deployment (pre-built image)** | `ResolveImage`/pull by digest; durable deploy job with locks, idempotency, timeout, cancel; hardened container create (§24.2); direct-host-port mode with `port_reservations`; readiness probe; release model + promote (stop-old/start-new with a documented gap) + rollback; managed start/stop/restart; container log tail + deployment event log over SSE; ingestion redaction; basic alerts (deploy failed, server offline, crash loop, disk); reconciliation after agent/host restart; teardown on archive | Builds, domains |
| **4 — Source build (upload + Dockerfile)** | Upload sessions; safe extraction (§23.4); `AnalyzeSource`; BuildKit build with timeout/cancel/limits/cache; build logs; build slots (`buildConcurrency`); GC job | Auto builds |
| **5 — Public Git + Dockerfile** | HTTPS-only clone with limits (§23.5); commit metadata; SSRF policy | Private repos |
| **6 — Domains + Caddy** | Caddy system install with admin Unix socket; desired routes + DNS TXT/A verification; agent `ApplyProxyRoutes` with ETag; TLS status; routed mode (no host port) with near-seamless cutover; L3 route health; CP served via Caddy TLS | On-demand TLS |
| **7 — Automatic framework builds** | Server-side detection over real files; Arcellite-maintained Dockerfile templates per framework (transparent, from `FRAMEWORKS` profiles in `detect.ts`) first; evaluate Nixpacks/Railpack (the maintenance status of Nixpacks must be re-verified) | — |
| **8 — GitHub App** | App manifest registration; installation flow; repo/branch listing; scoped installation tokens; webhook verification + dedupe; push-to-deploy with branch rules; commit status | GitLab/Bitbucket |
| **9 — Data services & storage** | Managed volumes + attachments; PostgreSQL/MySQL/Redis templates on private networks with generated encrypted credentials; health; scheduled backups (pg_dump/mysqldump/volume tar) + restore; explicit, warned external exposure; restricted Compose parser | Every DB engine |
| **10 — Remote/multi-server** | Outbound WSS agents with mTLS; agent gateway; per-server placement; build workers; scheduling by capacity | Clustering, HA |

---

# 40. Acceptance test for every phase

## Test strategy (§80, §82)

- **TypeScript.** Vitest unit tests for services and validation (Zod schemas, error mapping, `can()`), repository tests against a disposable Postgres (Testcontainers or a CI service container), API tests (route handler + DB), and the provider contract suite (§36.4). The existing tests stay.
- **Go.** `go test ./...` with unit tests per package. Protocol validation fuzz tests (`go test -fuzz` on envelope decode and path jail). A Docker adapter behind an interface with a fake, plus integration tests tagged `docker`. Filesystem security tests: a corpus of malicious archives (traversal, absolute, symlink, hardlink, bomb, 100k files). Command safety tests: assert no shell invocation and argument arrays only.
- **Integration (disposable VM/runner with Docker).** CP + Postgres + agent + Docker: deploy image, stream logs, restart, cancel, reconcile after agent restart and after `docker restart`.
- **Security tests.** Traversal archives, forbidden runtime options (the agent refuses `privileged`/host mounts even when sent directly), secret redaction (a secret echoed in a build is absent from stored logs), invalid webhook signature → 401 with no deployment, duplicate delivery → one deployment, auth failure/CSRF failure/cross-workspace ID → 401/403, agent with a revoked key → rejected.
- **CI (proposal only; `.github/workflows` does not exist).** Jobs: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. From Phase 2: `go vet ./...`, `go test ./...`, `govulncheck ./...`. From Phase 1: `pnpm audit --prod` (non-blocking initially). Integration jobs on a Docker-capable runner from Phase 3.

## Phase 1 — Control-plane foundation

1. `docker compose -f deploy/dev.yml up` (or the documented equivalent) starts Postgres. `pnpm dev` with `ARCELLITE_PROVIDER=server` applies migrations automatically. A second concurrent start does not double-apply (advisory lock).
2. Visiting `/` redirects to `/setup`. Setup without the code fails. With the code printed by the setup script it creates the owner. Reusing the code fails.
3. Log out/in works. Five bad passwords trigger backoff. The session cookie is `HttpOnly; Secure; SameSite=Lax` with the `__Host-` prefix (checked via response headers in the test).
4. A POST without the CSRF header or with a foreign `Origin` → 403 `CSRF_FAILED`.
5. Create a project via the UI. Restart the CP. The project is still there (PG, not `localStorage`: clear site data, log in, still present).
6. Add a secret variable. `GET /environment` returns `hasValue: true` and no value. The DB column contains ciphertext (not the plaintext, grep). Reveal requires re-auth and writes `secret.revealed` to `audit_log`.
7. Moving or renaming the KEK file makes the CP refuse to start with a clear error. Restoring it works.
8. `POST /deployments` returns `SERVER_NOT_ENROLLED` with a `requestId`. No stack trace in the body.
9. With `ARCELLITE_PROVIDER=mock` (default), the full Phase 1 UI still works, and all existing tests pass.
10. Contract suite passes for the mock and for the server provider (subset: projects, env, errors, idempotency).
11. `pnpm lint`, `typecheck`, `test`, `build` pass. No client bundle contains `src/server` code (the build fails if `server-only` is imported client-side, checked by a deliberate negative test).

## Phase 2 — Read-only agent

1. "Add server" produces a one-time command. Running it on the host enrolls the agent. Reusing the token fails. The token expires after 15 min.
2. The Servers page shows real OS/arch/CPU/memory/disk/IP/Docker version. Values match `uname`, `free`, `df`, and `docker version` within tolerance.
3. Metrics update live (≤ 15 s). A 24 h chart comes from rollups. The DB row count for metrics stays bounded after 48 h.
4. The containers list shows all Docker containers, with unmanaged ones marked read-only and no action buttons.
5. Stop the agent → server `unknown` after 30 s, `disconnected` after 90 s. Nothing marked failed. Start it → online, inventory resynced.
6. Revoke → the agent's next request is rejected and the connection is closed. Re-enroll works.
7. A process with another uid connecting to `agent.sock` is refused (peer-cred). A replayed signed request is refused (nonce).
8. The agent refuses unknown command types, and protocol v99 → `AGENT_PROTOCOL_UNSUPPORTED`.
9. `go test ./...` and `go vet ./...` pass. The agent has no code path that writes to Docker (a test asserts the Docker client used is the read-only interface).

## Phase 3 — First real deployment (the first real acceptance test)

1. Start Arcellite Deploy (server provider).
2. New project → Docker image → `nginx:alpine`, internal port 80.
3. Target `home-server`. Direct port auto-reserved (for example 8085).
4. Deploy. Double-click creates **one** deployment (idempotency).
5. A durable deployment record and job exist in PG.
6. The agent receives a typed `StartDeployment` (visible in agent logs with `commandId`).
7. Docker pulls; the release records `nginx@sha256:…`.
8. The container `arc-<slug>-<rel8>-web` starts with the `io.arcellite.*` labels, `no-new-privileges`, dropped caps, memory/pids limits, and no bind mounts (`docker inspect` assertions).
9. Real state appears in the UI via SSE without reloading.
10. Real nginx access logs stream in the project log view, with a resumable cursor after reconnect.
11. `http://<server-ip>:8085` returns the nginx page.
12. Stop works (UI + `docker ps`), start works, restart works. Each is audited.
13. Redeploy creates a new release and container, stops the old one, and keeps the old image. Rollback to the previous release works.
14. Deploy an image whose health path returns 500 → deployment `failed`. **The previous release keeps serving** (curl still 200).
15. Cancel during pull → `canceled`. No candidate container remains.
16. Restart the CP mid-deployment → the deployment completes or is reconciled. History is intact.
17. Reboot the host (or `systemctl restart docker arcellite-agent`) → the reconciler reports the correct observed state within 60 s. `docker stop` of the container by hand → the UI shows `exited` (drift) without auto-redeploy.
18. A secret env var echoed by the container in its logs appears redacted in the Arcellite log view.
19. Sending `privileged: true` or a bind mount directly to the agent socket (test harness) → refused.

## Phase 4 — Upload + Dockerfile

1. Upload a zip with a Dockerfile → analyzed from real files → build → deploy works. The build log streams.
2. The malicious archive corpus (traversal, absolute, symlink, hardlink, 10 GiB bomb, 100k files, oversized upload) → each rejected with `ARCHIVE_REJECTED` or `SOURCE_TOO_LARGE`. Nothing is written outside the workspace (filesystem diff).
3. Build timeout → `failed{BUILD_TIMEOUT}` and the process is killed. Cancel mid-build → canceled, and no image or candidate remains.
4. `buildConcurrency=1` → a second project's build waits `queued` with the reason "waiting for build slot".
5. A build secret used via `RUN --mount=type=secret` is absent from `docker history` and the image layers.
6. GC removes the workspace (success: immediately; failure: after 24 h) and old images beyond retention, and never removes volumes.

## Phase 5 — Public Git

1. `https://…` public repo with a Dockerfile deploys. The commit SHA and message are recorded and shown.
2. `file:///etc`, `ssh://`, `git@…`, `http://127.0.0.1`, `http://169.254.169.254`, and `https://user:pass@host/repo` → rejected (`GIT_URL_REJECTED`). A LAN Gitea (`https://192.168.x.y/…`) works when "private network sources" is on and fails when off.
3. A repo with submodules deploys without fetching them. A 5 GiB repo fails the size limit within the timeout. The clone contains no credentials.

## Phase 6 — Domains + Caddy

1. The Caddy admin API is unreachable over TCP (`curl localhost:2019` fails). The socket is accessible only to the agent group.
2. Add `app.example.com` → the DNS instructions include the TXT token. Before DNS → `dns_required`. After DNS → `dns_verified` → `proxy_prepared` → `tls_pending` → `active` with a real certificate.
3. The routed project has **no** host port (`docker inspect`). HTTP redirects to HTTPS.
4. Redeploy while load-testing (`hey`/`k6`) → 0 failed requests at a modest rate (document the measured result before claiming it).
5. An invalid route update (forced) → Caddy rejects it, the old route still serves, and the domain shows `proxy_rejected`.
6. Manually deleting the route via the admin socket → the reconciler restores it within 60 s.

## Phase 7 — Automatic builds

1. Next.js, Vite, FastAPI, Flask, Express, and static sample repos deploy without a Dockerfile, using the generated plan. The plan is viewable in the UI.
2. Detection runs on real files only. An unknown project yields `failed` analysis with guidance (no invented commands, matching `detect.ts` behavior).

## Phase 8 — GitHub App

1. The owner registers the App via the manifest and installs it on selected repos. The UI lists only those.
2. A push to the configured branch deploys once. Redelivering the same webhook → no second deployment. A push to another branch → ignored.
3. An invalid signature → 401, no DB row besides the rejected delivery log. A repo not linked to a project → ignored.
4. The installation token never appears in the DB or logs (grep). The agent clone uses a token scoped to one repo.
5. Uninstalling the App on GitHub → the installation is marked removed, and deploys fail with `GIT_INSTALLATION_UNAVAILABLE`.

## Phase 9 — Data services

1. Create PostgreSQL for a project → private network only (no host port), generated credentials encrypted, and the app connects via the internal DNS name.
2. Replacing the app container keeps the volume data. Deleting a project never deletes the volume without an explicit, confirmed volume delete.
3. Scheduled backup produces an artifact. Restore to a new service yields identical data.
4. Explicit external exposure requires confirmation, is audited, and binds to the chosen address.
5. The restricted Compose parser rejects each forbidden key (test per key).

## Phase 10 — Remote/multi-server

1. A NAT'd node with no inbound ports enrolls via an outbound WSS connection. Deployments to it work.
2. Cutting the network mid-deploy → `interrupted`. On reconnect the journal resolves the outcome.
3. A revoked remote agent is disconnected immediately. An expired cert → rejected. Rotation works without downtime.
4. The CP works fully offline on a LAN (no external dependency).

---

# 41. Risks and open questions

| # | Risk / question | Recommendation / owner decision |
|---|---|---|
| 1 | **HTTP-only LAN access.** `Secure` cookies and `__Host-` need HTTPS. Many home labs browse `http://192.168.x.y:3000`. | Default: the CP behind Caddy with the internal CA on the LAN IP (one-time trust) or a real hostname. Allow an explicit "insecure LAN mode" (non-Secure cookie, loud warning) only when bound to localhost/LAN? **Owner decision needed.** |
| 2 | The agent is root-equivalent with rootful Docker. | Accept at level 1. Recommend rootless. Keep the agent surface tiny. Consider a later split into a read-only observer vs a privileged executor. |
| 3 | Env values visible via `docker inspect`. | Accept at level 1. Later: tmpfs-mounted secret files. |
| 4 | Rollback env policy: stored snapshot vs current values. | Default to the **stored snapshot** (reproducible). Show a diff. **Owner decision.** |
| 5 | Direct-port cutover has a brief outage. | Document it. Routed mode fixes it (Phase 6). |
| 6 | Migration tool/ORM choice (Drizzle vs raw SQL + node-pg-migrate). | Decide at the start of Phase 1. Prefer typed SQL with explicit migrations. |
| 7 | Nixpacks maintenance status and a successor (Railpack). | Re-verify before Phase 7. Templates first. |
| 8 | `.local` hostnames cannot be made to resolve by Arcellite. | Relabel. Offer router/Pi-hole instructions. |
| 9 | The Next.js 16 conventions for route handlers/`server-only` were not verified from `node_modules/next/dist/docs/` (not installed). | Read them at the start of Phase 1, per `AGENTS.md`. |
| 10 | Existing localStorage demo data → server migration. | Do **not** import the mock state into the real DB (it contains fake infrastructure and plaintext secrets). Offer a clean start. |
| 11 | Research facts validated via search snippets because direct doc fetches were blocked. | Re-read the specific pages (Appendix A) at the start of the phase that depends on them. |
| 12 | Single-process event fan-out (SSE hub in the Next.js process) with multiple CP instances. | Out of scope (no HA). `LISTEN/NOTIFY` already supports multiple instances later. |
| 13 | Egress from builds/apps to the LAN. | Accept at level 1. Later: optional egress policy. |
| 14 | Chat history in `localStorage` may contain workspace details. | Acceptable (the same user's browser). Clear on logout in server mode. |

---

# 42. Explicit non-goals

Out of scope for the first real backend:

- Kubernetes or Swarm.
- Hostile public multi-tenancy.
- Billing, marketplace, global clusters, autoscaling.
- Control-plane HA, and a distributed tracing stack (correlation IDs are enough).
- Arbitrary remote shell, container `exec` consoles, or generic Docker passthrough.
- AI-driven or AI-initiated mutations (Ask Arc stays read-only).
- Every Git provider (GitHub + public HTTPS Git only).
- Every database engine (PostgreSQL/MySQL/Redis only, in Phase 9).
- Raw Compose, Redis, microservices.
- On-demand TLS.
- Zero-downtime claims before they are measured.

---

# 43. Exact recommendation for the NEXT coding task

**Implement Backend Phase 1 in two pull requests, in this order, only after approval.**

## PR 1 — "Provider seam hardening" (no backend, mock only, zero UX change)

1. Add `src/lib/api/contracts/` with Zod DTOs:
   - `ProjectDTO`, `DeploymentDTO`, `DeploymentStepDTO`, `EnvVarDTO`/`EnvVarWrite`, `ServerDTO`, `ContainerDTO`, `DomainDTO`, `ActivityDTO`, `LogEntryDTO`, `ServerMetricsDTO`.
   - `ApiError` with the codes in §17.4.
2. Add provider hooks `useDeployment(id)`, `useDeploymentLogs(query)`, `useServerMetrics(id, range)`, and `useProjectHealth(id)`, implemented by the mock using existing functions. Replace the direct imports listed in §36.1 step 1.
3. Add `capabilities` and a `dev?: MockDevTools` (`resetDemo`, `clearWorkspace`, `simulateFailure`) to the provider. Gate the Developer tools and the simulate-failure switch on `provider.dev`.
4. Make all mutating provider methods accept an optional `idempotencyKey`. The mock dedupes, so a double-clicked Deploy yields one deployment.
5. Add `src/lib/deploy/provider.contract.ts` and run it against the mock in Vitest.
6. Fix nothing else. List any UI copy that must change (for example "audit log", "live agent stream") as follow-ups.

Acceptance: all existing tests pass, the new contract tests pass, `pnpm lint/typecheck/build` pass, and there is no visible UI change.

## PR 2 — "Control-plane foundation"

1. Read `node_modules/next/dist/docs/` for route handlers, `server-only`, and `cookies()` in Next 16 (per `AGENTS.md`).
2. Add PostgreSQL (dev compose file) and the migration tool. Migrate the §20.2 tables *except* agent/infrastructure tables.
3. Add `src/server/{http,auth,db,repositories,services,jobs,secrets,events,audit}` with `server-only`. Add the ESLint restriction.
4. Implement owner bootstrap (setup code), Argon2id, DB sessions, the `__Host-` cookie, and CSRF/Origin/Host checks.
5. Implement `/api/v1`: `auth/*`, `me`, `workspace/settings`, `projects` CRUD (archive), `projects/:id/environment` (AES-GCM envelope, write-only, audited reveal with re-auth), `activity`, `events` (+ SSE), `audit`, `summary`. `deployments` POST returns `SERVER_NOT_ENROLLED`.
6. Add the `jobs` table + `src/worker/main.ts` skeleton (lease/heartbeat loop, no host handlers).
7. Add `ServerDeployProvider`, selected by the server-side `ARCELLITE_PROVIDER`. The default stays `mock`.
8. Add Phase 1 acceptance tests (§40) as integration tests against a disposable Postgres.
9. Propose (do not merge without approval) `.github/workflows/ci.yml`.

**Do not** add Docker, the Go agent, Caddy, GitHub, builds, or domains in the next task.

---

# Appendix A — Research validation

Direct page fetches were blocked by the environment's egress proxy. Each fact below was validated through web search restricted to the official domain, using the official page's indexed text. "Knowledge" means the detail relies on background knowledge and must be re-read before implementation.

| Fact (§92) | Verdict | Evidence |
|---|---|---|
| Docker daemon access is a critical privilege boundary | **Confirmed** | docs.docker.com/engine/security: "only trusted users should be allowed to control your Docker daemon"; the docker group "grants privileges equivalent to the root user" |
| Docker warns about exposing remote daemon access | **Confirmed** | docs.docker.com/engine/security/protect-access and /engine/daemon/remote-access: binding to `0.0.0.0:2375` "isn't recommended because someone could gain root access"; remote access without TLS "is not recommended, and will require explicit opt-in in a future release"; TLS on 2376 or SSH as alternatives |
| Rootless Docker reduces daemon/runtime privilege | **Confirmed**, with limitations | docs.docker.com/engine/security/rootless (+ troubleshoot): cgroup "supported only when running with cgroup v2 and systemd"; not supported: "AppArmor, Checkpoint, Overlay network, Exposing SCTP ports"; privileged ports < 1024 need extra config; overlay2 needs kernel ≥ 5.11 |
| BuildKit is Docker's modern builder | **Confirmed** (default builder; "since Engine 23.0" is knowledge) | docs.docker.com/build/buildkit |
| BuildKit has dedicated secret support | **Confirmed** | docs.docker.com/build/building/secrets: build args and env "are inappropriate for passing secrets … because they're exposed in the final image"; use `RUN --mount=type=secret` (default `/run/secrets/<id>`) or SSH mounts |
| Caddy has a programmable admin API | **Confirmed** | caddyserver.com/docs/api: endpoints including `POST /load`, `/config/…` |
| Caddy admin is local by default and can use a Unix socket | **Confirmed** | caddyserver.com/docs/api: "restricted to localhost by default"; if running untrusted code, bind "to a permissioned unix socket" with an optional file mode after `\|` |
| Caddy ETag/If-Match concurrency | **Confirmed** | caddyserver.com/docs/api: "use the Etag and If-Match headers to detect and prevent collisions" |
| Config changes without downtime; a failed config keeps the old one | **Knowledge** (not in the snippets; re-verify in `/docs/api`) | Caddy docs describe graceful config reloads with rollback on failure |
| Caddy supports automatic HTTPS | **Confirmed** | caddyserver.com/docs/automatic-https: public names need A/AAAA pointing at the server and ports 80/443 reachable (HTTP-01/TLS-ALPN-01); IPs/`localhost` get certificates from a locally trusted internal CA |
| GitHub Apps support installation-scoped repository access | **Confirmed** | docs.github.com (installation token generation): can restrict with `repositories` + `permissions` body; "cannot be granted permissions that the app was not granted" |
| Installation tokens are short-lived | **Confirmed** | docs.github.com: "Installation access tokens expire after 1 hour" |
| GitHub recommends minimum permissions + webhooks | **Confirmed** | Best-practices page: set a webhook secret and verify signatures; subscribe only to needed events; secure the private key |
| Webhook HMAC | **Confirmed** | docs.github.com/webhooks/…/validating-webhook-deliveries: `X-Hub-Signature-256` = HMAC-SHA256 hex digest of the body, prefixed `sha256=`. `X-GitHub-Delivery` GUID dedupe is knowledge. |
| OWASP: least privilege, rotation, audit, encryption for secrets | **Confirmed** | Secrets Management Cheat Sheet: fine-grained least-privilege access, automated rotation, comprehensive auditing, DEK/KEK envelope with the KEK "stored on another system" |
| OWASP sessions/passwords | **Confirmed** | Session Management: HttpOnly mandatory; `SameSite=Strict` (preferred) or `Lax`. Password Storage: Argon2id, min 19 MiB, t=2, p=1. |
| OWASP logging fields/redaction | **Knowledge** (fetch blocked; not surfaced by search) | Logging Cheat Sheet |
| Coolify separates control-plane state from workload state | **Confirmed** | coolify.io docs: a per-server `coolify-proxy` (Traefik default, Caddy via caddy-docker-proxy labels) forwards over Docker networks; the proxy "joins the coolify network and the resource-specific networks"; servers managed over SSH with key auth |
| Dokploy separates control-plane state from workload state | **Confirmed** | docs.dokploy.com/docs/core/architecture: Next.js app, PostgreSQL stores "all the configuration and operational data", Traefik proxy; self-hosted includes Redis; remote servers "connected via SSH" or Swarm nodes |

Sources (official pages identified via search):

- https://docs.docker.com/engine/security/
- https://docs.docker.com/engine/security/protect-access/
- https://docs.docker.com/engine/daemon/remote-access/
- https://docs.docker.com/engine/security/rootless/
- https://docs.docker.com/engine/security/rootless/troubleshoot/
- https://docs.docker.com/build/buildkit/
- https://docs.docker.com/build/building/secrets/
- https://caddyserver.com/docs/api
- https://caddyserver.com/docs/automatic-https
- https://caddyserver.com/docs/quick-starts/reverse-proxy
- https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://docs.github.com/en/rest/apps/apps
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- https://coolify.io/docs/core/networking-in-coolify
- https://coolify.io/docs/knowledge-base/server/proxies
- https://docs.dokploy.com/docs/core/architecture
- https://docs.dokploy.com/docs/core/deployment-options

---

# Appendix B — Answers to the 50 required questions

1. **What is Arcellite Deploy today?** A client-only Next.js UI with a browser-resident mock control plane persisted in `localStorage` (§1, §4).
2. **Real vs simulated?** Real: UI, validation, detection-given-files, `.env` parsing, preferences. Simulated: everything touching infrastructure, GitHub, DNS/TLS, metrics, logs, uploads (§1, §13).
3. **Current state architecture?** A module singleton `AppState` + listeners + a 200 ms tick + a full-state `localStorage` write per commit. React reads it via `useSyncExternalStore` (§4.1, §5.1, §7.1).
4. **What stays local in the browser?** Sidebar, motion, toast prefs, legacy theme, chat history (initially), and the unsaved form drafts (§7.3).
5. **What moves to Next.js server code?** Auth, validation, services, API, secrets crypto, GitHub integration, DNS checks, event hub. Jobs/reconcile in the worker (§17, §38).
6. **What moves to PostgreSQL?** Intent, config, env ciphertext, deployments/releases/steps, jobs, events, activity, audit, settings, reservations, domains, installations (§20).
7. **What moves to the Go agent?** All Docker/BuildKit/Caddy/host-filesystem operations, observations, log tailing, metrics, health probes (§18).
8. **Is PostgreSQL right first?** Yes: transactions, `SKIP LOCKED` jobs, `LISTEN/NOTIFY`, concurrency, multi-server future (§20.1).
9. **Agent repo?** Same monorepo, separate Go module and release artifact, shared `proto/` (§18.4).
10. **Browser → CP?** HTTPS JSON CRUD with cookie session + CSRF + idempotency keys, plus one SSE stream with resume (§17.1).
11. **Same-host CP → agent?** HTTP/JSON protocol envelopes over a permissioned Unix socket, peer-cred + signed requests, SSE for streams (§19.1, §19.4).
12. **Remote agents?** Outbound WSS with mTLS to the self-hosted CP, the same envelopes (§19.5).
13. **Enrollment?** One-time hashed token (15 min) → agent-generated Ed25519 key → consume token → scoped identity (§19.1–19.2).
14. **Rotation/revocation?** Signed key rollover with overlap; short-lived certs; DB revocation checked per connection; immediate disconnect (§19.3).
15. **Prevent unrestricted Docker authority?** Only the agent touches the socket. Typed commands. Label gate. Unconditional refusal of privileged/host namespaces/mounts/socket. No passthrough. Rootless recommended (§16, §18.2, §24.2).
16. **Prevent command injection?** Docker SDK, `exec.CommandContext` with arg arrays, no host shell, user commands only inside containers, independent Go validation (§18.3).
17. **Secure uploads?** Size-capped streamed staging, an extraction jail with traversal/link/bomb/count/time limits (§23.4).
18. **Secure Git?** https-only, no embedded creds, no submodules, shallow + size/time limits, hardened git env, SSRF policy with IP pinning (§23.5, §23.7).
19. **How are builds isolated?** BuildKit containers with no host/insecure entitlements, a jailed context, timeouts, build slots, and later a dedicated limited builder (§23.2).
20. **Build secrets?** BuildKit `--secret` / `RUN --mount=type=secret`, never ARG/ENV. Git creds fetched outside the build (§23.3).
21. **Docker labels?** `io.arcellite.{managed,workspace,project,deployment,release,role,command,schema}` + deterministic names (§23.1).
22. **Networking?** Private per-project networks; direct host ports (reserved); domain-routed via Caddy on `arc-edge` (§25).
23. **When are host ports used?** Only for direct mode (the Phase 3 default, LAN/non-HTTP). Never for routed HTTP apps (§25.1).
24. **Releases?** Immutable (digest + config snapshot) per successful deployment. The project points at the active release (§22.1).
25. **Cutover/rollback?** Candidate → readiness → switch → promote → stop old → retain. Rollback = a new deployment reusing a prior release (§22.3–22.4).
26. **Health?** L1 process, L2 readiness probe, L3 proxy upstream, L4 public route (§22.6).
27. **Log streaming?** The agent streams redacted frames → the CP stores build logs and relays container tails → SSE with cursors (§31.1–31.2).
28. **SSE/WebSocket/gRPC?** SSE browser-side and on the local socket; WebSocket for remote agents; gRPC deferred (§31.3, §19.4).
29. **Metrics sampling?** Host 10 s, containers 15 s, a 1 h agent ring buffer, 1-min (48 h) and 1-h (30 d) rollups in PG (§31.4).
30. **Caddy management?** The agent applies desired routes through the JSON admin API with `@id` + ETag (§26.1).
31. **Caddy admin protection?** A permissioned Unix socket only, agent group, never TCP (§26.1).
32. **Domain reconciliation?** Desired rows vs `GetProxyState` read-back every 60 s and on events. New-route-then-remove-old (§26.2, §32.1).
33. **Env secret encryption?** AES-256-GCM with a per-workspace DEK wrapped by a host-held KEK, AAD-bound, versioned (§28).
34. **Authentication?** Bootstrap setup code, Argon2id, DB sessions, `__Host-` HttpOnly Secure Lax cookie, CSRF, throttling, re-auth for sensitive ops (§29).
35. **Minimum authorization?** Actor context + central `can()` + workspace scoping on every service call, owner role only in Phase 1 (§30).
36. **GitHub App?** Self-registered App, selected repos, minimal permissions, repo-scoped hour-long tokens minted server-side (§27).
37. **Webhook duplicates?** `delivery_id` primary key + idempotent deployment key (§27.1).
38. **Jobs survive crashes?** PG jobs with leases/heartbeats; agent journal; idempotent command IDs (§21, §32.2).
39. **Idempotency?** Client `Idempotency-Key` stored 24 h, per-project in-progress guard, agent `commandId` journal, event `(agentId, seq)` dedupe (§21.1).
40. **Drift?** A reconciler compares desired DB state with agent observations; flag and offer actions, auto-repair only proxy routes (§32.1).
41. **Agent offline?** `unknown` → `disconnected`; observations stale; queued work waits; nothing auto-failed until reconnect/timeout (§32.2).
42. **Host reboot?** The boot-ID change triggers a full inventory reconcile; Docker restart policies; Caddy resume + re-apply (§32.2).
43. **Mock-only fields?** `simulateFailure`, `failAt`, `failVerification`, `verifyStartedAt`, `sampleShift`, `ssl: simulated-active`, `developerMode`, `GitRepository.files`, `importedProjectId`, synthetic `commitSha`/`commitMessage`, `Project.hostname` auto `.local`, `Project.runtime`, plaintext `password`/`value` (§6.1, §13).
44. **Provider methods needing changes?** All except `isReady`/`getServerSnapshot`/`completeOnboarding`. See the per-method table (§5.2).
45. **UI flows needing new backend capabilities?** Source intake, analysis, deploy/cancel/redeploy/rollback, logs/metrics streams, env write-only secrets, domains, server enrollment, container control, GitHub install (§14, §34).
46. **Safest order?** Foundation → read-only agent → image deploy → upload/Dockerfile → public Git → domains → auto builds → GitHub → data → remote (§39).
47. **First real acceptance test?** The `nginx:alpine` image deployment test in §40 Phase 3.
48. **Deferred?** Compose, managed DBs, remote agents, auto-rollback, on-demand TLS, multi-provider Git, everything in §42.
49. **Security guarantees after each phase?**
    - After 1: authenticated, CSRF-protected CP; secrets encrypted at rest and write-only; audit.
    - After 2: authenticated agent identity; nothing can mutate the host.
    - After 3: only typed, label-gated, hardened containers; no socket or host mounts; idempotent, durable deploys; failed deploys never replace a healthy release.
    - After 4–5: untrusted source handled under jail and limits; no build-secret leakage into layers.
    - After 6: no host ports for routed apps; Caddy admin not network-reachable; TLS.
    - After 8: only verified, linked repos deploy on push.
    - After 9: data private by default and backed up.
    - After 10: no inbound ports on remote nodes; per-agent revocation.
    - **Never:** hostile multi-tenant isolation.
50. **Next coding prompt?** §43: PR 1 (provider seam hardening on the mock), then PR 2 (control-plane foundation). No Docker.

---

# Appendix C — Defects and gaps found (not fixed)

| # | Finding | Files | Recommended phase |
|---|---|---|---|
| C1 | `DeployProvider.metrics()` and `logs()` are never called. Views compute logs, metrics, and deployment state directly, bypassing the provider. | `logs-view.tsx:16`, `log-stream.tsx:59`, `metrics-view.tsx:41`, `server-detail.tsx:39`, `deployments-view.tsx:35`, `deployment-detail.tsx:42`, `pipelines-view.tsx:38` | 1 (PR 1) |
| C2 | Create-project and start-deployment are non-atomic. A failure leaves a project without a deployment. | `new-project.tsx:240-263` | 1 |
| C3 | A new project is marked `runtime: "running"` before any deployment. | `src/lib/deploy/store.ts:464` | 1 (DTO drops it) |
| C4 | Redeploy has no concurrency guard. Parallel deployments race for `liveDeploymentId`. | `store.ts:550-604` | 1 (mock idempotency) / 3 |
| C5 | The web container is mutated in place on each release (no immutable releases). | `store.ts:205-222` | 3 |
| C6 | The image source is analyzed as a `dockerfile` build with `docker build/run` commands. | `detect.ts:85-94`, `:258-260`, `new-project.tsx:586-588` | 3 |
| C7 | `ProjectSourceDockerfile` has no route. `DomainKind "local"` is never produced. | `types.ts:91-94`, `:45`; `projects/new/[source]/page.tsx:7`; `helpers.ts:112-127` | 4 / 6 |
| C8 | Upload bytes are never read. Detection comes from the file name. Progress is animated. | `new-project.tsx:183-211`, `detect.ts:211-223` | 4 |
| C9 | The Git URL UI suggests SSH (`git@…`) and GitLab, while the backend plan is https public first. | `new-project.tsx:577` | 5 (copy) |
| C10 | Settings `portAllocation`, `buildConcurrency`, `logRetentionDays`, and `autoRollback` are saved but unused. `autoRollback` is presented as optional but is an invariant. | `settings-view.tsx:183-229` | 1 (label) / 3–4 (wire) |
| C11 | Pipeline stage analytics are keyed by array index. | `pipelines-view.tsx:47-59` | 3 |
| C12 | "Uptime %" is derived from release outcomes (degraded day = 98%), not measured. | `service-status.tsx:55` | 3 |
| C13 | Copy overstates realism: "live resource usage from the agent" and "Live agent stream" while mock. | `servers-view.tsx:26`, `:83`; `metrics-view.tsx:74` | 1 (copy) |
| C14 | The Activity page calls itself the "audit log". | `activity-view.tsx:33` | 1 (copy), 1 (audit table) |
| C15 | Secrets are plaintext in `localStorage` with reveal/copy/export. A fixture log line contains a password. | `store.ts:93-100`, `environment-view.tsx:179-195`, `databases-view.tsx:120-128`, `developer-view.tsx:46-54`, `fixtures.ts:612`, `:817`, `:834` | 1 (server provider) |
| C16 | Log redaction is read-time and user-toggleable. | `logs.ts:158`, `settings-view.tsx:223` | 3 |
| C17 | Simulate-failure is special-cased to `proj_api`. | `project-panels.tsx:578` | 1 (PR 1, move to dev tools) |
| C18 | `requireServer` always picks the home server. `servers[0].ip` is used for endpoints across views. | `store.ts:166-176`, `project-panels.tsx:70`, `domains-view.tsx:65`, `deployment-detail.tsx:45` | 3 / 10 |
| C19 | `portTaken` only checks other projects' `exposedPort`. | `helpers.ts:61-63` | 3 |
| C20 | `deleteProject` hard-deletes deployment history. | `store.ts:519-548` | 1 (archive) |
| C21 | `createEmptyState` keeps the synthetic home server. A "clear" workspace still shows fake telemetry. | `fixtures.ts:867-883` | 2 (real server) |
| C22 | `syncPrefs` writes `localStorage` without try/catch, unlike `writeStorage`. | `store.ts:102-106` | 1 (PR 1) |
| C23 | Shallow `isState` validation trusts nested `localStorage` data. | `store.ts:66-77` | 1 (mock only) |
| C24 | The agent install command is `curl … \| sh` (placeholder). | `settings-view.tsx:253` | 2 |
| C25 | The CPU/memory limit inputs are not range-checked. | `new-project.tsx:257-258` | 1 (server validation) |
| C26 | No CI workflows exist. | `.github/` absent | 1 (proposal, needs approval) |
