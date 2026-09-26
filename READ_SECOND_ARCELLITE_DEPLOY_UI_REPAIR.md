# READ_SECOND_ARCELLITE_DEPLOY_UI_REPAIR.md

> **ARCELLITE DEPLOY — VISUAL SYSTEM REPAIR / UI REFACTOR**
>
> This document is a corrective specification.
>
> It does **not** replace the product architecture in `READ_FIRST_ARCELLITE_DEPLOY.md`.
> It overrides the visual/theme/shell instructions wherever the first document is ambiguous or conflicts with this file.
>
> The purpose of this pass is to repair the current Phase 1 UI without destroying the functionality already implemented.

---

# 0. STOP BEFORE EDITING

The application is already functionally implemented.

Do **not** rebuild Phase 1 from scratch.

Do **not** rewrite the mock deployment system.

Do **not** remove working routes.

Do **not** replace the deployment state machine.

Do **not** throw away working search, filters, project creation, deployment progress, logs, settings, domains, container actions, local persistence, command palette, or other functionality.

This task is primarily:

1. shell redesign,
2. theme correction,
3. sidebar redesign,
4. hierarchy correction,
5. spacing correction,
6. interaction-state correction,
7. visual polish,
8. consistent deployment-specific page presentation.

The current application should be treated as a functioning product whose **visual system needs surgery**.

---

# 1. THE REFERENCE IS NOW EXPLICIT

There are two visual references for this repair.

## Reference A — user-provided Arciin screenshot

The approved reference is the Arciin dashboard screenshot provided by the user.

Its key visual properties are:

- black/dark sidebar,
- white application workspace,
- high contrast between navigation and content,
- compact sidebar,
- beautiful logo/brand treatment at the upper left,
- subtle navigation highlighting,
- distinct navigation sections,
- dense but readable information,
- floating top controls,
- clean white canvas,
- thin neutral borders,
- deliberate spacing,
- restrained accent color,
- clear active/inactive states,
- footer/profile section anchored to the bottom,
- no giant decorative dark panels,
- no full-page dark dashboard,
- no generic "admin template" appearance.

## Reference B — existing Arciin GitHub implementation

Study this repository before making visual changes:

`Roberadesissaii-arc/arciin`

The following files are especially important:

```text
apps/web/app/globals.css

apps/web/components/app-shell/app-sidebar.tsx
apps/web/components/app-shell/dashboard-shell.tsx
apps/web/components/app-shell/dashboard-header.tsx
apps/web/components/app-shell/dashboard-content-area.tsx

apps/web/components/ui/sidebar.tsx

apps/web/lib/dashboard-card-styles.ts
apps/web/lib/dashboard-table-styles.ts
```

You are explicitly permitted and instructed to study the implementation patterns in those files.

Do not copy Arciin product content.

Do not rename Arcellite Deploy into Arciin.

Do not use the Arciin orange accent.

Do use the **layout grammar, interaction grammar, density, and shell behavior** as a reference.

---

# 2. MOST IMPORTANT OVERRIDE

## ARCELLITE DEPLOY IS A SPLIT-SHELL APPLICATION

This is the visual rule that was previously underspecified.

The primary desktop application MUST look like:

```text
┌──────────────────────┬──────────────────────────────────────────────┐
│                      │                                              │
│      DARK SIDEBAR    │            WHITE WORKSPACE                  │
│                      │                                              │
│      #09090B-ish     │            #FFFFFF                          │
│                      │                                              │
│      white/gray      │            black/dark text                  │
│      navigation      │            neutral borders                  │
│                      │                                              │
│                      │                                              │
└──────────────────────┴──────────────────────────────────────────────┘
```

This is not optional.

This is not "dark mode."

This is not "light mode."

This is the **core visual identity of the app shell**.

---

# 3. DO NOT TURN THE MAIN DASHBOARD DARK

The sidebar remains dark.

The main application workspace remains light.

For this repair pass:

## Required desktop shell

```text
Sidebar:
#09090B / near-black

Main workspace:
#FFFFFF

Main text:
#09090B / near-black

Main neutral secondary text:
zinc-500 / zinc-600 family

Main borders:
zinc-200 family

Main muted surfaces:
zinc-50 / zinc-100 family
```

Do not make the workspace black when the OS is in dark mode.

Do not apply `.dark` globally and accidentally change the workspace.

Do not make the server cards black.

Do not make all project panels black.

Do not surround the entire white page with dark surfaces.

---

# 4. THEME BEHAVIOR FOR THIS PASS

The existing app currently supports light/dark/system themes.

For this visual repair, the approved appearance is the split shell:

- dark sidebar,
- light workspace.

If existing theme infrastructure is deeply integrated, it can remain internally.

However:

### The visible application MUST NOT switch the whole workspace to dark.

Either:

1. temporarily remove the theme selector from Settings,
2. change it to an experimental/future setting,
3. or make all current theme choices preserve the dark-sidebar/light-workspace shell.

Do not let a stored `dark` class override the approved shell.

A future full dark workspace may be designed separately.

It is not part of this repair.

---

# 5. ARCELLITE BRAND — DO NOT COPY ARCIIIN BRAND

The shell behavior comes from Arciin.

The brand comes from Arcellite.

Use:

- official Arcellite logo/mark,
- official Arcellite wordmark treatment,
- current Arcellite brand accent,
- product label `Deploy`.

