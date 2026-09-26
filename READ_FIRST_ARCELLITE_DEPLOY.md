# READ_FIRST_ARCELLITE_DEPLOY.md

> **MASTER PRODUCT + UI/UX + FRONTEND IMPLEMENTATION SPECIFICATION**
>
> Product: **Arcellite Deploy**
>
> Repository / working folder: `~/project/Arcellite`
>
> Phase: **Phase 1 — Product UI/UX + Frontend Foundation**
>
> Status: **Build this now**
>
> This document is the source of truth for the first implementation.

---

# 0. READ THIS BEFORE WRITING CODE

You are building **Arcellite Deploy**, a self-hostable application deployment control plane under the existing **Arcellite** brand.

The product should eventually let a user:

- connect a GitHub repository,
- upload a project manually,
- detect the project/framework,
- configure build/start commands,
- deploy frontend or full-stack applications,
- expose applications by local IP + port,
- attach custom domains,
- inspect deployments,
- view logs,
- manage environment variables,
- manage containers,
- view server health and resource usage,
- manage storage and databases,
- and later operate one or more Docker hosts from one polished control plane.

**Phase 1 is NOT the real Docker/server implementation.**

Phase 1 is the complete, beautiful, highly interactive product experience using a clean provider abstraction and realistic mock data so the real infrastructure engine can be added later without rebuilding the frontend.

Do not rush directly into Docker.

Do not create an ugly server-admin dashboard.

Do not create a generic AI-generated SaaS UI.

Do not create a visual clone of Vercel.

Build a product that feels like:

- Arcellite,
- Apple-quality interaction design,
- professional developer infrastructure software,
- simple enough for a first-time home-lab user,
- capable enough to grow into a serious deployment platform.

---

# 1. REQUIRED DESIGN REFERENCE

Before implementing UI motion and interaction behavior, read and follow:

`https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md`

Treat the concepts in that design skill as implementation requirements.

Important principles include:

- instant interaction feedback,
- response beginning on pointer-down,
- direct manipulation,
- interruptible transitions,
- spring-based motion where appropriate,
- velocity continuity for gesture-driven motion,
- consistent spatial origin,
- restrained use of animation,
- translucent materials used for hierarchy rather than decoration,
- reduced-motion support,
- reduced-transparency support,
- typography with careful tracking and leading,
- accessibility,
- physical-feeling UI behavior.

Do not merely say "Apple inspired."

Implement the behavior.

---

# 2. PRODUCT NAME

The product name for this implementation is:

# **Arcellite Deploy**

Primary product lockup:

`Arcellite Deploy`

Do not create another company identity.

Do not introduce a separate logo.

Do not create a random rocket, cube, hexagon, cloud, or abstract deployment logo.

Arcellite Deploy is a product in the Arcellite ecosystem.

Potential future URL:

`deploy.arcellite.com`

The UI may use shorter contextual language such as:

- Deploy
- Arcellite
- Arcellite Deploy

But the official product title is **Arcellite Deploy**.

---

# 3. ARCELLITE BRAND IS THE SOURCE OF TRUTH

## 3.1 Existing site

The existing live website is:

`https://arcellite.com`

The existing Arcellite brand must be treated as the source of truth for:

- logo,
- wordmark,
- primary brand color,
- accent color,
- typography direction,
- neutral palette direction,
- corner language,
- button feel,
- visual confidence,
- brand personality.

### NON-NEGOTIABLE

Before designing the application, inspect the current live `arcellite.com`.

If the existing project or repository contains official Arcellite brand assets, use those assets.

If the site exposes logo/SVG/image assets, reuse the original asset whenever reasonably possible.

Do not trace, redraw, approximate, or regenerate the logo.

Do not invent a new Arcellite logo.

Do not substitute an unrelated icon for the Arcellite logo.

---

## 3.2 Brand color rule

Do **not** arbitrarily choose a fashionable purple, blue, cyan, green, or gradient.

Derive the brand color from the CURRENT Arcellite website.

Create semantic tokens such as:

```css
--brand-primary
--brand-primary-hover
--brand-primary-active
--brand-primary-subtle
--brand-primary-foreground

--surface-canvas
--surface-sidebar
--surface-raised
--surface-overlay

--text-primary
--text-secondary
--text-tertiary

--border-subtle
--border-strong

--status-success
--status-warning
--status-danger
--status-info
```

Do not scatter raw brand hex values across components.

Keep all brand/color decisions centralized.

If exact brand assets cannot be downloaded in the development environment, structure the theme so the exact current Arcellite colors can be dropped into the token file without touching individual components.

Do not use a guessed logo.

---

## 3.3 Logo behavior

The upper-left navigation area should use the actual Arcellite identity.

Recommended lockup:

`[official Arcellite mark/wordmark]  Deploy`

Keep "Deploy" secondary to the Arcellite brand.

It should not look like two unrelated brands.

The logo area should remain compact and professional.

No giant logo.

No animated logo loop.

No glowing logo.

No rainbow logo.

---

# 4. PRODUCT POSITIONING

Arcellite Deploy should communicate:

> Deploy applications to infrastructure you control.

It should make self-hosting feel approachable.

A user should not need to understand Docker before deploying a basic project.

A technical user should still be able to inspect the underlying configuration.

The conceptual deployment flow is:

```text
GitHub / Upload
      ↓
Project analysis
      ↓
Framework detection
      ↓
Configuration
      ↓
Build
      ↓
Container
      ↓
Port / Domain
      ↓
Health + Logs + Metrics
```

The platform eventually sits between the user and their infrastructure.

---

# 5. LONG-TERM PRODUCT ARCHITECTURE

This phase should be designed so the following architecture can be introduced later:

```text
Browser
   │
   ▼
Arcellite Deploy Web App
Next.js Control Plane
   │
   │ authenticated API / events
   ▼
Arcellite Deploy Agent
Go
   │
   ├── Docker
   ├── Git
   ├── Build system
   ├── Caddy
   ├── Volumes
   ├── Networks
   ├── Metrics
   └── Logs
```

