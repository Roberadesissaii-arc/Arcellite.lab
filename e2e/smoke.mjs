// Browser smoke test against a running Arcellite Deploy.
//   node e2e/smoke.mjs --mode mock   --base http://localhost:3000
//   node e2e/smoke.mjs --mode server --base http://localhost:3000   (empty database)
// Fails on any failed step or any uncaught browser error.
import { chromium } from "playwright"

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []))
const mode = args.mode ?? "mock"
const base = (args.base ?? "http://localhost:3000").replace(/\/$/, "")
const OWNER = { name: "Smoke Owner", login: "smoke@example.com", password: "smoke test passphrase 42" }
const SECRET = "smoke-secret-value-9f2c"

const results = []
const browserErrors = []
let failed = false

async function step(name, work) {
  try {
    const detail = await work()
    results.push(`PASS  ${name}${detail ? `  (${detail})` : ""}`)
  } catch (error) {
    failed = true
    results.push(`FAIL  ${name}  — ${String(error?.message ?? error).split("\n")[0]}`)
  }
}

function watch(page) {
  page.on("pageerror", (error) => browserErrors.push(`${page.url()}: ${error.message.split("\n")[0]}`))
}

async function mockSmoke(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  watch(page)
  await step("mock: overview opens without sign-in", async () => {
    await page.goto(`${base}/`)
    await page.getByRole("heading", { name: "Welcome to Arcellite Deploy" }).waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "Skip" }).click()
    if (!page.url().startsWith(`${base}/`) || page.url().includes("/login")) throw new Error(`unexpected ${page.url()}`)
  })
  await step("mock: simulated home server is present", async () => {
    await page.goto(`${base}/servers`)
    await page.getByText("192.168.1.50").first().waitFor({ timeout: 10000 })
  })
  await step("mock: image deploy reaches ready", async () => {
    await page.goto(`${base}/projects/new/image`)
    await page.locator("#np-source-input").fill("nginx:alpine")
    await page.getByRole("button", { name: "Analyze" }).click()
    await page.getByRole("button", { name: "Configure deploy" }).click({ timeout: 10000 })
    await page.getByRole("button", { name: "Deploy" }).last().click()
    await page.waitForURL(/\/deployments\/dep_/, { timeout: 10000 })
    await page.getByText("Live — your deployment is serving").waitFor({ timeout: 30000 })
  })
  await step("mock: /setup and /login redirect home", async () => {
    await page.goto(`${base}/login`)
    if (new URL(page.url()).pathname !== "/") throw new Error(page.url())
  })
  await step("mock: control-plane API is off", async () => {
    const status = await page.evaluate(async () => (await fetch("/api/v1/auth/status")).status)
    if (status !== 501) throw new Error(`status ${status}`)
  })
  await step("mock: security headers", async () => {
    const response = await page.goto(`${base}/`)
    const csp = response.headers()["content-security-policy"] ?? ""
    if (!/script-src 'self' 'nonce-/.test(csp) || !csp.includes("frame-ancestors 'none'")) throw new Error(csp)
    if (response.headers()["x-content-type-options"] !== "nosniff") throw new Error("nosniff missing")
  })
  await context.close()
}