The current implementation already has:

```text
public/brand/arcellite-mark.svg
public/favicon.svg
```

Inspect existing Arcellite assets before replacing anything.

Do not use the Arciin logo.

Do not use Arciin orange.

Do not redraw the Arcellite logo.

---

# 6. ARCELLITE DEPLOY BRAND LOCKUP

The upper-left sidebar brand treatment should read visually like:

```text
[Arcellite mark] Arcellite.  Deploy
```

or the exact approved Arcellite wordmark asset plus:

```text
Deploy
```

`Deploy` must be visually secondary.

Example hierarchy:

```text
Arcellite.    Deploy
^^^^^^^^^     ^^^^^^
primary       muted / smaller
```

The product word must not compete with the brand.

Do not put the name inside a giant card.

Do not create a huge header.

Do not center the logo.

Keep it compact, left aligned, and premium.

---

# 7. SIDEBAR DIMENSIONS

Use the Arciin implementation as the proportional baseline.

## Expanded desktop sidebar

Target:

```text
16rem
256px
```

Acceptable range only when needed for current content:

```text
248px – 264px
```

Do not make it 300–340px.

## Collapsed desktop sidebar

Target:

```text
3rem
48px
```

A slightly larger 52–56px rail is acceptable only if the Arcellite mark requires it.

## Mobile sidebar

Target:

```text
18rem
288px
```

Mobile uses a sheet/drawer.

---

# 8. SIDEBAR SURFACE

Primary sidebar:

```css
background: #09090b;
color: white;
```

or an equivalent neutral near-black.

Do not use blue-black.

Do not use purple-black.

Do not tint the entire sidebar with the Arcellite accent.

The accent should be special.

The black sidebar is the anchor.

---

# 9. SIDEBAR DIVIDERS

Use subtle separators.

Reference value from Arciin:

```css
rgba(255, 255, 255, 0.06)
```

Approximate token:

```css
--sidebar-divider: rgba(255,255,255,0.06);
```

Dividers should be almost invisible until you look for them.

Do not use strong gray horizontal rules.

Do not use bright purple divider lines.

---

# 10. SIDEBAR TEXT COLORS

Follow the same hierarchy as the reference.

Suggested:

```css
--sidebar-text-active: rgba(255,255,255,0.95);
--sidebar-text-default: rgba(255,255,255,0.50);
--sidebar-section-text: rgba(255,255,255,0.30);
--sidebar-count-text: rgba(255,255,255,0.45);
```

The sidebar should not have every label bright white.

That destroys hierarchy.

---

# 11. NAVIGATION FONT SIZE

Primary navigation rows:

```text
13px
font-medium
```

Do not use oversized 15–16px sidebar labels.

Section headings:

```text
10–11px
font-semibold
uppercase
tracking wider
```

Metadata/counters:

```text
10–11px
```

---

# 12. SIDEBAR ICON SIZE

Use compact Lucide icons.

Reference baseline:

```text
15px
```

Acceptable:

```text
15px – 16px
```

Do not use 20–24px nav icons.

Do not put every icon inside a colored square.

Icons sit naturally next to labels.

---

# 13. SIDEBAR NAV ROWS

Use compact rows.

Reference behavior:

```text
rounded-lg
px-3
py-2
13px
gap ~10px
```

The item should feel like one continuous row.

Do not create individual bordered buttons for every route.

Do not create large pills.

Do not give each item a visible permanent card background.

---

# 14. SIDEBAR ACTIVE STATE

The existing Arcellite Deploy active state is too loud / template-like.

Use the Arciin interaction principle.

Active state:

```css
background: rgba(255,255,255,0.08);
color: rgba(255,255,255,0.95);
```

Hover state when inactive:

```css
background: rgba(255,255,255,0.04);
color: rgba(255,255,255,0.95);
```

Default:

```css
background: transparent;
color: rgba(255,255,255,0.50);
```

The Arcellite accent should **not** create a thick glowing outline around the active route.

Do not draw the currently selected nav item as:

```text
bright purple 2px border
purple glow
large outline
```

That is one of the visual problems in the current screenshot.

The selection should be subtle and confident.

---

# 15. OPTIONAL ARCELLITE ACTIVE ACCENT

If a brand cue is desired, it may be extremely restrained.

Allowed examples:

- a tiny 2px accent dot,
- a 2px short accent stroke,
- an accent icon on one special CTA,
- accent focus ring for keyboard state.

Do NOT surround the active nav row in a bright brand-colored border.

---

# 16. SIDEBAR STRUCTURE

For Arcellite Deploy, use this organization:

```text
[Arcellite mark] Arcellite. Deploy

Overview
Projects
Deployments

────────────────

INFRASTRUCTURE

Servers
Containers
Domains
Storage
Databases

────────────────

OBSERVE

Activity
Logs
Metrics
Alerts

────────────────

Docs
Settings
Notifications

[Profile / Workspace Card]

version                    Collapse
```

The exact placement may be refined, but the visual grouping must be obvious.

---

# 17. NAVIGATION ORDER

Recommended final order:

## Primary

```text
Overview
Projects
Deployments
```

## Infrastructure

```text
Servers
Containers
Domains
Storage
Databases
```

## Observe

```text
Activity
Logs
Metrics
Alerts
```

## Bottom

```text
Docs
Settings
Notifications
```