Long-term infrastructure choices:

- Docker for workloads
- Nixpacks or equivalent build detection for projects without Dockerfiles
- Dockerfile support
- Docker Compose support
- Caddy for reverse proxy / TLS
- GitHub App integration
- PostgreSQL for control-plane state
- Go deployment agent
- WebSocket or SSE for deployment/log events
- secure secret storage
- encrypted environment variables
- multi-server support later

### DO NOT IMPLEMENT ALL OF THIS IN PHASE 1.

But the frontend architecture must not prevent it.

---

# 6. PHASE 1 OBJECTIVE

Build a production-quality frontend application with realistic mock functionality.

The user should be able to navigate the application and experience almost the entire future deployment workflow.

The mock implementation must make it possible to replace the mock deployment provider later.

Create a deployment abstraction.

Example:

```text
src/
  lib/
    deploy/
      provider.ts
      types.ts
      mock-provider.ts
      helpers.ts
```

Conceptually:

```ts
interface DeployProvider {
  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project>
  createProject(input: CreateProjectInput): Promise<Project>

  listDeployments(projectId?: string): Promise<Deployment[]>
  getDeployment(id: string): Promise<Deployment>

  listServers(): Promise<Server[]>
  getServer(id: string): Promise<Server>

  listContainers(serverId?: string): Promise<Container[]>

  listDomains(projectId?: string): Promise<Domain[]>

  getLogs(target: LogTarget): Promise<LogEntry[]>

  getMetrics(serverId: string): Promise<ServerMetrics>
}
```

Use a mock implementation in Phase 1.

Later the mock provider should be replaceable by something like:

```ts
ServerDeployProvider
```

without redesigning the entire UI.

---

# 7. TECHNOLOGY STACK

Use a modern, stable, maintainable stack.

## Required

- **Next.js 16.x**
- **React**
- **TypeScript**
- **App Router**
- **Tailwind CSS**
- **Motion** for appropriate interaction animation
- **Radix UI primitives** when accessibility primitives are beneficial
- **Lucide** for interface icons
- **Zod** for schema validation
- **React Hook Form** for complex forms
- **TanStack Query** only where async client caching meaningfully improves the architecture
- package manager: **pnpm**
- strict TypeScript

Use stable releases.

Do not use experimental/canary dependencies unless absolutely necessary.

---

# 8. IMPORTANT UI LIBRARY RULE

Do not make this look like an untouched shadcn dashboard.

If shadcn code is used for utility or accessibility, it must be heavily customized to the Arcellite design system.

Avoid the predictable AI dashboard formula:

- giant rounded cards everywhere,
- huge gradient hero,
- purple glow,
- excessive border boxes,
- four identical KPI cards,
- random glass panels,
- excessive pills,
- meaningless charts,
- excessive icon badges.

The interface should feel intentionally designed.

---

# 9. VISUAL DIRECTION

Imagine a combination of:

- a modern Apple desktop application,
- a high-end developer tool,
- restrained Vercel-level clarity,
- native Arcellite branding,
- server control software that does not feel intimidating.

The application must feel:

- calm,
- precise,
- premium,
- quiet,
- fast,
- trustworthy,
- technical without looking "hacker/sci-fi",
- spacious without wasting screen real estate.

Avoid:

- neon,
- cyberpunk styling,
- sci-fi dashboards,
- glowing borders,
- matrix visuals,
- terminal green as the main theme,
- blue/purple gradient overload,
- massive 24px rounded rectangles everywhere,
- black backgrounds with white boxes everywhere,
- skeuomorphic server-rack illustrations.

---

# 10. THEMES

Support:

- dark theme,
- light theme,
- system theme.

Dark mode must receive equal or greater design attention.

Do not merely invert the light theme.

The dark theme should use layered neutral surfaces.

Example hierarchy:

```text
Canvas
  ↓
Sidebar / navigation material
  ↓
Main surface
  ↓
Raised panels
  ↓
Popover / sheet / modal
```

Avoid pure black for every layer.

Avoid bright white borders in dark mode.

Use low-contrast borders and material separation.

---

# 11. APPLICATION SHELL

Desktop shell:

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar                │ Main Content                        │
│                        │                                     │
│ Arcellite Deploy       │ Context Header                      │
│                        │                                     │
│ Overview               │                                     │
│ Projects               │ Main page                           │
│ Deployments            │                                     │
│                        │                                     │
│ Infrastructure         │                                     │
│ Servers                │                                     │
│ Containers             │                                     │
│ Domains                │                                     │
│ Storage                │                                     │
│ Databases              │                                     │
│                        │                                     │
│ Observe                │                                     │
│ Activity               │                                     │
│ Logs                   │                                     │
│ Metrics                │                                     │
│                        │                                     │
│ Settings               │                                     │
│ User / workspace       │                                     │
└──────────────────────────────────────────────────────────────┘
```

---

# 12. SIDEBAR

The sidebar should be one of the most polished areas of the application.

Navigation groups:

## Workspace

- Overview
- Projects
- Deployments

## Infrastructure

- Servers
- Containers
- Domains
- Storage
- Databases

## Observe

- Activity
- Logs
- Metrics

Bottom:

- Settings
- user/workspace control

### Sidebar interaction

- selected state must be obvious but subtle,
- do not use giant colored selected backgrounds,
- instant pointer-down feedback,
- hover must feel responsive,
- icon + text alignment must be perfect,
- keyboard focus states required,
- smooth sidebar collapse behavior,
- tooltips for collapsed icons,
- persist collapsed state locally,
- on smaller desktop/tablet widths allow a compact mode.

Do not duplicate icons.

Use each icon intentionally.

---

# 13. TOP / CONTEXT HEADER

Do not add a huge universal top navigation bar if it does not serve a purpose.

Each page should have a contextual header.

Examples:

```text
Projects                              New Project
Manage applications deployed to this server.
```

or:

```text
Arciin / Production                   Visit ↗
Latest deployment is healthy.
```

Headers should remain calm and concise.

---

# 14. OVERVIEW PAGE

Route:

`/`

or

`/overview`

The overview must answer:

1. What is running?
2. Is the infrastructure healthy?
3. What changed recently?
4. Is anything requiring attention?

Suggested structure:

```text
Good afternoon, Robera

