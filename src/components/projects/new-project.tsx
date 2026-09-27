"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import Link from "next/link"
import { ArrowRight, Check, ChevronLeft, ChevronRight, Container, FileArchive, FolderGit2, FolderUp, GitBranch, Layers, Lock, Rocket, ScanSearch, Server, SlidersHorizontal, Upload, X } from "lucide-react"
import { IconTile, SearchField, SectionHeading, Tag } from "@/components/ui/kit"
import { GitHubMark } from "@/components/brand"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PageSkeleton } from "@/components/ui/bits"
import { Field, SelectInput, TextInput } from "@/components/ui/fields"
import { useToast } from "@/components/ui/toast"
import { EnvEditor, envError } from "@/components/projects/env-editor"
import {
  analysisFromFiles,
  filesForCompose,
  filesForGitUrl,
  filesForImage,
  filesForUpload,
  FRAMEWORKS,
  FRAMEWORK_ORDER,
} from "@/lib/deploy/detect"
import { formatBytes, formatGb, formatRelative } from "@/lib/deploy/format"
import { homeServer, nextFreePort, portTaken } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useNow } from "@/lib/use-now"
import { DeployError, type AnalysisResult, type EnvironmentVariable, type Framework, type GitRepository, type ProjectSource } from "@/lib/deploy/types"

const STEPS: { label: string; stages: string[] }[] = [
  { label: "Source", stages: ["choose", "github", "upload", "git", "image", "compose"] },
  { label: "Analyze", stages: ["analyze"] },
  { label: "Configure", stages: ["configure"] },
]

const schema = z.object({
  name: z.string().trim().min(1, "Name the project."),
  environment: z.enum(["production", "preview", "development"]),
  rootDirectory: z.string().trim().min(1, "Enter a root directory."),
  branch: z.string(),
  autoDeploy: z.boolean(),
  framework: z.enum(["nextjs", "vite", "node", "express", "fastapi", "flask", "static", "dockerfile", "compose", "unknown"]),
  installCommand: z.string(),
  buildCommand: z.string(),
  startCommand: z.string().trim().min(1, "A start command is required."),
  outputDirectory: z.string(),
  internalPort: z.number().int().min(1).max(65535),
  portMode: z.enum(["auto", "custom"]),
  exposedPort: z.number().int().min(1).max(65535),
  healthPath: z.string().trim().min(1, "Enter a health path."),
  cpuLimit: z.string(),
  memoryLimitMb: z.string(),
  restartPolicy: z.enum(["unless-stopped", "on-failure", "always", "no"]),
  simulateFailure: z.boolean(),
})