Do not mix `Servers` between `Projects` and `Deployments`.

Do not create arbitrary navigation order.

Do not duplicate concepts.

---

# 18. SIDEBAR SECTION LABELS

Section labels should behave like Arciin.

For example:

```text
INFRASTRUCTURE
OBSERVE
```

Use:

```text
11px
uppercase
font-semibold
wide tracking
rgba(255,255,255,0.30)
```

Do not make section labels large.

Do not make them bright white.

Optional tiny icon is acceptable, but the label should remain quiet.

---

# 19. SIDEBAR COUNTERS

Counters such as:

```text
Containers  7
Domains     3
Databases   3
```

should use subtle dark-on-dark count chips.

Suggested:

```css
background: rgba(255,255,255,0.07);
color: rgba(255,255,255,0.45);
```

Do not use saturated purple badges for normal resource counts.

---

# 20. SIDEBAR BRAND AREA

Top brand area should have:

```text
height: approximately 56px
horizontal padding: 16px
bottom border: sidebar divider
```

Keep the logo and words on one horizontal line whenever possible.

The product label can be smaller/muted.

Do not increase the top area dramatically.

---

# 21. SIDEBAR FOOTER

The footer must feel intentional.

It should remain anchored visually to the bottom.

Structure:

```text
Docs
Settings
Notifications

[ user/workspace card ]

v0.1.0                   Collapse
```

The sidebar footer should be separated from main navigation by a subtle border.

Do not let the profile float awkwardly in the middle of the rail.

---

# 22. PROFILE / WORKSPACE CARD

Use the Arciin reference.

Target feel:

```text
[avatar]  Robera
          Arcellite Lab       ⌄
```

Background:

```css
rgba(255,255,255,0.03)
```

Border:

```css
rgba(255,255,255,0.06)
```

Hover:

```css
rgba(255,255,255,0.06)
```

Rounded but not excessively.

A small green online/status dot is acceptable.

Do not use a bright purple profile card.

---

# 23. SIDEBAR COLLAPSE STATE MUST BE REAL

The user specifically complained about state/behavior.

The sidebar must have:

```ts
state: "expanded" | "collapsed"
```

It must visibly and functionally change.

Expanded:

```text
256px
icons + labels + sections + counts
```

Collapsed:

```text
48px
icons only
tooltips on hover
brand becomes mark only
section labels disappear
profile becomes avatar only
collapse control becomes expand control
```

Persist the state.

Use cookie or localStorage.

Do not fake collapse by simply hiding text while retaining the full width.

---

# 24. SIDEBAR COLLAPSE MOTION

The collapse should be:

- quick,
- smooth,
- interruptible,
- not bouncy,
- not sluggish.

Target duration:

```text
180ms – 220ms
```

Animate width and any required padding/label opacity.

Avoid large spring bounce on the navigation rail.

The content workspace must expand into the freed space.

---

# 25. SIDEBAR TOOLTIPS

When collapsed:

- every nav icon gets a tooltip,
- tooltip opens immediately or almost immediately,
- tooltip appears to the right,
- dark tooltip surface,
- no huge tooltip card,
- label only, perhaps small shortcut/secondary text.

---

# 26. MOBILE SIDEBAR

Desktop shell is first priority.

On mobile/tablet:

- use a sheet/drawer,
- keep the sidebar dark,
- keep nav appearance consistent,
- do not try to squeeze the desktop rail into 320px width,
- closing a route should close the drawer.

---

# 27. MAIN WORKSPACE

The main workspace is a white canvas.

Hard requirement:

```css
background: #ffffff;
color: #09090b;
```

It must stay white regardless of root/body dark variables.

The white workspace should own its own scoped semantic tokens.

Use a class such as:

```text
.deploy-main
```

or:

```text
.dashboard-main
```

Do not rely on inherited root theme variables.

---

# 28. USE SCOPED MAIN-WORKSPACE TOKENS

Implement something conceptually like:

```css
:root {
  --sidebar: #09090b;
  --sidebar-foreground: #ffffff;
}

.deploy-main {
  --background: #ffffff;
  --foreground: #09090b;

  --card: #ffffff;
  --card-foreground: #09090b;

  --popover: #ffffff;
  --popover-foreground: #09090b;

  --muted: #f4f4f5;
  --muted-foreground: #52525b;

  --border: #e4e4e7;
  --input: #e4e4e7;

  background: #ffffff;
  color: #09090b;
}
```

This separation is critical.

---

# 29. FORCE THE SHELL CANVAS WHITE

The shell around the workspace should not leak root dark colors.

Conceptually:

```css
.deploy-shell {
  background: #ffffff;
}

.deploy-shell [data-slot="sidebar-wrapper"] {
  background: #ffffff;
}

main.deploy-main {
  background: #ffffff !important;
}
```

Inspect the existing app for any root dark classes or theme providers that overwrite this.

Fix them.

---

# 30. MAIN CONTENT SPACING

Recommended:

```text
horizontal page padding:
16px mobile
20px tablet
24px desktop
```

Do not put 60–100px empty side margins around ordinary dashboard content.

---

# 31. TOP HEADER IS NOT A BIG DARK BAR

Use the Arciin floating-control pattern.

The header background itself remains transparent/white.

Controls float as separate chips.

Primary controls:

Left:

```text
[ Arcellite / Overview ]
```

Right:

```text
[ Search projects, deployments, servers... ] [ optional action ] [ New Project ]
```

The header must not become a full-width gray toolbar.

---

# 32. HEADER CONTROL HEIGHT

Use a shared height:

```text
40px
```

All primary top controls should align.

Breadcrumb chip.

Search chip.

Small action chips.

Primary button may also be 40px high.

---

# 33. BREADCRUMB CHIP

Target:

```text
Arcellite  /  Overview
```

or:

```text
Deploy  /  Projects  /  Arciin
```

Visual:

- white surface,
- subtle zinc border,
- soft shadow,
- 10–12px radius,
- compact padding,
- 13–14px text.

---

# 34. SEARCH CHIP

Search should visually resemble a macOS/developer-tool command search.

Example:

```text
⌕  Search projects, deployments, servers...        Ctrl K
```

White.

Thin neutral border.

Very small shadow.

Muted placeholder.

No giant search bar.

No purple outline at rest.

---

# 35. PRIMARY HEADER CTA

Use the current Arcellite brand accent for the primary CTA.

Example:

```text
+ New Project
```

or:

```text
Deploy
```

Do not copy Arciin orange.

Use Arcellite brand accent.

Primary button:

- 40px height,
- 10–12px radius,
- no giant shadow,
- white text,
- immediate pressed state.

---

# 36. HEADER STICKINESS

The header may be sticky.

If sticky:

- keep it visually light,
- no big opaque bar unless content would become unreadable,
- optional subtle white/blur material behind chips,
- no heavy shadow line across the entire viewport.

---

# 37. PAGE INTRO

The current overview page feels like plain text dropped onto a white page.

Improve the page intro.

Target:

```text
Arcellite Lab · home-server

Good afternoon, Robera
Everything is running normally.

1 server · 7 containers · 3 projects
```

Suggested:

```text
metadata: 12px
heading: 24–28px
summary: 14px
```

---

# 38. PAGE TITLE TYPOGRAPHY

Recommended:

```text
Page H1:
24–28px
600 weight
tight tracking

Section title:
14–16px
600

Body:
13–14px

Metadata:
11–12px

Table:
12–13px
```

The current UI should not feel like browser-default typography.

---

# 39. MAIN PAGE HIERARCHY

Every page should have visible hierarchy.

Use this rhythm:

```text
Header / breadcrumb controls

Page intro

Section label / title

Content surface

Section spacing

Next content surface
```

Do not present everything as one uninterrupted sheet of text.

Do not present everything as separate floating cards either.

---

# 40. PANELS

Use:

```text
border: 1px solid zinc-200-ish
background: white
radius: 16px – 20px
shadow: extremely subtle or none
```

Do not use huge 24–32px generic SaaS cards for every tiny thing.

A large grouped dashboard module can use 20–24px radius.

Rows inside should not each become independent bordered cards.

---

# 41. SECTION HEADERS

For main dashboard sections, use a small label/title row.

Example:

```text
PROJECTS                                      View all
─────────────────────────────────────────────────────
```

Use thin zinc separators where helpful.

---

# 42. PROJECTS MODULE

Current projects panel is too plain.

Improve it while remaining deployment-focused.

Panel header:

```text
Projects
Applications on this server.                         View all
```

Rows should include:

```text
[framework icon]
Arciin
Roberadesissaii/arciin · main

Production
Next.js

✓ Ready
41m ago
```

Use alignment.

Avoid excessive blank horizontal space.

---

# 43. PROJECT ROW INTERACTION

Rows should feel clickable.

Default:

```text
white
```

Hover:

```text
zinc-50/70
```

Pressed:

```text
zinc-100/80
```

Transition:

```text
100–150ms
```

Cursor:

```text
pointer
```

Do not add a purple outline on hover.

---

# 44. SERVER MODULE

Create a clearer information hierarchy.

Left:

```text
home-server
● Online

Ubuntu 24.04 LTS
x86_64
192.168.1.50
```

Right:

```text
CPU        [bar]         17%
Memory     [bar]   4.8 / 16 GB
Storage    [bar] 186 / 512 GB
Network    [bar or value] 14 Mbps
```

The resource bars should be thin, refined, and neutral.

The Arcellite accent may be used sparingly for active resource fill.

---

# 45. RESOURCE BAR STYLE

Recommended:

```text
height: 3px – 4px
track: zinc-100 / zinc-200
fill: zinc-700 or Arcellite accent when useful
radius: full
```

Do not make four purple neon bars.

---

# 46. RECENT ACTIVITY

Activity rows should be denser and more useful.

Example:

```text
Deployment succeeded · API Sandbox                 23m
Container restarted · worker                        1h
Domain configured · api.sandbox.dev                 3h
```

Use separators between rows.

---

# 47. STATUS COLORS

Status colors must remain semantic.

Ready / healthy:

```text
emerald / green
```

Building:

```text
blue or neutral animated indicator
```

Warning:

```text
amber
```

Failed:

```text
red
```

Do not use Arcellite purple for every status.

---

# 48. STATUS PRESENTATION

Avoid huge pills.

A status can be:

```text
✓ Ready
```

with a tiny icon.

Or:

```text
● Online
```

with 11–12px label.

---

# 49. ARCELLITE ACCENT USAGE

The Arcellite brand accent should be used for:

- primary CTA,
- focus ring,
- tiny decorative section accent,
- interactive selected control when appropriate,
- link hover/accent,
- special active data visualization.

It should NOT be used for:

- every panel border,
- every active nav row outline,
- every icon,
- every progress bar,
- every heading,
- every counter.

The reference is beautiful because accent color is rare.

---

# 50. REMOVE THE CURRENT ACTIVE NAV OUTLINE

From the current screenshot, the selected `Home` route has a bright rounded purple outline.

Remove that.

Replace with the subtle active fill described above.

This one change is mandatory.

---

# 51. RENAME `HOME` TO `OVERVIEW`

Use:

```text
Overview
```

not:

```text
Home
```

for the main deployment control-plane destination.

Breadcrumb:

```text
Arcellite / Overview
```

Sidebar:

```text
Overview
```

Keep terminology consistent.

---

# 52. CURRENT MAIN HEADER

The current design has:

```text
Arcellite / Overview
```

which is a good direction.

Keep the concept.

Refine its spacing/surface to match the reference.

---

# 53. CARDS SHOULD HAVE INTERNAL STRUCTURE

Do not simply make:

```text
[border]
heading
row
row
row
[/border]
```

Give sections:

- header,
- supporting text,
- actions,
- body,
- rows,
- separators,
- intentional alignment.

---

# 54. NO EXCESSIVE EMPTY SPACE

The current Overview has too much blank vertical and horizontal space for the amount of information displayed.

Increase information density moderately.

The target is not cramped.

The target is professional developer-tool density.

---

# 55. CONTENT DENSITY

Use a density similar to the Arciin screenshot.

Rows around:

```text
50px – 62px
```

depending on content.

Navigation rows around:

```text
32px – 36px
```

Header controls:

```text
40px
```

---

# 56. BORDER LANGUAGE

Main workspace border:

```text
#e4e4e7
```

or equivalent zinc-200.

Subtle.

No high-contrast black border.

No purple border around ordinary modules.

No double borders.

---

# 57. SHADOW LANGUAGE

Use minimal shadows.

Suggested:

```css
0 1px 2px rgba(0,0,0,0.03)
```

or slightly more on floating header chips.

Avoid:

```text
large black shadows
purple glows
floating-everything effect
```

---

# 58. RADIUS LANGUAGE

Recommended:

```text
nav row: 8px
small chip: 10–12px
button: 10–12px
profile card: 12px
panel: 16–20px
large dashboard group: 20–24px max
```

---

# 59. APPLE INTERACTION PRINCIPLES

Continue to follow:

`https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md`

But interpret "Apple style" as:

- hierarchy,
- responsiveness,
- spatial consistency,
- precise motion,
- good typography,
- material only where helpful.

Do not interpret Apple style as:

- blur everything,
- make everything glass,
- gigantic radius,
- animate everything.

---

# 60. POINTER-DOWN FEEDBACK

Buttons should respond immediately.

Primary button:

```text
scale 1 → 0.98
```

or equivalent visual press.

Nav row can darken immediately.

Interactive cards can slightly change background immediately.

---

# 61. MOTION DURATION

General micro-interactions:

```text
100–180ms
```

Sidebar width:

```text
180–220ms
```

Popover/sheet:

```text
180–260ms
```

---

# 62. FOCUS STATES

Keyboard focus should use Arcellite accent.

Do not use always-visible purple outlines on mouse selection.

Focus ring and selected state are different concepts.

---

# 63. SEARCH / COMMAND PALETTE

Keep command palette functionality.

Improve its visual consistency with the white workspace.

Command palette:

- white/light content surface,
- zinc borders,
- strong shadow because it is an overlay,
- grouped search results,
- selected item uses light neutral background,
- Arcellite accent used sparingly.

---

# 64. POPOVERS IN SIDEBAR

A menu opened from the dark sidebar should generally remain dark.

Example profile menu:

```text
#18181b
white/zinc text
white/10 border
```

---

# 65. POPOVERS IN MAIN WORKSPACE

Popovers/selects opened from the white workspace should be light.

Do not inherit dark root theme accidentally.

This is why scoped tokens are required.

---

# 66. FORMS

Forms in the main workspace:

```text
white background
zinc-200 border
black/zinc text
```

Focus:

```text
Arcellite accent ring
```

Do not use dark form inputs inside the white workspace.

---

# 67. PROJECT CREATION FLOW

The new-project flow should use the same repaired shell.

Do not change it to a black wizard.

The GitHub/Upload selection page should remain:

- white canvas,
- beautiful spacing,
- compact surfaces,
- Arcellite primary button,
- dark text.

---

# 68. DEPLOYMENT PROGRESS PAGE

Do not make deployment progress a giant terminal-only dark screen.

Recommended:

White primary page.

Top:

```text
Deploying Arciin
main · 8f34a91
```

Left/upper:

deployment step timeline.

Lower/right:

logs in a dark code/log surface.

This creates clear material distinction.

---

# 69. LOG PANELS

Logs can be dark.

This is a valid exception.

Use:

```text
#09090b
monospace
soft zinc text
```

because log/terminal content benefits from it.

But logs live inside the white application workspace.

---

# 70. METRICS

Metrics page remains white.

Graphs use:

- neutral grids,
- thin strokes,
- Arcellite accent as primary series,
- semantic secondary series where required.

Do not use rainbow charts.

---

# 71. TABLES