Infrastructure is healthy.
1 server · 6 containers · 3 projects

------------------------------------------------

Projects

Arciin
Production
Ready
main
18 min ago

MODVRA Studio
Production
Ready
main
2 hr ago

Portfolio
Preview
Building
feature/home
just now

------------------------------------------------

Server

home-server
Online

CPU        17%
Memory     4.8 GB / 16 GB
Storage    186 GB / 512 GB
Network    14 Mbps

192.168.1.50

------------------------------------------------

Recent Activity

Deployment succeeded    Arciin        18m
Container restarted     worker        1h
Domain configured       api.local     3h
```

Do not simply put every item in a giant card.

Use whitespace, rules, subtle grouping, typography and material hierarchy.

---

# 15. PROJECTS PAGE

Route:

`/projects`

Include:

- search,
- environment filter,
- status filter,
- sort,
- New Project action.

Project rows should show meaningful information:

- project name,
- environment,
- source repository,
- branch,
- deployment status,
- framework icon/name,
- last deployment,
- endpoint/domain.

Support grid/list only if both are genuinely useful.

Prefer a strong list/table-like project browser over decorative cards.

Example:

```text
Arciin
Production
Roberadesissaii/arciin · main
Next.js
● Ready
arciin.local
18m
```

Clicking project opens project details.

---

# 16. NEW PROJECT EXPERIENCE

Route:

`/projects/new`

This is one of the most important flows in the entire product.

The first screen should feel extremely simple.

Headline:

**Deploy something new**

Supporting copy:

**Bring an application online from source code, a local project, or an existing container.**

Primary choices:

## GitHub

Import an existing repository.

## Upload

Upload a project archive or select a local folder when browser capabilities allow.

Secondary options can include:

- Git repository URL
- Docker image
- Docker Compose

Do not expose twenty deployment methods at once.

Use progressive disclosure.

---

# 17. GITHUB IMPORT EXPERIENCE

Mock GitHub connection in Phase 1.

Flow:

```text
Connect GitHub
    ↓
Choose account/organization
    ↓
Search repositories
    ↓
Select repository
    ↓
Select branch
    ↓
Analyze project
    ↓
Configure
    ↓
Deploy
```

Repository list should feel real.

Mock repositories can include:

- `Roberadesissaii/arciin`
- `Roberadesissaii/modvra-studio`
- `Roberadesissaii/portfolio`

Information per repository:

- repository name,
- owner,
- privacy,
- language,
- last update,
- branch,
- import button.

Use GitHub's mark/icon where appropriate but do not copy GitHub's entire interface.

---

# 18. UPLOAD EXPERIENCE

Support a polished mock drag/drop experience.

Accepted conceptual input:

- ZIP
- TAR/GZ
- local folder where supported
- project directory in future desktop implementation

Show:

- file/folder name,
- size,
- upload progress,
- analysis state,
- cancel,
- remove,
- retry.

Drag state should feel physical and immediate.

Do not create a giant dashed ugly dropzone.

Keep it elegant.

---

# 19. PROJECT ANALYSIS

After source selection, show an analysis step.

Example:

```text
Analyzing project

✓ package.json
✓ pnpm-lock.yaml
✓ next.config.ts
✓ app/

Detected
Next.js

Package manager
pnpm

Build command
pnpm build

Start command
pnpm start

Port
3000
```

Make the transition from source selection to analysis feel continuous.

Do not suddenly navigate to a completely unrelated visual layout.

---

# 20. CONFIGURE DEPLOYMENT PAGE

This is a major page.

Sections:

## General

- Project name
- Environment
- Root directory

## Source

- Repository
- Branch
- Auto deploy toggle

## Build

- Detected framework
- Install command
- Build command
- Start command
- Output directory when relevant

## Runtime

- Internal port
- exposed port mode
- restart policy later
- health endpoint

## Environment Variables

- key
- value
- secret state
- environment scope

## Resources

Future-ready but mock:

- CPU limit
- memory limit

## Networking

- local exposure
- auto-generated port
- custom port
- future domain option

Final CTA:

**Deploy**

Do not overload the user with everything initially.

Advanced controls should be collapsible.

---

# 21. FRAMEWORK DETECTION MOCK

Support realistic mock detection for:

- Next.js
- React / Vite
- Node.js
- Express
- FastAPI
- Flask
- Static HTML
- Dockerfile
- Docker Compose

Represent framework detection as data.

Example:

```ts
type Framework =
  | "nextjs"
  | "vite"
  | "node"
  | "express"
  | "fastapi"
  | "flask"
  | "static"
  | "dockerfile"
  | "compose"
  | "unknown";
```

Do not hardcode detection UI separately on every page.

---

# 22. DEPLOYMENT PROGRESS EXPERIENCE

Route example:

`/deployments/[deploymentId]`

Deployment progress should be one of the signature experiences.

Suggested timeline:

```text
Preparing source
Completed

Installing dependencies
Completed

Building application
Completed

Creating image
Completed

Starting container
Completed

Running health check
Completed

Deployment ready
```

Live mock logs appear below or beside the progress depending on viewport.

Use realistic timestamps.

Use subtle active states.

Do not create fake progress bars that jump randomly.

Use deterministic mock sequences.

Allow:

- cancel during build,
- redeploy,
- copy deployment ID,
- open source commit,
- view final application.

---

# 23. PROJECT DETAIL PAGE

Route:

`/projects/[projectId]`

Header:

```text
Arciin

Production       ● Ready