type FormValues = z.infer<typeof schema>
type Stage = "choose" | "github" | "upload" | "git" | "image" | "compose" | "analyze" | "configure"
const LANGUAGE_COLOR: Record<string, string> = { TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572a5", HTML: "#e34c26", Go: "#00add8", Rust: "#dea584" }
const REPO_PAGE = 7
const SOURCE_STAGES: Stage[] = ["choose", "github", "upload", "git", "image", "compose"]

export function NewProjectView({ source: routeSource }: { source?: string } = {}) {
  const state = useDeployState()
  const deploy = useDeploy()
  const router = useRouter()
  const params = useSearchParams()
  const toast = useToast()
  const reduced = useReducedMotion()
  const now = useNow()
  const initial = routeSource ?? params.get("source")
  // Source screens live in the URL (/projects/new/upload) so Back and the browser
  // back button return to the source picker; analyze/configure are in-page.
  const sourceStage: Stage = SOURCE_STAGES.includes(initial as Stage) ? (initial as Stage) : "choose"
  const [flow, setFlow] = useState<{ stage: "analyze" | "configure"; from: string | null } | null>(null)
  const stage: Stage = flow && flow.from === initial ? flow.stage : sourceStage
  function setStage(next: Stage) {
    if (next === "analyze" || next === "configure") {
      setFlow({ stage: next, from: initial })
      return
    }
    setFlow(null)
    if (next === sourceStage) return
    router.push(next === "choose" ? "/projects/new" : `/projects/new/${next}`)
  }
  const [repoQuery, setRepoQuery] = useState("")
  const [repoFilter, setRepoFilter] = useState<"all" | "public" | "private">("all")
  const [repoPage, setRepoPage] = useState(0)
  const [repo, setRepo] = useState<GitRepository | null>(null)
  const [branch, setBranch] = useState("main")
  const [upload, setUpload] = useState<{ name: string; size: number; progress: number; error: string | null } | null>(null)
  const [gitUrl, setGitUrl] = useState("")
  const [image, setImage] = useState("")
  const [composeFile, setComposeFile] = useState("docker-compose.yml")
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [source, setSource] = useState<ProjectSource | null>(null)
  const [shownChecks, setShownChecks] = useState(0)
  const [env, setEnv] = useState<EnvironmentVariable[]>([])
  const [advanced, setAdvanced] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const cancelUpload = useRef(false)
  const folderRef = useRef<HTMLInputElement>(null)

  const suggestedPort = state ? nextFreePort(state.projects, state.settings.portStart) : 8085
  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      environment: state?.settings.defaultEnvironment ?? "production",
      rootDirectory: ".",
      branch: state?.settings.defaultBranch ?? "main",
      autoDeploy: false,
      framework: "nextjs",
      installCommand: "",
      buildCommand: "",
      startCommand: "",
      outputDirectory: "",
      internalPort: 3000,
      portMode: "auto",
      exposedPort: suggestedPort,
      healthPath: "/",
      cpuLimit: "",
      memoryLimitMb: "",
      restartPolicy: "unless-stopped",
      simulateFailure: false,
    },
  })
  const portMode = useWatch({ control: form.control, name: "portMode" })

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "")
    folderRef.current?.setAttribute("directory", "")
  }, [])

  useEffect(() => {
    if (!analysis || reduced) return
    if (shownChecks >= analysis.checks.length) return
    const timer = window.setTimeout(() => setShownChecks((count) => count + 1), 260)
    return () => window.clearTimeout(timer)
  }, [analysis, shownChecks, reduced])

  const repos = useMemo(() => {
    if (!state) return []
    const query = repoQuery.trim().toLowerCase()
    return state.repositories.filter((item) => !query || `${item.fullName} ${item.description} ${item.language}`.toLowerCase().includes(query))
  }, [state, repoQuery])

  if (!state) return <PageSkeleton variant="detail" />
  const filteredRepos = repos.filter((item) => repoFilter === "all" || (repoFilter === "private") === item.private)
  const repoPages = Math.max(1, Math.ceil(filteredRepos.length / REPO_PAGE))
  const currentRepoPage = Math.min(repoPage, repoPages - 1)
  const shownRepos = filteredRepos.slice(currentRepoPage * REPO_PAGE, (currentRepoPage + 1) * REPO_PAGE)

  function beginAnalysis(nextSource: ProjectSource, files: string[], suggestedName: string, suggestedBranch: string | null, environment?: FormValues["environment"]) {
    const result = analysisFromFiles(files)
    setSource(nextSource)
    setAnalysis(result)
    setShownChecks(0)
    setStage("analyze")
    const profile = FRAMEWORKS[result.framework]
    form.reset({
      ...form.getValues(),
      name: suggestedName,
      branch: suggestedBranch ?? "",
      environment: environment ?? state?.settings.defaultEnvironment ?? "production",
      framework: result.framework,
      installCommand: profile.installCommand,
      buildCommand: profile.buildCommand,
      startCommand: profile.startCommand,
      outputDirectory: profile.outputDirectory ?? "",
      internalPort: profile.internalPort,
      healthPath: profile.healthPath,
      exposedPort: state ? nextFreePort(state.projects, state.settings.portStart) : suggestedPort,
      portMode: "auto",
      autoDeploy: nextSource.type === "github",
      rootDirectory: result.rootDirectory,
    })
  }

  async function acceptFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return
    const primary = files[0]
    const folderName = primary.webkitRelativePath?.split("/")[0]
    const name = folderName || primary.name
    const size = files.reduce((sum, file) => sum + file.size, 0)
    if (size <= 0) {
      setUpload({ name, size, progress: 0, error: "The archive is empty." })
      setStage("upload")
      return
    }
    cancelUpload.current = false
    setUpload({ name, size, progress: 0, error: null })
    setStage("upload")
    const started = performance.now()
    await new Promise<void>((resolve) => {
      const step = (time: number) => {
        if (cancelUpload.current) return resolve()
        const progress = Math.min(1, (time - started) / 700)
        setUpload({ name, size, progress, error: null })
        if (progress < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    if (cancelUpload.current) return
    beginAnalysis({ type: "upload", filename: name, size }, filesForUpload(name), titleFrom(name), null)
  }

  async function onDeploy(values: FormValues) {
    setFormError(null)
    const parsed = schema.safeParse({
      ...values,
      internalPort: Number(values.internalPort),
      exposedPort: Number(values.exposedPort),
    })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the form.")
      return
    }
    const variableError = envError(env)
    if (variableError) {
      setFormError(variableError)
      return
    }
    if (!source || !state) return
    if (portTaken(state.projects, parsed.data.exposedPort)) {
      setFormError(`${parsed.data.exposedPort} is already assigned on this server.`)
      return
    }
    if (source.type === "github" && !state.github.connected) {
      setFormError("Repository access lost. Reconnect GitHub before deploying this repository.")
      return
    }
    setDeploying(true)
    try {
      const project = await deploy.createProject({
        name: parsed.data.name,
        environment: parsed.data.environment,
        framework: parsed.data.framework,
        source,
        branch: parsed.data.branch || null,
        rootDirectory: parsed.data.rootDirectory,
        packageManager: FRAMEWORKS[parsed.data.framework].packageManager,
        installCommand: parsed.data.installCommand,
        buildCommand: parsed.data.buildCommand,
        startCommand: parsed.data.startCommand,
        outputDirectory: parsed.data.outputDirectory || null,
        internalPort: parsed.data.internalPort,
        exposedPort: parsed.data.exposedPort,
        portMode: parsed.data.portMode,
        healthPath: parsed.data.healthPath,
        autoDeploy: parsed.data.autoDeploy,
        cpuLimit: parsed.data.cpuLimit ? Number(parsed.data.cpuLimit) : null,
        memoryLimitMb: parsed.data.memoryLimitMb ? Number(parsed.data.memoryLimitMb) : null,
        restartPolicy: parsed.data.restartPolicy,
        env: env.filter((item) => item.key.trim()),
      })
      if (parsed.data.simulateFailure && deploy.dev) await deploy.dev.setSimulateFailure(project.id, true)
      const deployment = await deploy.startDeployment(project.id)
      router.push(`/deployments/${deployment.id}`)
    } catch (error) {
      setDeploying(false)
      if (error instanceof DeployError) {
        toast({ title: error.title, description: error.detail, tone: "danger" })
        setFormError(error.detail)
      }
    }
  }

  const header = (() => {
    switch (stage) {
      case "github":
        return <PageHeader icon={FolderGit2} kicker="New project · Source" title="Import from GitHub" description={state.github.connected ? `Connected as ${state.github.accountName} · @${state.github.accountLogin}. Pick a repository and branch.` : "Connect the mock GitHub account to browse repositories."} />
      case "upload":
        return <PageHeader icon={Upload} kicker="New project · Source" title="Upload a project" description="ZIP, tar.gz, or a local folder. Nothing leaves this browser in Phase 1." />
      case "git":
      case "image":
      case "compose":
        return <PageHeader icon={stage === "git" ? GitBranch : stage === "image" ? Container : Layers} kicker="New project · Source" title={stage === "git" ? "Git repository" : stage === "image" ? "Docker image" : "Docker Compose"} description="Phase 1 records the source and simulates detection. It does not pull or build yet." />
      case "analyze":
        return <PageHeader icon={ScanSearch} kicker="New project · Analyze" title={analysis?.failed ? "Framework detection failed" : "Analyzing project"} description={analysis?.summary ?? "Reading the project files."} />
      case "configure":
        return <PageHeader icon={SlidersHorizontal} kicker="New project · Configure" title="Configure deployment" description="The common path is enough to deploy. Resource limits stay folded until you need them." />
      default:
        return <PageHeader icon={Rocket} kicker="New project" title="Deploy something new" description="Bring an application online from source code, a local project, or an existing container." />
    }
  })()
  const imported = repo?.importedProjectId ? state.projects.find((project) => project.id === repo.importedProjectId) : null

  return (
    <div className="page new-project-page">
      <ol className="np-steps" aria-label="Progress">
        {STEPS.map((step, index) => {
          const current = STEPS.findIndex((item) => item.stages.includes(stage))
          return (
            <li key={step.label} data-state={index < current ? "done" : index === current ? "current" : "todo"} aria-current={index === current ? "step" : undefined}>
              <span className="np-step-dot">{index < current ? <Check aria-hidden /> : index + 1}</span>
              <span className="np-step-label">{step.label}</span>
            </li>
          )
        })}
      </ol>
      {header}
      {stage === "choose" ? (
        <div className="np-choose">
          <section className="np-choose-cell">
            <SectionHeading title="Choose a source" />
            <div className="np-primary">
              <button type="button" className="np-card pressable" onClick={() => setStage("github")}>
                <span className="np-card-head">
                  <span className="np-card-icon np-card-icon-dark"><GitHubMark className="h-5 w-5" /></span>
                  <Tag tone="brand">Recommended</Tag>
                </span>
                <strong>Import from GitHub</strong>
                <small>Pick a repository and branch. Arcellite detects the framework and fills in the build.</small>
                <ul className="np-points">
                  <li><Check aria-hidden />Redeploy on every push</li>
                  <li><Check aria-hidden />Branch and commit on each release</li>
                  <li><Check aria-hidden />{state.github.connected ? `Connected as @${state.github.accountLogin}` : "Connect in one step"}</li>
                </ul>
                <span className="np-card-cta">Continue with GitHub<ArrowRight aria-hidden /></span>
              </button>
              <button type="button" className="np-card pressable" onClick={() => setStage("upload")}>
                <span className="np-card-head">
                  <span className="np-card-icon"><Upload aria-hidden /></span>
                  <Tag>No Git needed</Tag>
                </span>
                <strong>Upload a project</strong>
                <small>Drop a .zip archive or choose a local folder. Good for quick experiments and private code.</small>
                <ul className="np-points">
                  <li><Check aria-hidden />.zip, .tar.gz, or a folder</li>
                  <li><Check aria-hidden />Same detection as GitHub</li>
                  <li><Check aria-hidden />Upload again to redeploy</li>
                </ul>
                <span className="np-card-cta">Upload files<ArrowRight aria-hidden /></span>
              </button>
            </div>
          </section>
          <section className="np-choose-cell">
            <SectionHeading title="Deploy target" />
            <DeployTargetCard suggestedPort={suggestedPort} />
          </section>
          <section className="np-choose-cell">
            <SectionHeading title="More ways to deploy" />
            <div className="np-more">
              {([
                ["git", GitBranch, "Git repository URL", "Any public repository by URL."],
                ["image", Container, "Docker image", "Run an image from a registry."],
                ["compose", Layers, "Docker Compose", "Several services from one file."],
              ] as const).map(([target, Icon, title, body]) => (
                <button key={target} type="button" className="np-mini pressable" onClick={() => setStage(target)}>
                  <IconTile icon={Icon} tone="neutral" />
                  <span className="min-w-0 flex-1"><strong>{title}</strong><small>{body}</small></span>
                  <ArrowRight aria-hidden className="np-mini-arrow" />
                </button>
              ))}
            </div>
          <section className="np-frameworks">
            <p>Detected automatically</p>
            <div>
              {(["nextjs", "vite", "node", "express", "fastapi", "flask", "static", "dockerfile"] as const).map((key) => <Tag key={key}>{FRAMEWORKS[key].label}</Tag>)}
            </div>
          </section>
          </section>
          <section className="np-choose-cell">
            <SectionHeading title="What happens next" />
            <NextStepsCard stepIndex={0} />
          </section>
        </div>
      ) : (
      <div className="np-layout" data-stage={stage}>
      <div className="np-main">

      {stage === "github" ? (
        <section className="np-source">
          {!state.github.connected ? (
            <div className="np-connect">
              <span className="np-connect-mark"><GitHubMark className="h-7 w-7" /></span>
              <h2>Connect GitHub to import a repository</h2>
              <p>Arcellite reads code and metadata, and reports commit status. No personal access token is stored.</p>
              <Button variant="primary" onClick={() => void deploy.connectGitHub().then(() => toast({ title: "GitHub connected", description: "Roberadesissaii" }))}><GitHubMark className="h-4 w-4" />Connect GitHub</Button>
            </div>
          ) : (
            <>
              <div className="np-repo-toolbar">
                <SearchField value={repoQuery} onChange={(value) => { setRepoQuery(value); setRepoPage(0) }} placeholder="Search repositories" label="Search repositories" />
                <div className="segmented" role="group" aria-label="Visibility">
                  {(["all", "public", "private"] as const).map((item) => (
                    <button key={item} type="button" aria-pressed={repoFilter === item} onClick={() => { setRepoFilter(item); setRepoPage(0) }}>{item === "all" ? "All" : item === "public" ? "Public" : "Private"}</button>
                  ))}
                </div>
              </div>
              <div className="np-repo-account">
                <GitHubMark className="h-4 w-4" /><span><strong>{state.github.accountLogin}</strong> · {filteredRepos.length} of {state.repositories.length} repositories</span>
              </div>
              <ul className="np-repos" role="listbox" aria-label="Repositories">
                {shownRepos.map((item, index) => {
                  const selected = repo?.id === item.id
                  return (
                    <motion.li key={item.id} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.32, delay: reduced ? 0 : index * 0.03 }}>
                      <button type="button" role="option" aria-selected={selected} className="np-repo" data-selected={selected} onClick={() => { setRepo(item); setBranch(item.defaultBranch) }}>
                        <span className="np-repo-avatar" aria-hidden>{item.name.slice(0, 1).toUpperCase()}</span>
                        <span className="min-w-0 flex-1">
                          <span className="np-repo-name">{item.owner}/<strong>{item.name}</strong></span>
                          <span className="np-repo-desc">{item.description}</span>
                          <span className="np-repo-meta">
                            <span><i style={{ background: LANGUAGE_COLOR[item.language] ?? "#a1a1aa" }} aria-hidden />{item.language}</span>
                            <span><GitBranch aria-hidden />{item.branches.length} branch{item.branches.length === 1 ? "" : "es"}</span>
                            <span>Updated {formatRelative(item.updatedAt, now)}</span>
                          </span>
                        </span>
                        <span className="np-repo-tags">
                          {item.importedProjectId ? <Tag tone="info">Deployed</Tag> : null}
                          <Tag tone={item.private ? "neutral" : "success"}>{item.private ? <Lock aria-hidden className="mr-1 inline h-3 w-3" /> : null}{item.private ? "Private" : "Public"}</Tag>
                        </span>
                        <span className="np-repo-check" aria-hidden><Check /></span>
                      </button>
                    </motion.li>
                  )
                })}
                {shownRepos.length === 0 ? <li className="np-repo-empty">No repositories match “{repoQuery}”.</li> : null}
              </ul>
              <div className="np-repo-pager">
                <button type="button" className="np-repo-back" onClick={() => setStage("choose")}><ArrowRight aria-hidden className="rotate-180" />Other sources</button>
                <span className="flex-1 text-center">Showing <strong>{filteredRepos.length ? currentRepoPage * REPO_PAGE + 1 : 0}–{Math.min(filteredRepos.length, (currentRepoPage + 1) * REPO_PAGE)}</strong> of {filteredRepos.length}</span>
                <span className="flex items-center gap-1">
                  {repoPages > 1 ? Array.from({ length: repoPages }, (_, index) => (
                    <button key={index} type="button" className="np-page-dot" aria-label={`Page ${index + 1}`} aria-current={index === currentRepoPage || undefined} onClick={() => setRepoPage(index)}>{index + 1}</button>
                  )) : null}
                  <button type="button" className="icon-btn" aria-label="Previous page" disabled={currentRepoPage === 0} onClick={() => setRepoPage(currentRepoPage - 1)}><ChevronLeft aria-hidden /></button>
                  <button type="button" className="icon-btn" aria-label="Next page" disabled={currentRepoPage >= repoPages - 1} onClick={() => setRepoPage(currentRepoPage + 1)}><ChevronRight aria-hidden /></button>
                </span>
              </div>
              <AnimatePresence initial={false}>
                {repo ? (
                  <motion.div
                    key="picked"
                    className="np-repo-bar"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    transition={{ type: "spring", bounce: 0, duration: 0.34 }}
                  >
                    <span className="np-repo-avatar" aria-hidden>{repo.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="np-repo-bar-title">{repo.fullName}</p>
                      <p className="np-repo-bar-sub">{imported ? `Already deployed as ${imported.name} — this creates a preview.` : "Arcellite detects the framework on the next step."}</p>
                    </div>
                    <div className="np-repo-branch">
                      <GitBranch aria-hidden />
                      <SelectInput aria-label="Branch" value={branch} onChange={(event) => setBranch(event.target.value)}>
                        {repo.branches.map((item) => <option key={item}>{item}</option>)}
                      </SelectInput>
                    </div>
                    {imported ? <Button variant="secondary" onClick={() => router.push(`/projects/${imported.id}`)}>Open {imported.name}</Button> : null}
                    <Button
                      variant="primary"
                      onClick={() => {
                        const name = imported ? `${titleFrom(repo.name)} preview` : titleFrom(repo.name)
                        beginAnalysis(
                          { type: "github", owner: repo.owner, repo: repo.name, fullName: repo.fullName },
                          repo.files,
                          name,
                          branch,
                          imported ? "preview" : undefined,
                        )
                      }}
                    >
                      Continue<ArrowRight aria-hidden />
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>
          )}
          {!state.github.connected ? <Button className="mt-5 self-start" variant="ghost" onClick={() => setStage("choose")}><ArrowRight aria-hidden className="rotate-180" />Choose another source</Button> : null}
        </section>
      ) : null}

      {stage === "upload" ? (
        <section>
          <div className="np-upload">
          <div className="np-upload-main">
          <div
            className="np-drop"
            data-over={undefined}
            onDragOver={(event) => {
              event.preventDefault()
              event.currentTarget.dataset.over = "true"
            }}
            onDragLeave={(event) => {
              event.currentTarget.dataset.over = "false"
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.currentTarget.dataset.over = "false"
              if (event.dataTransfer.files.length) void acceptFiles(event.dataTransfer.files)
            }}
          >
            <span className="np-drop-icon"><Upload aria-hidden /></span>
            <p className="np-drop-title">Drop a project archive here</p>
            <p className="np-drop-sub">or choose a file or a whole folder from your computer</p>
            <div className="np-drop-actions">
              <label className="btn btn-primary">
                <FileArchive aria-hidden />Browse files
                <input
                  className="sr-only"
                  type="file"
                  accept=".zip,.tar,.gz,.tgz,.html"
                  onChange={(event) => {
                    if (event.target.files) void acceptFiles(event.target.files)
                  }}
                />
              </label>
              <label className="btn btn-secondary">
                <FolderUp aria-hidden />Browse folder
                <input
                  ref={folderRef}
                  className="sr-only"
                  type="file"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) void acceptFiles(event.target.files)
                  }}
                />
              </label>
            </div>
            <div className="np-drop-formats">{[".zip", ".tar.gz", ".tgz", "folder"].map((format) => <Tag key={format}>{format}</Tag>)}</div>
          </div>
          {upload ? (
            <div className="np-upload-file" data-error={Boolean(upload.error)}>
              <IconTile icon={FileArchive} tone={upload.error ? "danger" : upload.progress >= 1 ? "success" : "brand"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[13px] font-semibold">{upload.name}</p>
                  <p className="text-xs text-faint tabular-nums">{upload.error ? "Failed" : `${Math.round(upload.progress * 100)}%`} · {formatBytes(upload.size)}</p>
                </div>
                <div className="np-upload-bar" role="meter" aria-label="Upload progress" aria-valuenow={Math.round(upload.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${upload.progress * 100}%` }} />
                </div>
                {upload.error ? <p className="field-error mt-2">{upload.error}</p> : null}
              </div>
              {upload.error ? <Button variant="secondary" size="sm" onClick={() => setUpload(null)}>Retry</Button> : null}
              <button
                type="button"
                className="icon-btn"
                aria-label={upload.progress < 1 && !upload.error ? "Cancel upload" : "Remove file"}
                onClick={() => {
                  cancelUpload.current = true
                  setUpload(null)
                }}
              >
                <X aria-hidden />
              </button>
            </div>
          ) : null}
          </div>
          <div className="np-upload-tips">
            <p className="domain-label">What we look for</p>
            <ul>
              <li><Check aria-hidden /><span><strong>A manifest</strong><small>package.json, requirements.txt, or a Dockerfile.</small></span></li>
              <li><Check aria-hidden /><span><strong>A start command</strong><small>Detected from scripts, or set it on the next step.</small></span></li>
              <li><Lock aria-hidden /><span><strong>No secrets in the archive</strong><small>Add them as environment variables instead.</small></span></li>
            </ul>
          </div>
          </div>
          <Button className="mt-5 self-start" variant="ghost" onClick={() => setStage("choose")}><ArrowRight aria-hidden className="rotate-180" />Choose another source</Button>
        </section>
      ) : null}

      {stage === "git" || stage === "image" || stage === "compose" ? (() => {
        const meta = {
          git: { icon: GitBranch, label: "Repository URL", placeholder: "https://github.com/owner/repo.git", value: gitUrl, set: setGitUrl, examples: ["https://github.com/Roberadesissaii/notes-api.git", "https://gitlab.com/acme/storefront.git", "git@github.com:acme/worker.git"], tips: ["Any public HTTPS or SSH URL", "The default branch is used first", "Private repos need GitHub import"] },
          image: { icon: Container, label: "Image reference", placeholder: "ghcr.io/acme/api:1.8", value: image, set: setImage, examples: ["ghcr.io/acme/api:1.8", "nginx:1.27-alpine", "docker.io/library/redis:7"], tips: ["Registry, name, and tag", "Pinned tags make rollbacks predictable", "The container port is detected next"] },
          compose: { icon: Layers, label: "Compose file", placeholder: "docker-compose.yml", value: composeFile, set: setComposeFile, examples: ["docker-compose.yml", "compose.yaml", "deploy/compose.prod.yml"], tips: ["Each service becomes a container", "Named volumes become Storage", "Published ports are allocated for you"] },
        }[stage]
        const Icon = meta.icon
        function analyze() {
          if (stage === "git") {
            if (!gitUrl.trim()) return setFormError("Enter a repository URL.")
            beginAnalysis({ type: "git", url: gitUrl.trim() }, filesForGitUrl(gitUrl), titleFrom(gitUrl), "main")
          } else if (stage === "image") {
            if (!image.trim()) return setFormError("Enter an image reference.")
            beginAnalysis({ type: "image", image: image.trim() }, filesForImage(), titleFrom(image), null)
          } else {
            beginAnalysis({ type: "compose", filename: composeFile || "docker-compose.yml" }, filesForCompose(composeFile), titleFrom(composeFile), null)
          }
          setFormError(null)
        }
        return (
          <section className="np-source">
            <form className="np-form-card" onSubmit={(event) => { event.preventDefault(); analyze() }}>
              <div className="np-form-field">
                <label htmlFor="np-source-input">{meta.label}</label>
                <div className="np-form-input" data-error={Boolean(formError)}>
                  <Icon aria-hidden />
                  <input id="np-source-input" value={meta.value} onChange={(event) => { meta.set(event.target.value); setFormError(null) }} placeholder={meta.placeholder} autoComplete="off" spellCheck={false} autoFocus />
                  <Button type="submit" variant="primary" size="sm"><ScanSearch aria-hidden />Analyze</Button>
                </div>
                {formError ? <p className="field-error">{formError}</p> : null}
              </div>
              <div>
                <p className="domain-label">Try an example</p>
                <div className="np-examples">
                  {meta.examples.map((example) => (
                    <button key={example} type="button" data-active={meta.value === example} onClick={() => { meta.set(example); setFormError(null) }}><code>{example}</code></button>
                  ))}
                </div>
              </div>
              <ul className="np-form-tips">
                {meta.tips.map((tip) => <li key={tip}><Check aria-hidden />{tip}</li>)}
              </ul>
            </form>
            <Button className="mt-5 self-start" variant="ghost" onClick={() => setStage("choose")}><ArrowRight aria-hidden className="rotate-180" />Choose another source</Button>
          </section>
        )
      })() : null}

      {stage === "analyze" && analysis ? (() => {
        const done = reduced || shownChecks >= analysis.checks.length
        const visibleChecks = analysis.checks.slice(0, reduced ? analysis.checks.length : shownChecks)
        return (
          <section className="np-source">
            <div className="np-analyze">
              <div className="np-analyze-head">
                <span className="np-analyze-orb" data-done={done} aria-hidden>{done ? <Check /> : <ScanSearch />}</span>
                <div className="min-w-0 flex-1">
                  <p className="np-analyze-title">{done ? `Looks like ${FRAMEWORKS[analysis.framework].label}` : "Reading your project…"}</p>
                  <p className="np-analyze-sub">{done ? "Review the detected settings, then configure the deploy." : `${visibleChecks.length} of ${analysis.checks.length} checks`}</p>
                </div>
                <span className="np-analyze-count">{visibleChecks.length}/{analysis.checks.length}</span>
              </div>
              <div className="np-analyze-track" aria-hidden><motion.span animate={{ width: `${(visibleChecks.length / analysis.checks.length) * 100}%` }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} /></div>
              <ul className="np-checks">
                <AnimatePresence initial={false}>
                  {visibleChecks.map((check) => (
                    <motion.li key={check.label} data-ok={check.ok} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}>
                      <span className="np-check-icon" aria-hidden>{check.ok ? <Check /> : <X />}</span>
                      <code>{check.label}</code>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {done ? (
                <motion.dl className="np-detected" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.36 }}>
                  <div><dt>Framework</dt><dd>{FRAMEWORKS[analysis.framework].label}</dd></div>
                  <div><dt>Package manager</dt><dd>{analysis.packageManager ?? "None"}</dd></div>
                  <div><dt>Port</dt><dd><code>{analysis.internalPort}</code></dd></div>
                  <div><dt>Build</dt><dd><code>{analysis.buildCommand || "Not set"}</code></dd></div>
                  <div className="np-detected-wide"><dt>Start</dt><dd><code>{analysis.startCommand || "Not set"}</code></dd></div>
                </motion.dl>
              ) : null}
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="ghost" onClick={() => setStage(source?.type === "github" ? "github" : source?.type === "upload" ? "upload" : source?.type === "git" ? "git" : source?.type === "image" ? "image" : source?.type === "compose" ? "compose" : "choose")}><ArrowRight aria-hidden className="rotate-180" />Back</Button>
              <Button variant="primary" disabled={!done} onClick={() => setStage("configure")}>Configure deploy<ArrowRight aria-hidden /></Button>
            </div>
          </section>
        )
      })() : null}

      {stage === "configure" ? (
        <form onSubmit={form.handleSubmit(onDeploy)} className="npc">
          <section className="npc-section">
            <header className="npc-head"><span className="npc-icon"><SlidersHorizontal aria-hidden /></span><div><h2>General</h2><p>Name, environment, and where the app lives in the repository.</p></div></header>
            <Field label="Project name" error={form.formState.errors.name?.message}>
              <TextInput {...form.register("name")} />
            </Field>
            <div className="npc-grid">
              <Field label="Environment">
                <SelectInput {...form.register("environment")}>
                  <option value="production">Production</option>
                  <option value="preview">Preview</option>
                  <option value="development">Development</option>
                </SelectInput>
              </Field>
              <Field label="Root directory">
                <TextInput {...form.register("rootDirectory")} className="font-mono" />
              </Field>
            </div>
          </section>

          <section className="npc-section">
            <header className="npc-head"><span className="npc-icon"><GitBranch aria-hidden /></span><div><h2>Source</h2><p>{describeSource(source)}</p></div></header>
            {source?.type === "github" ? (
              <Field label="Branch">
                <TextInput {...form.register("branch")} className="font-mono" />
              </Field>
            ) : null}
            <label className="npc-switch">
              <input type="checkbox" className="sr-only" {...form.register("autoDeploy")} />
              <span className="toggle" aria-hidden><span /></span>
              <span><strong>Deploy when the branch updates</strong><small>Saved now. GitHub webhooks arrive in a later phase.</small></span>
            </label>
          </section>

          <section className="npc-section">
            <header className="npc-head"><span className="npc-icon"><Layers aria-hidden /></span><div><h2>Build</h2><p>Detected from your files. Change anything that looks off.</p></div></header>
            <Field label="Framework">
              <SelectInput
                {...form.register("framework")}
                onChange={(event) => {
                  const framework = event.target.value as Framework
                  form.setValue("framework", framework)
                  const profile = FRAMEWORKS[framework]
                  form.setValue("installCommand", profile.installCommand)
                  form.setValue("buildCommand", profile.buildCommand)
                  form.setValue("startCommand", profile.startCommand)
                  form.setValue("outputDirectory", profile.outputDirectory ?? "")
                  form.setValue("internalPort", profile.internalPort)
                  form.setValue("healthPath", profile.healthPath)
                }}
              >
                {FRAMEWORK_ORDER.map((item) => (
                  <option key={item} value={item}>{FRAMEWORKS[item].label}</option>
                ))}
              </SelectInput>
            </Field>
            <div className="ps-commands npc-commands">
              {([["installCommand", "Install", "pnpm install"], ["buildCommand", "Build", "pnpm build"], ["startCommand", "Start", "pnpm start"]] as const).map(([key, label, placeholder], index) => (
                <label key={key} className="ps-command">
                  <span className="ps-command-step">{index + 1}</span>
                  <span className="ps-command-label">{label}</span>
                  <span className="ps-command-input"><span aria-hidden>$</span><input {...form.register(key)} placeholder={placeholder} spellCheck={false} /></span>
                </label>
              ))}
            </div>
            {form.formState.errors.startCommand?.message ? <p className="field-error">{form.formState.errors.startCommand.message}</p> : null}
            <Field label="Output directory"><TextInput {...form.register("outputDirectory")} className="font-mono" placeholder="Not needed for this framework" /></Field>
          </section>

          <section className="npc-section">
            <header className="npc-head"><span className="npc-icon"><Server aria-hidden /></span><div><h2>Runtime</h2><p>How the container listens and how traffic reaches it.</p></div></header>
            <div className="npc-grid">
              <Field label="Internal port"><TextInput type="number" {...form.register("internalPort", { valueAsNumber: true })} /></Field>
              <Field label="Health endpoint"><TextInput {...form.register("healthPath")} className="font-mono" /></Field>
              <Field label="Exposure">
                <SelectInput {...form.register("portMode")}>
                  <option value="auto">Auto-assigned port</option>
                  <option value="custom">Custom port</option>
                </SelectInput>
              </Field>
              <Field label="Host port" hint={portMode === "auto" ? "Assigned from the next free port." : "Must be free on this server."}>
                <TextInput type="number" disabled={portMode === "auto"} {...form.register("exposedPort", { valueAsNumber: true })} />
              </Field>
            </div>
          </section>

          <section className="npc-section">
            <EnvEditor value={env} onChange={setEnv} />
          </section>

          <section className="npc-section npc-advanced" data-open={advanced}>
            <button type="button" className="npc-advanced-toggle" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>
              <span className="npc-icon"><SlidersHorizontal aria-hidden /></span>
              <span className="flex-1 text-left"><strong>Advanced</strong><small>Resource limits, restart policy, and failure testing.</small></span>
              <ChevronRight aria-hidden className="npc-chevron" />
            </button>
            {advanced ? (
              <div className="npc-grid">
                <Field label="CPU limit" hint="Leave empty for no limit.">
                  <TextInput {...form.register("cpuLimit")} inputMode="decimal" />
                </Field>
                <Field label="Memory limit (MB)">
                  <TextInput {...form.register("memoryLimitMb")} inputMode="numeric" />
                </Field>
                <Field label="Restart policy">
                  <SelectInput {...form.register("restartPolicy")}>
                    <option value="unless-stopped">unless-stopped</option>
                    <option value="on-failure">on-failure</option>
                    <option value="always">always</option>
                    <option value="no">no</option>
                  </SelectInput>
                </Field>
                {deploy.dev ? (
                  <label className="npc-switch self-end">
                    <input type="checkbox" className="sr-only" {...form.register("simulateFailure")} />
                    <span className="toggle" aria-hidden><span /></span>
                    <span><strong>Simulate a failed build</strong><small>For testing alerts.</small></span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </section>

          {formError ? <p className="field-error">{formError}</p> : null}
          <div className="npc-deploybar">
            <Button type="button" variant="ghost" onClick={() => setStage("analyze")}><ArrowRight aria-hidden className="rotate-180" />Back</Button>
            <span className="npc-deploybar-note">Builds on <strong>{homeServer(state)?.name ?? "your server"}</strong> and gets a live URL.</span>
            <Button type="submit" variant="primary" loading={deploying}><Rocket aria-hidden />Deploy</Button>
          </div>
        </form>
      ) : null}
      </div>
      <NewProjectAside stepIndex={STEPS.findIndex((item) => item.stages.includes(stage))} suggestedPort={suggestedPort} />
      </div>
      )}
      {stage === "choose" ? <RecentlyDeployed /> : null}
    </div>
  )
}

const NEXT_STEPS = [
  { title: "Choose a source", body: "GitHub, an upload, a Git URL, or a container image." },
  { title: "Analyze", body: "Arcellite reads the files and detects the framework." },
  { title: "Configure", body: "Review build commands, ports, and variables." },
  { title: "Deploy", body: "The build runs on your server and gets a live URL." },
]

function NewProjectAside({ stepIndex, suggestedPort }: { stepIndex: number; suggestedPort: number }) {
  return (
    <aside className="np-aside" aria-label="Deployment details">
      <DeployTargetCard suggestedPort={suggestedPort} labelled />
      <NextStepsCard stepIndex={stepIndex} labelled />
    </aside>
  )
}

function DeployTargetCard({ suggestedPort, labelled = false }: { suggestedPort: number; labelled?: boolean }) {
  const state = useDeployState()
  if (!state) return null
  const server = homeServer(state)
  if (!server) return null
  return (
    <section className="np-aside-card np-target-card">
      {labelled ? <p className="np-aside-label">Deploy target</p> : null}
      <div className="np-target">
        <span className="np-target-icon"><Server aria-hidden /></span>
        <span className="min-w-0 flex-1"><strong>{server.name}</strong><small>{server.os} · {server.ip}</small></span>
        <span className="np-target-status" data-status={server.status}><i aria-hidden />{server.status === "online" ? "Online" : server.status}</span>
      </div>
      <dl className="np-target-stats">
        <div><dt>CPU</dt><dd>{server.cpuPercent}%</dd><Segments value={server.cpuPercent} /></div>
        <div><dt>Memory</dt><dd>{formatGb(server.memoryUsedGb)} / {formatGb(server.memoryTotalGb)}</dd><Segments value={(server.memoryUsedGb / server.memoryTotalGb) * 100} /></div>
        <div><dt>Disk</dt><dd>{formatGb(server.storageUsedGb)} / {formatGb(server.storageTotalGb)}</dd><Segments value={(server.storageUsedGb / server.storageTotalGb) * 100} /></div>
        <div><dt>Projects</dt><dd>{state.projects.length} on this server</dd><Segments value={Math.min(100, state.projects.length * 20)} /></div>
      </dl>
      <p className="np-port"><span>Next free port</span><code>:{suggestedPort}</code></p>
    </section>
  )
}

function Segments({ value }: { value: number }) {
  const filled = Math.ceil(Math.max(0, Math.min(100, value)) / 5)
  return <span className="np-segments" aria-hidden>{Array.from({ length: 20 }, (_, index) => <i key={index} data-filled={index < filled} />)}</span>
}

function NextStepsCard({ stepIndex, labelled = false }: { stepIndex: number; labelled?: boolean }) {
  return (
    <section className="np-aside-card np-next-card">
      {labelled ? <p className="np-aside-label">What happens next</p> : null}
      <ol className="np-timeline">
        {NEXT_STEPS.map((step, index) => (
          <li key={step.title} data-state={index < stepIndex ? "done" : index === stepIndex ? "current" : "todo"}>
            <span className="np-timeline-dot">{index < stepIndex ? <Check aria-hidden /> : index + 1}</span>
            <span><strong>{step.title}</strong><small>{step.body}</small></span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function RecentlyDeployed() {
  const state = useDeployState()
  if (!state) return null
  const recent = [...state.projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3)
  if (!recent.length) return null
  return (
    <section className="np-recent-row">
      <SectionHeading title="Recently deployed" href="/projects" action="All projects" />
      <ul className="np-recent-grid">
        {recent.map((project) => (
          <li key={project.id}>
            <Link href={`/projects/${project.id}`} className="np-mini pressable">
              <IconTile icon={FolderGit2} tone="brand" />
              <span className="min-w-0 flex-1"><strong>{project.name}</strong><small>{FRAMEWORKS[project.framework].label} · <span className="capitalize">{project.environment}</span></small></span>
              <ArrowRight aria-hidden className="np-mini-arrow" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function titleFrom(value: string): string {
  const leaf = value.split("/").pop()?.replace(/\.(zip|tar|gz|tgz|git)$/gi, "") ?? value
  const words = leaf.replace(/[-_]+/g, " ").trim()
  if (!words) return "Project"
  return words.replace(/\b\w/g, (char) => char.toUpperCase())
}

function describeSource(source: ProjectSource | null): string {
  if (!source) return "No source selected."
  switch (source.type) {
    case "github":
      return source.fullName
    case "upload":
      return source.filename
    case "git":
      return source.url
    case "image":
      return source.image
    case "compose":
      return source.filename
    case "dockerfile":
      return source.filename
  }
}