async function serverSmoke(browser) {
  let context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  let page = await context.newPage()
  watch(page)

  await step("server: unauthenticated visit goes to /setup", async () => {
    await page.goto(`${base}/`)
    await page.waitForURL(`${base}/setup`)
  })
  await step("server: setup validates and creates the owner", async () => {
    await page.getByLabel("Your name").fill(OWNER.name)
    await page.getByLabel("Email or username").fill(OWNER.login)
    await page.locator("input[name=password]").fill("short")
    await page.locator("input[name=passwordConfirmation]").fill("short")
    await page.getByRole("button", { name: "Create owner account" }).click()
    await page.getByText("Use at least 12 characters.").waitFor({ timeout: 5000 })
    await page.locator("input[name=password]").fill(OWNER.password)
    await page.locator("input[name=passwordConfirmation]").fill(OWNER.password)
    await page.getByRole("button", { name: "Create owner account" }).click()
    await page.waitForURL(`${base}/`, { timeout: 15000 })
    await page.getByText(`${OWNER.name}`).first().waitFor({ timeout: 10000 })
  })
  await step("server: session cookie is HttpOnly and survives reload", async () => {
    const cookies = await context.cookies()
    const session = cookies.find((cookie) => cookie.name === "arcellite_session")
    if (!session?.httpOnly || session.sameSite !== "Lax") throw new Error(JSON.stringify(session))
    await page.reload()
    if (page.url() !== `${base}/`) throw new Error(page.url())
  })
  await step("server: no fake infrastructure", async () => {
    await page.goto(`${base}/servers`)
    await page.waitForTimeout(1000)
    if (await page.getByText("192.168.1.50").count()) throw new Error("home-server fixture visible")
    if (await page.getByText("home-server", { exact: false }).count()) throw new Error("home-server visible")
  })
  let projectUrl = ""
  await step("server: create a project (no deployment is faked)", async () => {
    await page.goto(`${base}/projects/new/image`)
    await page.locator("#np-source-input").fill("nginx:alpine")
    await page.getByRole("button", { name: "Analyze" }).click()
    await page.getByRole("button", { name: "Configure deploy" }).click({ timeout: 10000 })
    await page.getByRole("button", { name: "Deploy" }).last().click()
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 })
    projectUrl = page.url()
    await page.getByText("Not deployed").first().waitFor({ timeout: 10000 })
  })
  await step("server: add a secret environment variable", async () => {
    await page.goto(`${base}/environment`)
    await page.getByRole("button", { name: "Add variable" }).first().click()
    await page.getByPlaceholder("DATABASE_URL").fill("SMOKE_TOKEN")
    await page.locator(".dialog input[type=password]").fill(SECRET)
    await page.locator(".dialog").getByRole("button", { name: "Add variable" }).click()
    await page.getByText("SMOKE_TOKEN").first().waitFor({ timeout: 10000 })
    if (await page.getByText(SECRET).count()) throw new Error("secret shown without reveal")
  })
  await step("server: secret reveal requires the current password", async () => {
    await page.getByRole("button", { name: "Reveal SMOKE_TOKEN" }).click()
    await page.locator(".dialog input[type=password]").fill("definitely wrong")
    await page.getByRole("button", { name: "Show secret" }).click()
    await page.getByText("That password is not correct.").waitFor({ timeout: 5000 })
    await page.locator(".dialog input[type=password]").fill(OWNER.password)
    await page.getByRole("button", { name: "Show secret" }).click()
    await page.getByText(SECRET).waitFor({ timeout: 5000 })
  })
  await step("server: no secrets or canonical state in localStorage", async () => {
    const stored = await page.evaluate(() => JSON.stringify(localStorage))
    if (stored.includes(SECRET)) throw new Error("secret in localStorage")
    if (stored.includes("arcellite-deploy-state")) throw new Error("mock state in localStorage")
  })
  await step("server: settings persist", async () => {
    await page.goto(`${base}/settings?section=Deployment%20defaults`)
    const field = page.locator("input[name=branch]")
    await field.waitFor({ timeout: 10000 })
    await field.fill("trunk")
    await page.getByRole("button", { name: "Save defaults" }).click()
    await page.getByText("Deployment defaults saved").waitFor({ timeout: 5000 })
    await page.reload()
    await page.locator("input[name=branch]").waitFor({ timeout: 10000 })
    const value = await page.locator("input[name=branch]").inputValue()
    if (value !== "trunk") throw new Error(`default branch ${value}`)
  })
  await step("server: infrastructure actions say they are not available", async () => {
    await page.goto(projectUrl)
    await page.getByRole("button", { name: "Redeploy" }).first().click()
    await page.getByText("Not available yet").first().waitFor({ timeout: 5000 })
  })
  await step("server: activity records the changes", async () => {
    await page.goto(`${base}/activity`)
    await page.getByText("Project created").first().waitFor({ timeout: 10000 })
    await page.getByText("Environment variable updated").first().waitFor({ timeout: 10000 })
  })
  await step("server: unsafe request without CSRF header is rejected", async () => {
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/v1/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ defaultBranch: "evil" }) })
      return { status: response.status, body: await response.json() }
    })
    if (result.status !== 403 || result.body.error.code !== "CSRF_FAILED") throw new Error(JSON.stringify(result))
  })
  await step("server: project survives a browser restart", async () => {
    const state = await context.storageState()
    await context.close()
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: { cookies: state.cookies, origins: [] } })
    page = await context.newPage()
    watch(page)
    await page.goto(projectUrl)
    await page.getByText("Not deployed").first().waitFor({ timeout: 10000 })
  })
  await step("server: sign out ends the session", async () => {
    const before = await context.cookies()
    await page.goto(`${base}/`)
    await page.locator(".sidebar-profile").first().click()
    await page.getByRole("menuitem", { name: "Sign Out" }).click()
    await page.waitForURL(`${base}/login`, { timeout: 10000 })
    const old = before.find((cookie) => cookie.name === "arcellite_session")
    const status = await page.evaluate(async (token) => {
      document.cookie = `arcellite_session=${token}; path=/`
      return (await fetch("/api/v1/auth/me")).status
    }, old.value).catch(() => null)
    // HttpOnly cookies cannot be set from script; replay the old token from a fresh context instead.
    const replay = await browser.newContext({ storageState: { cookies: [old], origins: [] } })
    const replayStatus = (await replay.request.get(`${base}/api/v1/auth/me`)).status()
    await replay.close()
    if (replayStatus !== 401) throw new Error(`old session answered ${replayStatus} (${status})`)
  })
  await step("server: wrong password is generic, right password signs in", async () => {
    await page.getByLabel("Email or username").fill(OWNER.login)
    await page.locator("input[name=password]").fill("not the password")
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.getByText("Invalid credentials.").waitFor({ timeout: 5000 })
    await page.locator("input[name=password]").fill(OWNER.password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.waitForURL(`${base}/`, { timeout: 15000 })
  })
  await step("server: second setup is refused", async () => {
    await page.goto(`${base}/setup`)
    if (new URL(page.url()).pathname === "/setup") throw new Error("setup page still available")
  })
  await context.close()
}

const browser = await chromium.launch()
try {
  if (mode === "server") await serverSmoke(browser)
  else await mockSmoke(browser)
} finally {
  await browser.close()
}
for (const line of results) console.log(line)
if (browserErrors.length) {
  failed = true
  console.log("Uncaught browser errors:")
  for (const line of browserErrors) console.log(`  ${line}`)
}
console.log(failed ? `\n${mode} smoke FAILED` : `\n${mode} smoke passed (${results.length} steps)`)
process.exit(failed ? 1 : 0)