arciin.local                       Visit ↗
```

Primary tabs:

- Overview
- Deployments
- Logs
- Environment
- Domains
- Settings

Do not add tabs for pages that have no useful content.

---

# 24. PROJECT OVERVIEW

Show:

- current production deployment,
- deployment status,
- source repo and branch,
- commit,
- endpoint,
- framework,
- last deployment,
- uptime,
- resource snapshot,
- recent activity.

Potential layout:

```text
Production Deployment
--------------------------------

Ready

main
8f34a91
Deploy dashboard redesign

18 minutes ago


Runtime
--------------------------------

Framework       Next.js
Port            3000
Memory          382 MB
CPU             2.4%
Uptime          18m


Endpoint
--------------------------------

http://192.168.1.50:8082

Copy
Open
```

---

# 25. DEPLOYMENTS PAGE

Global route:

`/deployments`

Project route:

`/projects/[id]/deployments`

Statuses:

- queued,
- preparing,
- building,
- deploying,
- ready,
- failed,
- canceled,
- stopped.

Show:

- status,
- project,
- environment,
- commit,
- branch,
- duration,
- created time,
- triggered by.

Support filtering.

Do not rely only on status color.

Always pair icons/text with color.

---

# 26. LOGS

Global:

`/logs`

Project:

`/projects/[id]/logs`

Logs are important, but the page should remain readable.

Features:

- live/pause control,
- follow tail,
- search,
- level filter,
- copy,
- download later,
- clear visual timestamp,
- container/source selector.

Log levels:

- info,
- warn,
- error,
- debug.

Do not make the entire application a terminal theme.

Only the log stream should use monospace where appropriate.

---

# 27. SERVERS

Route:

`/servers`

Example server:

```text
home-server

● Online

Ubuntu 24.04 LTS
x86_64

192.168.1.50

CPU        17%
Memory     4.8 / 16 GB
Storage    186 / 512 GB

Containers  6
Projects    3
Uptime      18d 4h
```

Server detail:

`/servers/[serverId]`

Tabs:

- Overview
- Containers
- Storage
- Network
- Activity
- Settings

Phase 1 is mock data.

---

# 28. SERVER DETAIL — OVERVIEW

Sections:

- machine identity,
- status,
- uptime,
- CPU,
- RAM,
- disk,
- network,
- OS,
- architecture,
- Docker status mock,
- recent server activity.

Metrics should feel like system telemetry.

Avoid adding meaningless chart decoration.

Use charts only when historical data genuinely benefits the view.

---

# 29. CONTAINERS

Route:

`/containers`

Display:

- name,
- project,
- image,
- state,
- uptime,
- port,
- CPU,
- memory.

Actions:

- inspect,
- open logs,
- restart mock,
- stop mock,
- start mock.

Destructive actions must require confirmation.

Do not expose dangerous actions with no friction.

---

# 30. DOMAINS

Route:

`/domains`

The domain UI should prepare for:

```text
myapp.com
www.myapp.com
api.myapp.com
```

Show:

- domain,
- project,
- target,
- SSL status,
- verification state,
- created date.

Add-domain flow:

1. enter domain,
2. select project,
3. select target port/service,
4. show required DNS records,
5. mock verify,
6. show TLS provisioning,
7. ready.

Also support local-only endpoint display:

```text
192.168.1.50:8082
```

Clearly differentiate:

- local endpoint,
- private hostname,
- public custom domain.

---

# 31. STORAGE

Route:

`/storage`

Phase 1 mock.

Show server volumes and persistent storage.

Examples:

```text
postgres-data
12.8 GB
Attached to postgres

uploads
4.2 GB
Attached to arciin-web
```

Support:

- volume detail,
- attachment,
- path,
- size,
- last backup mock.

Do not build actual file management here.

This page is infrastructure storage.

---

# 32. DATABASES

Route:

`/databases`

Phase 1 mock.

Represent services such as:

- PostgreSQL
- MySQL
- Redis

Example:

```text
arciin-db
PostgreSQL 17

● Running

Internal
postgres://arciin-db:5432

Storage
18.4 GB
```

Do not expose plaintext passwords.

Secret credentials should use reveal/copy interactions with clear security behavior.

---

# 33. ACTIVITY

Route:

`/activity`

Activity should provide an audit-like timeline.

Examples:

- project created,
- deployment started,
- deployment completed,
- deployment failed,
- environment variable updated,
- server connected,
- container restarted,
- domain added,
- domain verified.

Include:

- actor,
- timestamp,
- object,
- action,
- result.

---

# 34. METRICS

Route:

`/metrics`

Provide useful infrastructure monitoring.

Global:

- CPU,
- memory,
- disk,
- network,
- container count,
- deployment count.

Server-scoped metrics.

Project-scoped metrics later.

Use restrained, readable charts.

No chart rainbow.

No giant visualization wall.

Tooltips must be useful.

---

# 35. SETTINGS

Route:

`/settings`

Sections:

- General
- Appearance
- Git Providers
- Deployment Defaults
- Security
- Server Agent
- Advanced

Phase 1 can use local persistence.

Appearance:

- Light
- Dark
- System
- Reduced motion awareness

Deployment defaults:

- default branch
- port allocation behavior
- default environment

Git Providers:

- GitHub mock connected state
- disconnect confirmation

---

# 36. COMMAND PALETTE

Implement a polished command palette.

Keyboard shortcut:

`⌘K` on macOS
`Ctrl+K` elsewhere

Commands:

- New Project
- Projects
- Deployments
- Servers
- Containers
- Domains
- Logs
- Settings
- Search project

It should open quickly and feel native.

Do not animate slowly.

---

# 37. GLOBAL SEARCH

Search should be capable of matching mock:

- projects,
- deployments,
- servers,
- containers,
- domains.

Can initially be part of command palette rather than a separate giant search bar.

---

# 38. NOTIFICATIONS / TOASTS

Use restrained toasts.

Examples:

- environment variable saved,
- deployment canceled,
- domain copied,
- container restart requested.

Do not show a toast for every click.

Critical errors should not disappear too quickly.

---

# 39. EMPTY STATES

Every major resource page must have an intentional empty state.

Examples:

Projects empty:

```text
No projects yet