Tables should resemble a polished app, not raw HTML.

Use:

```text
white panel
subtle header surface
zinc separator lines
11px uppercase/medium metadata header when appropriate
13px cells
hover zinc-50
```

Do not box every cell.

---

# 72. PAGE ACTIONS

Primary page CTA goes in a predictable top-right region.

Examples:

Projects:

```text
New Project
```

Domains:

```text
Add Domain
```

Servers:

```text
Connect Server
```

---

# 73. EMPTY STATES

Empty states remain on white.

Use:

- small neutral icon,
- strong short title,
- one short explanation,
- one primary action.

No huge illustrations.

---

# 74. ALERTS / WARNINGS

The current Overview line:

```text
api.sandbox.dev is waiting for DNS.
```

should not look like loose paragraph text.

Present warning as a restrained inline notice or section item.

Example:

```text
○ api.sandbox.dev
  Waiting for DNS verification                         Review
```

Use amber only where necessary.

---

# 75. OVERVIEW INFORMATION ARCHITECTURE

Recommended repaired desktop Overview:

```text
[breadcrumb chip]                  [search] [New Project]

Arcellite Lab · home-server

Good afternoon, Robera
Infrastructure is healthy.
1 server · 7 containers · 3 projects


PROJECTS                                              View all
┌─────────────────────────────────────────────────────────────┐
│ Arciin          Production   Next.js     ✓ Ready      41m │
│ MODVRA Studio   Production   Next.js     ✓ Ready       2h │
│ API Sandbox     Development  FastAPI     ✓ Ready      23m │
└─────────────────────────────────────────────────────────────┘


SERVER                                                Open
┌─────────────────────────────────────────────────────────────┐
│ home-server            CPU       ───────          17%      │
│ ● Online               Memory    ─────────    4.8 / 16 GB  │
│ Ubuntu 24.04           Storage   ─────────── 186 / 512 GB  │
│ 192.168.1.50           Network                     14 Mbps  │
└─────────────────────────────────────────────────────────────┘


RECENT ACTIVITY                                      View all
┌─────────────────────────────────────────────────────────────┐
│ ✓ Deployment succeeded · API Sandbox                  23m  │
│ ↻ Container restarted · worker                         1h  │
│ ◇ Domain configured · api.sandbox.dev                  3h  │
└─────────────────────────────────────────────────────────────┘
```

This is a structural example, not pixel-exact final UI.

---

# 76. TOP-OF-PAGE SPACING

After header controls, maintain intentional spacing:

```text
8–20px depending on breakpoint
```

---

# 77. PAGE SECTION SPACING

Recommended vertical spacing between major sections:

```text
28–40px
```

---

# 78. MAIN SECTION LABELS

Arcellite Deploy may use:

```text
PROJECTS
SERVER
RECENT ACTIVITY
```

at:

```text
10–11px
font-semibold
uppercase
letter spacing
zinc-500
```

or a slightly more conventional title row if it fits better.

Be consistent.

---

# 79. CONTENT SHOULD NOT LOOK LIKE WIREFRAME TEXT

The current UI reads like the initial wireframe translated literally.

Upgrade it into a product.

Specifically fix:

- typography hierarchy,
- row hover states,
- icon consistency,
- section labels,
- borders,
- panel padding,
- header chip surfaces,
- resource alignment,
- sidebar grouping,
- status presentation,
- button hierarchy,
- page rhythm.

---

# 80. KEEP ARCELLITE'S OWN ACCENT

The current implementation reports the live Arcellite accent as:

```text
#5D5FEF
```

Verify this against the current project/live Arcellite branding before finalizing.

If the existing official Arcellite token differs, use the existing official token.

Do not introduce another accent just because the reference uses orange.

---

# 81. ACCENT DERIVATIVES

If `#5D5FEF` is the approved current brand token, derive:

```css
--brand: #5D5FEF;
--brand-hover: ...;
--brand-pressed: ...;
--brand-subtle: color-mix(...);
--brand-ring: ...;
```

Do not manually scatter copies of the hex.

---

# 82. SIDEBAR DOES NOT NEED BRAND-COLOR OUTLINES

Repeat because this is important:

The sidebar itself should remain neutral.

Use white-opacity states.

The brand accent should not dominate navigation.

---

# 83. ICON DUPLICATION

Audit the navigation icons.

Every navigation route should have a semantically appropriate icon.

Suggested:

```text
Overview      LayoutDashboard
Projects      FolderKanban / Boxes
Deployments   GitCommitHorizontal / PackageCheck
Servers       Server
Containers    Boxes
Domains       Globe2
Storage       HardDrive
Databases     Database
Activity      Activity
Logs          Terminal
Metrics       Gauge / ChartNoAxesCombined
Alerts        BellRing / TriangleAlert
Docs          BookOpen
Settings      Settings
Notifications Bell
```

Choose exact icons carefully.

---

# 84. DO NOT OVERUSE ROCKET ICONS

Use one only where meaningful.

Do not make the whole product look childish.

---

# 85. BRAND ICON SIZE

Upper-left Arcellite mark:

```text
18–22px
```

Wordmark:

```text
15–17px
```

Product label:

```text
11–13px
muted
```

---

# 86. CONTENT HEADER ON COLLAPSED SIDEBAR

When the sidebar collapses:

