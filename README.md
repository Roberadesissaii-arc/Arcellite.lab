# Arcellite Deploy

Arcellite Deploy is a self-hosted deployment control plane. It is meant to make deploying software to a server you control feel as direct as a modern cloud platform, without giving up that server.

This repository is **Phase 1**: the product UI, the deployment domain model, and a realistic mock provider. It does not talk to Docker, Caddy, GitHub, or a real server agent.

## Phase 1 status

You can navigate the whole control plane with lab data for the Arcellite workspace:

- overview, projects, and project detail
- local project chat for scoped deployment, container, server, and domain summaries
- new project from mock GitHub, upload, a Git URL, an image, or Compose
- framework analysis and deployment configuration
- a deterministic deployment that moves through build stages, logs, cancel, and redeploy
- servers, containers, domains, storage, and databases
- activity, logs, and metrics
- settings that persist in the browser, including motion preferences

Created projects and deployments survive reloads. The first visit shows a short welcome. Skip it if you want to go straight to the lab.

## Setup

```bash
cd ~/project/Arcellite
pnpm install
pnpm dev
```

Open the localhost URL printed by Next.js.

No environment variables are required. See `.env.example`.

## Scripts

```bash
pnpm dev        # local app
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest
pnpm build      # production build
pnpm start      # serve the production build
```

## Architecture

```text
Browser
  Next.js control plane
    DeployProvider
      mock provider now
      server provider later
```

Domain types, the deployment state machine, and fixture data live in `src/lib/deploy`. The UI reads a snapshot and calls the provider. Replacing `mock-provider.ts` with a provider that talks to a Go agent should not require a new interface.

The mock engine advances a deployment through queued, preparing, installing, building, image creation, start, and health check on a fixed timeline. Failures happen only when a project is marked to simulate a failed build. API Sandbox exposes that control. Developer mode in Settings exposes it on every project.

## Visual system

The shell always pairs a near-black sidebar with a white workspace. Sidebar tokens are scoped independently from workspace and overlay tokens in src/styles/tokens.css. Legacy theme preferences and the operating system cannot switch the workspace to dark mode. The sidebar persists its expanded (256px) or collapsed (48px) state.

## Brand

The mark and the primary color `#5D5FEF` come from the live Arcellite site. The cloud glyph in the sidebar is the same path used on arcellite.com and in `public/brand/arcellite-mark.svg`. Do not replace it with a new logo.

## What this build does not do

Phase 1 does not implement Docker control, SSH, Caddy, public DNS, certificate issuance, GitHub OAuth, a server agent, production authentication, or a database for the control plane. Domain verification and TLS states are simulated and labeled as such.

Later phases are expected to add a single-server Go agent, real builds, Caddy and domains, a GitHub App, and then more than one server.