Deploy your first application from GitHub or upload a project.

New Project
```

Domains empty:

```text
No custom domains

Your applications can still be reached through their local endpoint.
```

Do not use childish giant illustrations.

Small, restrained iconography is fine.

---

# 40. ERROR STATES

Implement realistic error examples.

Examples:

- failed deployment,
- server offline,
- framework detection failed,
- port unavailable,
- repository access lost,
- domain verification failed.

Errors should answer:

1. what happened,
2. what it affects,
3. what the user can do.

Avoid generic:

`Something went wrong.`

whenever useful detail exists.

---

# 41. LOADING STATES

Use:

- skeletons where structure is known,
- subtle progress states,
- optimistic interaction where safe.

Avoid full-screen spinners for ordinary page transitions.

Do not add artificial delays just to show animation.

---

# 42. MOTION SYSTEM

The interface must follow the Apple-design principles from the required skill.

Create shared motion tokens.

Example conceptual tokens:

```ts
export const motion = {
  press: {
    scale: 0.98
  },
  spring: {
    type: "spring",
    bounce: 0,
    duration: 0.4
  },
  sheet: {
    type: "spring",
    bounce: 0.18,
    duration: 0.32
  }
}
```

Exact API depends on Motion version.

Requirements:

- press feedback begins instantly,
- navigation transitions are subtle,
- popovers originate near triggers,
- sheets return toward their source,
- moving elements remain interruptible,
- no arbitrary 800ms animations,
- no slow page fade everywhere,
- no gratuitous parallax,
- no constant ambient motion,
- no looping decorative animation.

---

# 43. MATERIALS / TRANSLUCENCY

Use translucent material sparingly.

Good candidates:

- sidebar,
- floating toolbar,
- popover,
- command palette,
- modal/sheet,
- sticky header when content moves underneath.

Bad candidates:

- every project row,
- every card,
- every button,
- tables,
- giant page backgrounds.

Translucency should communicate elevation/hierarchy.

---

# 44. BUTTONS

Button hierarchy:

## Primary

Use Arcellite brand accent.

Examples:

- Deploy
- New Project
- Continue
- Add Domain

## Secondary

Neutral elevated / subtle.

## Ghost

Navigation / low priority.

## Destructive

Reserved for destructive operations.

Interactions:

- immediate active feedback,
- visible keyboard focus,
- disabled state,
- loading state,
- icon alignment,
- no exaggerated pill buttons everywhere.

---

# 45. FORMS

Inputs must feel premium and readable.

Requirements:

- labels above inputs where appropriate,
- help text only when useful,
- clear focus rings,
- error state near field,
- no placeholders acting as labels,
- copy controls for generated values,
- password/secret visibility controls,
- keyboard accessible.

Environment variable editor deserves special care.

---

# 46. TABLES / DATA LISTS

Infrastructure software contains dense information.

Do not force everything into cards.

Use good data lists/tables where appropriate.

Required behaviors:

- row hover,
- sortable columns where useful,
- status,
- keyboard focus,
- truncation with tooltip,
- responsive priority,
- row action menu,
- compact but not cramped spacing.

---

# 47. STATUS SYSTEM

Create one shared status component.

Deployment:

- Ready
- Building
- Queued
- Failed
- Canceled
- Stopped

Server:

- Online
- Degraded
- Offline

Container:

- Running
- Starting
- Stopped
- Exited

Domain:

- Active
- Pending
- Invalid

Do not invent separate badge styles on every screen.

---

# 48. ICONOGRAPHY

Use Lucide consistently for interface actions.

Official service logos can be used for:

- GitHub,
- Docker,
- PostgreSQL,
- MySQL,
- Redis,
- frameworks,

when their actual identity helps recognition.

Do not use random emoji as core interface icons.

Do not duplicate the same icon for unrelated navigation items.

---

# 49. TYPOGRAPHY

Use a modern system-first typography strategy.

Prefer the existing Arcellite website typography if it can be identified.

Otherwise use a high-quality system / sans-serif fallback that integrates cleanly with Next.js.

Typography rules:

- large page headings: tight tracking,
- UI text: highly readable,
- body line height: comfortable,
- small metadata: not too faint,
- status labels: medium weight,
- code/commit IDs/logs: monospace.

Do not use monospace for the entire product.

---

# 50. RESPONSIVENESS

Primary target:

- desktop,
- laptop,
- tablet.

The product is infrastructure management software, so desktop is the first-class environment.

Still provide reasonable mobile support.

Desktop:
- fixed/collapsible sidebar,
- spacious content area.

Tablet:
- compact sidebar or overlay.

Mobile:
- drawer navigation,
- stacked layouts,
- simplified tables,
- actions remain accessible.

Do not simply shrink desktop tables until they overflow everywhere.

---

# 51. ACCESSIBILITY

Required:

- semantic HTML,
- proper labels,
- keyboard navigation,
- focus-visible states,
- ARIA where needed,
- correct dialog behavior,
- correct menu behavior,
- color is never the only status signal,
- sufficient contrast,
- reduced-motion handling,
- reasonable hit targets.

Support:

```css
@media (prefers-reduced-motion: reduce)
```

Also design for reduced transparency/contrast preferences where browser support allows.

---

# 52. MOCK DATA

Create realistic deterministic fixtures.

Suggested entities:

## Workspace

`Arcellite Lab`

## User

`Robera`

## Server

`home-server`

- Ubuntu 24.04 LTS
- x86_64
- IP: `192.168.1.50`
- 16 GB memory
- 512 GB storage
- healthy

## Projects

### Arciin

- Next.js
- production
- ready
- GitHub
- branch: main
- port: 8082

### MODVRA Studio

- Next.js
- production
- ready
- GitHub
- branch: main
- port: 8083

### API Sandbox

- FastAPI
- development
- building
- upload
- port: 8084

Do not use lorem ipsum.

Write meaningful infrastructure copy.

---

# 53. TYPES

Create strong TypeScript domain models.

At minimum:

```ts
type Project
type Deployment
type DeploymentStep
type Server
type ServerMetrics
type Container
type Domain
type Volume
type DatabaseService
type EnvironmentVariable
type ActivityEvent
type LogEntry
type GitRepository
type Framework
```

Keep UI presentation types separate when necessary.

---

# 54. ROUTE STRUCTURE

Recommended App Router structure:

```text
src/app/
  (dashboard)/
    layout.tsx

    page.tsx

    projects/
      page.tsx
      new/
        page.tsx
      [projectId]/
        page.tsx
        deployments/
          page.tsx
        logs/
          page.tsx
        environment/
          page.tsx
        domains/
          page.tsx
        settings/
          page.tsx

    deployments/
      page.tsx
      [deploymentId]/
        page.tsx

    servers/
      page.tsx
      [serverId]/
        page.tsx

    containers/
      page.tsx

    domains/
      page.tsx

    storage/
      page.tsx

    databases/
      page.tsx

    activity/
      page.tsx

    logs/
      page.tsx

    metrics/
      page.tsx

    settings/
      page.tsx