- main content should widen,
- breadcrumb and search stay aligned,
- no unexplained 200px gap remains,
- no absolute-position overlap.

Inspect both states.

---

# 87. WINDOW RESIZE STATE

Test:

```text
1440px
1280px
1024px
768px
```

Sidebar should not overlap content at tablet widths.

---

# 88. PERSISTENCE

Sidebar state should survive reload.

Theme settings must not reintroduce full dark workspace.

Command palette functionality should survive visual refactor.

---

# 89. SCROLL BEHAVIOR

Sidebar:

- independent vertical scroll if content exceeds height,
- footer stays available/anchored when possible.

Workspace:

- main content scrolls vertically,
- sidebar does not jump when workspace scrolls,
- sticky header chips remain available where appropriate.

---

# 90. DO NOT BREAK WORKING FUNCTIONALITY

Before editing, identify:

- routes,
- provider/store state,
- persistence,
- command palette,
- deployment state machine,
- mock server state.

The visual refactor must not change their behavior unless required for layout.

---

# 91. CODE ORGANIZATION

Create or refine shared components instead of applying one-off fixes.

Suggested:

```text
src/components/app-shell/
  app-shell.tsx
  app-sidebar.tsx
  app-header.tsx
  sidebar-nav-item.tsx
  sidebar-section.tsx
  workspace.tsx

src/components/dashboard/
  page-intro.tsx
  section-header.tsx
  panel.tsx
  project-row.tsx
  server-summary.tsx
  activity-row.tsx
```

Adapt to current repo structure.

Do not create duplicates if equivalents already exist.

---

# 92. VISUAL TOKENS

Use a centralized token file.

At minimum:

```css
:root {
  --brand: ...;

  --sidebar-bg: #09090b;
  --sidebar-text: rgba(255,255,255,.50);
  --sidebar-text-active: rgba(255,255,255,.95);
  --sidebar-hover: rgba(255,255,255,.04);
  --sidebar-active: rgba(255,255,255,.08);
  --sidebar-divider: rgba(255,255,255,.06);

  --workspace-bg: #ffffff;
  --workspace-text: #09090b;
  --workspace-muted: #52525b;
  --workspace-border: #e4e4e7;
  --workspace-soft: #f4f4f5;
}
```

---

# 93. DO NOT USE GLOBAL `dark` TO COLOR EVERYTHING

Search the current codebase for:

```text
dark:
.dark
bg-zinc-950
bg-black
bg-neutral-950
theme === "dark"
resolvedTheme
```

Find where the main workspace becomes dark.

Refactor so sidebar tokens and workspace tokens are independent.

---

# 94. REVIEW CURRENT TOKENS FIRST

Before writing new CSS:

1. inspect `src/styles/tokens.css`,
2. inspect root/global styles,
3. inspect theme provider,
4. inspect app shell,
5. inspect sidebar,
6. inspect header,
7. inspect reusable panel/card components.

Do not layer many `!important` overrides over a broken token system unless necessary.

Fix the source of truth.

---

# 95. SCREENSHOT COMPARISON IS REQUIRED

After the repair, compare the app visually against the provided Arciin reference.

Do not compare product content.

Compare:

- rail width,
- rail darkness,
- visual density,
- brand position,
- nav text size,
- nav active state,
- section label style,
- profile footer,
- white workspace,
- top control styling,
- border subtlety,
- spacing,
- information density.

The repaired Arcellite Deploy should clearly feel like it belongs to the same **quality family**.

---

# 96. IT SHOULD NOT BECOME ARCIIIN

The result must still obviously be Arcellite Deploy.

Keep:

- Arcellite logo,
- Arcellite accent,
- deployment concepts,
- project/server/container/domain workflows,
- current Arcellite Deploy data model.

Reference only:

- shell,
- proportions,
- UI grammar,
- hierarchy,
- state behavior,
- visual quality.

---

# 97. REMOVE GENERIC TEMPLATE APPEARANCE

Audit for signs of a generic AI-generated dashboard:

- equal-size KPI cards,
- random purple outlines,
- repetitive card borders,
- unnecessary rounded rectangles,
- empty white space,
- inconsistent icon sizes,
- giant headings,
- full dark mode,
- excessive muted text,
- repeated badges,
- random divider placement.

Fix them.

---

# 98. SPECIFIC CURRENT SCREEN FIXES

Based on the current screenshot, fix these:

1. `Home` → `Overview`.
2. Remove bright purple active border around the active sidebar row.
3. Improve nav grouping and section hierarchy.
4. Make the brand lockup more polished.
5. Reduce sidebar dead space and improve bottom/footer treatment.
6. Improve top-left breadcrumb chip proportions.
7. Improve search control so it looks like the reference.
8. Give the page intro better typography and spacing.
9. Make the DNS pending message an intentional alert row.
10. Improve project rows with framework/status/source hierarchy.
11. Improve server resource display.
12. Improve recent activity rows.
13. Standardize section titles/actions.
14. Make the whole workspace feel denser and more deliberate.
15. Guarantee white workspace under all theme states.

---

# 99. DO NOT DELETE THE CURRENT ARCELLITE LOGO

The current product already has the correct idea:

```text
Arcellite. Deploy
```

Keep it.

Improve spacing/size only.

---

# 100. FIRST PASS IMPLEMENTATION ORDER

## Step 1 — audit

Inspect:

- tokens,
- global CSS,
- theme provider,
- shell,
- sidebar,
- header,
- reusable panels.

## Step 2 — lock split theme

Implement:

- permanent dark sidebar,
- white workspace,
- scoped tokens,
- remove full-workspace dark mode behavior.

## Step 3 — sidebar

Implement:

- correct width,
- correct collapsed state,
- subtle active/hover state,
- section labels,
- dividers,
- footer,
- profile card,
- counters,
- icons,
- persistence.

## Step 4 — header

Implement:

- floating breadcrumb chip,
- search chip,
- right-side actions,
- consistent 40px control height.

## Step 5 — overview

Refine:

- intro,
- pending DNS notice,
- projects,
- server panel,
- activity.

## Step 6 — shared design system

Apply repaired:

- panels,
- tables,
- forms,
- statuses,
- buttons,
- spacing,
- typography.

## Step 7 — remaining routes

Review all existing pages.

Bring them into the repaired visual system.

## Step 8 — interaction polish

- hover,
- active,
- press,
- keyboard focus,
- collapse animation,
- command palette,
- dialogs,
- menus.

## Step 9 — regression checks

- lint,
- typecheck,
- tests,
- build,
- route checks.

---

# 101. VISUAL ACCEPTANCE TEST

The work is NOT finished until all statements below are true.

- The sidebar is black/near-black.
- The main workspace is white.
- Switching OS/theme does not turn the workspace black.
- The active sidebar row does not have a bright purple outline.
- Sidebar expanded width is approximately 256px.
- Sidebar collapsed width is approximately 48px.
- Collapse actually changes layout.
- Collapse state persists.
- Collapsed items have tooltips.
- Brand area looks intentional.
- `Arcellite. Deploy` remains the product identity.
- Infrastructure and Observe sections are visually grouped.
- Footer/profile area is anchored and polished.
- Top controls visually float on the white canvas.
- Header controls align to approximately 40px height.
- Project rows have clear hover state.
- Server resource rows are aligned.
- Main border color is subtle neutral gray.
- Main text is high contrast.
- Secondary text remains readable.
- Arcellite accent is used sparingly.
- No generic purple glow remains.
- No neon effect remains.
- No full dark dashboard remains.
- Main pages feel visually related to the Arciin reference.
- Product still clearly looks like Arcellite Deploy.
- All previous Phase 1 functionality continues working.

---

# 102. FUNCTIONAL ACCEPTANCE TEST

After visual changes, verify these existing functions still work:

- project navigation,
- project filters,
- project search,
- New Project,
- GitHub mock import,
- Upload mock,
- Git URL,
- Docker image mock,
- Compose mock,
- project analysis,
- deployment configuration,
- environment variable editing,
- deployment start,
- deployment progress,
- cancellation,
- redeploy,
- failure simulation,
- deployment logs,
- project detail routes,
- server detail routes,
- container mock actions,
- domain creation,
- domain verification,
- settings persistence,
- copy actions,
- confirmations,
- toasts,
- command palette.

Do not regress functionality for visual polish.

---

# 103. TEST CHECKLIST

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Fix all errors.

Then manually inspect:

```text
/
 /projects
 /projects/new
 /deployments
 /servers
 /containers
 /domains
 /storage
 /databases
 /activity
 /logs
 /metrics
 /settings
```

Inspect both sidebar states.

Inspect at least:

```text
1440px
1280px
1024px
```

---

# 104. FINAL SCREENSHOT CHECK

Before telling the user the repair is complete:

Capture or inspect the Overview page.

Compare it against the Arciin reference.

Ask:

1. Is the sidebar equally polished?
2. Is the workspace unquestionably white?
3. Is the brand lockup equally clean?
4. Are the nav rows compact?
5. Are the active states subtle?
6. Are section labels intentional?
7. Does the profile/footer area feel finished?
8. Are top controls equally refined?
9. Is information density comparable?
10. Does the page feel like a finished product instead of a wireframe?

If the answer to any major item is no, continue refining.

---

# 105. FINAL AGENT RULE

Do not tell the user:

> "The design is improved."

unless you actually inspect the result.

Do not stop at changing a few color tokens.

This is a complete shell/UI-system repair.

The product functionality is already there.

Your job is to make it **look designed**.

---

# 106. HIERARCHY OF INSTRUCTIONS

For this repair:

1. `READ_SECOND_ARCELLITE_DEPLOY_UI_REPAIR.md` controls the visual system.
2. User-provided Arciin screenshot controls the target visual grammar.
3. `Roberadesissaii-arc/arciin` controls implementation reference behavior.
4. Current Arcellite brand controls logo and brand accent.
5. Apple Design skill controls interaction/motion quality.
6. `READ_FIRST_ARCELLITE_DEPLOY.md` continues to control product functionality and architecture.

If the first spec says the app supports a full dark theme, this repair overrides that behavior for the current approved design.

---

# 107. START NOW

Begin by auditing the current Arcellite Deploy implementation.

Do not initialize a new app.

Do not create a new repository.

Do not replace the existing mock provider.

Do not rebuild working features.

Repair the existing visual system.

The first visible milestone must be:

```text
BLACK ARCELLITE DEPLOY SIDEBAR
+
WHITE WORKSPACE
+
POLISHED ARCIIIN-QUALITY SHELL
+
ARCELLITE BRAND
```

Then continue through the rest of the visual refactor.