```

Adjust if a cleaner Next.js structure is warranted.

---

# 55. COMPONENT ARCHITECTURE

Suggested organization:

```text
src/components/
  app-shell/
  navigation/
  projects/
  deployments/
  servers/
  containers/
  domains/
  storage/
  databases/
  logs/
  metrics/
  activity/
  settings/
  ui/
```

Do not put the entire dashboard into one 2,000-line component.

Do not prematurely abstract every 10-line fragment either.

Favor meaningful product components.

---

# 56. DESIGN TOKENS

Create centralized tokens.

Suggested file:

```text
src/styles/tokens.css
```

or equivalent Tailwind theme configuration.

Token categories:

- brand,
- surfaces,
- text,
- borders,
- status,
- radius,
- shadow,
- spacing,
- typography,
- motion.

Use semantic naming.

---

# 57. RADIUS

Do not use extreme rounding everywhere.

Suggested visual hierarchy:

- small controls: modest radius,
- buttons: medium radius,
- panels: medium radius,
- sheets/modal: slightly larger,
- pills only for actual pill-like elements.

Avoid 24-32px rounding on every rectangular surface.

---

# 58. SHADOWS

Keep shadows soft and contextual.

Dark theme often needs less shadow and more surface separation.

Do not add drop shadows to every row/card.

---

# 59. PAGE TRANSITIONS

Page navigation should feel immediate.

Do not block navigation while animation plays.

Use subtle shared-layout or short opacity/position cues only when they clarify continuity.

The app should never feel slower because motion exists.

---

# 60. PROJECT ACTION MENU

Project actions can include:

- Open
- Redeploy
- View Logs
- Copy Endpoint
- Settings
- Delete

Delete is separated visually and requires confirmation.

---

# 61. SERVER ACTIONS

Phase 1 mock:

- Refresh status
- View containers
- View logs
- Restart agent
- Disconnect server

Restart/disconnect require confirmation.

---

# 62. ONBOARDING

Create a short first-run experience.

Do not create a 7-step marketing slideshow.

Recommended:

## Step 1

Welcome to Arcellite Deploy.

## Step 2

Deployment destination:

- This server
- Connect another server — disabled / Coming Later

## Step 3

Deploy first application.

- GitHub
- Upload

Allow skip.

Persist completion locally.

---

# 63. DEMO MODE

Since Phase 1 has no real deployment engine, clearly structure a demo/mock provider.

Do not plaster "FAKE DATA" across the UI.

For developer builds, a small optional indicator can say:

`Demo infrastructure`

or

`Mock provider`

in Settings/Developer mode.

---

# 64. DATA PERSISTENCE IN PHASE 1

For interactive UI state, use:

- localStorage,
- mock in-memory store,
- or lightweight client persistence.

Do not introduce PostgreSQL solely for fake frontend data.

The domain layer must make migration to API-backed state straightforward.

---

# 65. WHAT MUST ACTUALLY WORK IN PHASE 1

This cannot be static screenshots.

The following interactions must work:

- navigation,
- theme selection,
- sidebar collapse,
- command palette,
- project filtering,
- project search,
- New Project flow,
- repository selection,
- upload interaction,
- framework analysis simulation,
- deployment configuration,
- environment variable add/edit/delete,
- mock deployment execution,
- deployment progress,
- cancel deployment,
- redeploy,
- deployment filtering,
- project tabs,
- log search/filter/follow,
- server selection,
- container actions mock,
- domain add flow,
- domain verification simulation,
- settings persistence,
- copy-to-clipboard actions,
- confirmation dialogs,
- toasts,
- responsive navigation.

If a control is visible and implies an action, it should work unless clearly marked future/disabled.

---

# 66. DEPLOYMENT MOCK ENGINE

Implement a simple mock deployment state machine.

Example:

```text
queued
  ↓
preparing
  ↓
installing
  ↓
building
  ↓
creating-image
  ↓
starting
  ↓
health-check
  ↓
ready
```

Allow deterministic failure demo if useful.

Do not use random failures during normal operation.

One example demo project may expose a controlled "Simulate failure" action for testing.

---

# 67. LOG SIMULATION

When a mock deployment runs, generate realistic stage logs.

Example:

```text
14:31:02  Cloning repository...
14:31:04  Resolved commit 8f34a91
14:31:05  Detected pnpm 10
14:31:05  Installing dependencies...
14:31:12  Running pnpm build
14:31:28  Creating runtime image
14:31:34  Starting service on port 3000
14:31:36  Health check passed
14:31:36  Deployment ready
```

Do not dump hundreds of fake lines.

---

# 68. LOCAL ENDPOINT UX

This product is intended to be useful in a home lab.

Local endpoint presentation is important.

Examples:

```text
http://192.168.1.50:8082
```

Possible future local hostname:

```text
http://arciin.local
```

UI actions:

- copy,
- open,
- configure domain.

Explain local/public status clearly.

---

# 69. FUTURE CUSTOM DOMAIN UX

Prepare UI language for a future Caddy integration.

Do not imply HTTPS is actually provisioned in Phase 1.

Mock statuses:

- DNS required,
- verifying,
- issuing certificate,
- active.

---

# 70. FUTURE GITHUB INTEGRATION UX

The future real implementation should use a GitHub App.

Phase 1 can simulate:

- connected account,
- selected repositories,
- installation scope,
- repository picker.

Do not design future production GitHub integration around a user pasting a permanent personal access token.

---

# 71. FUTURE BUILD SOURCES

Architect UI to support:

- GitHub
- Git URL
- Upload
- Docker image
- Dockerfile
- Docker Compose

GitLab and Bitbucket can come later.

Do not build all integrations in Phase 1.

---

# 72. FUTURE FRAMEWORK BUILD ENGINE

Future target:

```text
If Dockerfile exists:
  use Dockerfile

Else if Compose exists:
  use Compose

Else:
  analyze project
  use Nixpacks / detection
  produce image
```

Phase 1 only models this logic.

---

# 73. FUTURE SECURITY PRINCIPLES

The architecture must eventually support:

- authenticated server agents,
- scoped permissions,
- encrypted secrets,
- no public unauthenticated Docker API,
- audit logging,
- CSRF protection where relevant,
- rate limiting,
- secure session management,
- secret redaction in logs.

Do not expose `/var/run/docker.sock` directly to the browser.

Do not create frontend code that assumes the browser can call Docker directly.

---

# 74. PRODUCT LANGUAGE

Use concise technical copy.

Good:

`Deployment ready`

`Waiting for DNS verification`

`Server unavailable`

`3 containers are running`

Bad:

`Awesome! Your magical deployment has blasted off 🚀🚀🚀`

Avoid excessive exclamation points.

Avoid corporate buzzword overload.

Avoid generic AI copy.

---

# 75. PRODUCT PRINCIPLES

## 75.1 Hide complexity first

A beginner should be able to deploy without understanding Docker.

## 75.2 Reveal complexity when requested

Advanced users should still reach:

- build commands,
- ports,
- environment,
- resource settings,
- logs,
- runtime information.

## 75.3 Infrastructure should feel understandable

Never intentionally make the product feel like an enterprise cloud console.

## 75.4 Actions must have visible consequences

After deploying, show:

- what was created,
- where it runs,
- how to reach it,
- whether it is healthy.

---

# 76. PERFORMANCE

Target:

- fast initial render,
- minimal unnecessary client components,
- dynamic import where justified,
- avoid huge dependency bundles,
- avoid animating layout-heavy CSS properties,
- use transform/opacity for motion,
- optimize icon usage,
- no unnecessary background timers.

---

# 77. NEXT.JS IMPLEMENTATION RULES

Prefer server components for static/read-heavy page structure.

Use client components only where interactivity requires them.

Do not turn the entire app into `"use client"`.

Keep mock data access behind provider/repository functions.

Use route-level loading/error boundaries where meaningful.

---

# 78. CODE QUALITY

Required:

- TypeScript strict mode,
- no `any` unless documented and unavoidable,
- clear naming,
- no dead code,
- no giant files,
- no duplicate data models,
- no duplicate status maps,
- no duplicate theme definitions,
- format/lint scripts,
- clean console.

---

# 79. TESTING

At minimum:

- component/unit tests for meaningful state logic,
- deployment state machine tests,
- utility tests,
- basic smoke coverage for critical routes.

If Playwright is included:

cover:

1. app opens,
2. create project from mock GitHub,
3. configure deployment,
4. deploy,
5. deployment reaches Ready,
6. project appears in Projects,
7. endpoint can be copied.

Do not spend Phase 1 creating hundreds of low-value tests.

---

# 80. README

Create a clean project README.

Include:

- what Arcellite Deploy is,
- Phase 1 status,
- setup,
- install,
- run,
- lint,
- test,
- architecture,
- mock provider explanation,
- future infrastructure direction.

Do not claim real Docker deployment works yet.

---

# 81. ENVIRONMENT FILE

If env variables are needed, create:

`.env.example`

Never commit secrets.

Phase 1 should require as little setup as possible.

---

# 82. INSTALLATION

The expected local development experience should ideally be:

```bash
cd ~/project/Arcellite

pnpm install

pnpm dev
```

Then open the displayed localhost URL.

---

# 83. FIRST IMPLEMENTATION ORDER

Follow this order unless repository conditions justify a change.

## Stage 1 — Foundation

- initialize Next.js app
- TypeScript strict
- Tailwind
- theme tokens
- app layout
- official Arcellite brand integration
- icons
- motion utilities

## Stage 2 — Navigation

- sidebar
- contextual header
- mobile navigation
- command palette

## Stage 3 — Domain model

- TypeScript entities
- mock provider
- deterministic fixture data
- local persistence layer

## Stage 4 — Overview

- infrastructure summary
- recent projects
- server state
- activity

## Stage 5 — Projects

- projects list
- search/filter
- project detail

## Stage 6 — Deployment flow

- new project
- GitHub mock
- upload
- analysis
- configure
- deploy
- progress/logs

## Stage 7 — Infrastructure

- servers
- containers
- domains
- storage
- databases

## Stage 8 — Observability

- activity
- logs
- metrics

## Stage 9 — Settings

- theme
- GitHub mock
- deployment defaults
- advanced

## Stage 10 — Polish

- accessibility
- responsive behavior
- reduced motion
- transitions
- empty/loading/error states
- tests
- lint
- README

---

# 84. DO NOT BUILD YET

Do NOT implement real:

- Docker control,
- Docker socket access,
- SSH server management,
- Caddy changes,
- public DNS changes,
- SSL issuance,
- GitHub OAuth/App credentials,
- server agent,
- production authentication,
- PostgreSQL,
- billing,
- team permissions,
- Kubernetes,
- multi-node scheduler,
- real build infrastructure.

Phase 1 prepares for these.

It does not prematurely implement them.

---

# 85. FUTURE PHASES

## Phase 2

Single-server real deployment engine.

- Go agent
- Docker
- actual logs
- actual server metrics
- real project build
- local endpoint allocation

## Phase 3

Domains and data services.

- Caddy
- HTTPS
- DNS guidance
- PostgreSQL/MySQL/Redis service deployment
- volumes
- backups

## Phase 4

Git integration.

- GitHub App
- webhooks
- commit deployments
- preview environments

## Phase 5

Multi-server.

- nodes
- remote agents
- scheduling
- placement
- HA concepts

Do not implement these during this task.

---

# 86. DESIGN REVIEW CHECKLIST

Before declaring Phase 1 finished, manually inspect every major route.

Ask:

- Does this look like Arcellite?
- Is the current Arcellite logo used correctly?
- Is the current Arcellite brand color used correctly?
- Are there unnecessary gradients?
- Are there unnecessary cards?
- Is every icon meaningful?
- Are there duplicate navigation icons?
- Is spacing consistent?
- Is typography deliberate?
- Is dark mode truly designed?
- Does every visible action work?
- Are transitions interruptible/fast?
- Are panels spatially anchored?
- Does reduced motion work?
- Can keyboard users operate dialogs/menus?
- Does this feel like deployment software rather than a finance dashboard?
- Can a beginner understand where an application will run?
- Can an advanced user inspect ports/build/runtime information?
- Does the mock provider clearly separate UI from future infrastructure code?

If not, improve it.

---

# 87. VISUAL QUALITY BAR

The first screenshot of the dashboard should be good enough that the product could appear on the Arcellite homepage without looking like a different company created it.

The New Project flow should be one of the best-looking screens.

The Deployment Progress experience should be one of the best-interacting screens.

The Project Detail page should feel mature enough for daily use.

The server pages must not resemble a generic hosting-panel template.

---

# 88. CRITICAL ANTI-PATTERNS

Do not do any of the following:

- Copy the Vercel dashboard pixel-for-pixel.
- Use a random new logo.
- Guess an unrelated brand color.
- Use default shadcn visuals everywhere.
- Use gradients on every button.
- Use glowing neon borders.
- Add AI imagery.
- Add 3D decorative server art.
- Fill the overview with eight KPI cards.
- Use huge rounded cards for every row.
- Make every surface glass.
- Use excessive blur.
- Use excessive animations.
- use slow transitions.
- hide useful technical information.
- expose Docker implementation directly in the UI.
- create a separate mobile app.
- implement real infrastructure in Phase 1.
- leave visible buttons nonfunctional without explanation.
- use random generated names when meaningful mock project names exist.
- overuse emojis.
- show fake production security claims.

---

# 89. DEFINITION OF DONE

Phase 1 is complete when:

1. The app runs locally successfully.
2. The UI clearly uses the Arcellite identity.
3. Light/dark/system themes work.
4. Sidebar and command palette work.
5. Overview is complete.
6. Projects list and project detail work.
7. New Project workflow works from start to finish using mock data.
8. GitHub repository selection is simulated convincingly.
9. Upload flow works visually/interactively.
10. Framework detection is simulated.
11. Deployment configuration works.
12. Environment variables can be edited.
13. Deployment progress and logs work.
14. Projects/deployments persist locally enough to survive normal navigation and preferably reload.
15. Server pages work with realistic mock data.
16. Container pages work with mock actions.
17. Domain workflow works as simulation.
18. Storage and database pages are implemented.
19. Activity, logs and metrics are implemented.
20. Settings work.
21. Main actions have loading/error/success states.
22. Responsive behavior is usable.
23. Keyboard accessibility is good.
24. Reduced-motion behavior exists.
25. Lint passes.
26. Type checking passes.
27. Tests for core logic pass.
28. README accurately describes the implementation.
29. There are no obvious broken links or dead buttons.
30. The codebase is structured so the mock provider can later be replaced by the real deployment backend.

---

# 90. FINAL DELIVERY INSTRUCTIONS FOR THE CODING AGENT

Do not simply explain how you would build this.

Build it.

Do not stop after scaffolding.

Do not create one dashboard page and declare the product finished.

Work through the specification systematically.

When there is an implementation tradeoff, prefer:

1. clarity,
2. maintainability,
3. excellent user experience,
4. architecture that supports the future deployment backend.

At the end:

- run lint,
- run typecheck,
- run tests,
- run a production build,
- fix errors,
- inspect important routes,
- report what was completed,
- report any intentionally deferred pieces,
- report how to launch the application.

---

# 91. SHORT PRODUCT SUMMARY FOR INTERNAL REFERENCE

**Arcellite Deploy is a self-hosted deployment control plane that makes deploying software to your own server feel as simple as a modern cloud platform without hiding ownership of the infrastructure.**

Phase 1 builds the product experience.

Future phases connect that experience to Docker, a Go agent, GitHub, Caddy, databases, domains and real server telemetry.

---

# 92. SOURCE-OF-TRUTH PRIORITY

If instructions conflict, use this priority:

1. This master specification.
2. The current live Arcellite brand at `arcellite.com`.
3. The referenced Apple Design skill for interaction and motion.
4. Existing repository conventions when they do not conflict with the above.
5. General framework best practices.

Never sacrifice the Arcellite identity to imitate another hosting product.

---

# 93. START

Inspect the repository first.

If it is empty, initialize the application cleanly in the existing `~/project/Arcellite` folder.

Do not create an unnecessary nested repository such as:

`~/project/Arcellite/arcellite-deploy/arcellite-deploy`

Keep the repository root clean.

Then begin with:

- brand foundation,
- design tokens,
- application shell,
- deployment domain models,
- mock provider,

and continue through the implementation stages in this document.

**Build Arcellite Deploy.**
