"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import Link from "next/link"
import { ArrowRight, Check, Container, GitBranch, Layers, Rocket, Server, Upload } from "lucide-react"
import { IconTile, SectionHeading, Tag } from "@/components/ui/kit"
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
import { formatBytes, formatGb } from "@/lib/deploy/format"
import { ServerStatusView } from "@/components/ui/status"
import { homeServer, nextFreePort, portTaken } from "@/lib/deploy/helpers"
import { useDeploy, useDeployState } from "@/lib/deploy/react"
import { useReducedMotion } from "motion/react"
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

export function NewProjectView() {
  const state = useDeployState()
  const deploy = useDeploy()
  const router = useRouter()
  const params = useSearchParams()
  const toast = useToast()
  const reduced = useReducedMotion()
  const initial = params.get("source")
  const [stage, setStage] = useState<Stage>(initial === "github" || initial === "upload" ? initial : "choose")
  const [repoQuery, setRepoQuery] = useState("")
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
        simulateFailure: parsed.data.simulateFailure,
      })
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
      <div className="np-layout">
      <div className="np-main">
      {stage === "choose" ? (
        <>
          <PageHeader icon={Rocket} kicker="New project" title="Deploy something new" description="Bring an application online from source code, a local project, or an existing container." />
          <section className="mt-8">
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
          <section className="mt-8">
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
          </section>
          <section className="np-frameworks">
            <p>Detected automatically</p>
            <div>
              {(["nextjs", "vite", "node", "express", "fastapi", "flask", "static", "dockerfile"] as const).map((key) => <Tag key={key}>{FRAMEWORKS[key].label}</Tag>)}
            </div>
          </section>
        </>
      ) : null}

      {stage === "github" ? (
        <section>
          <PageHeader title="Import from GitHub" description={state.github.connected ? `Connected as ${state.github.accountName} · ${state.github.accountLogin}` : "Connect the mock GitHub account to browse repositories."} />
          {!state.github.connected ? (
            <Button className="mt-6" variant="primary" onClick={() => void deploy.connectGitHub().then(() => toast({ title: "GitHub connected", description: "Roberadesissaii" }))}>
              Connect GitHub
            </Button>
          ) : (
            <>
              <TextInput className="mt-6" value={repoQuery} onChange={(event) => setRepoQuery(event.target.value)} placeholder="Search repositories" aria-label="Search repositories" />
              <ul className="panel mt-4 divide-y divide-line">
                {repos.map((item) => (
                  <li key={item.id}>
                    <button type="button" className="choice w-full" data-active={repo?.id === item.id || undefined} onClick={() => { setRepo(item); setBranch(item.defaultBranch) }}>
                      <span className="min-w-0">
                        <span className="block font-medium">{item.fullName}</span>
                        <span className="block text-sm text-muted">{item.private ? "Private" : "Public"} · {item.language} · {item.description}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {repo ? (
                <div className="mt-5">
                  {imported ? (
                    <p className="mb-3 text-sm text-muted">
                      This repository is already deployed as {imported.name}. You can open it, or deploy another environment.
                    </p>
                  ) : null}
                  <Field label="Branch">
                    <SelectInput value={branch} onChange={(event) => setBranch(event.target.value)}>
                      {repo.branches.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
              ) : null}
              <div className="mt-6 flex gap-2">
                <Button variant="ghost" onClick={() => setStage("choose")}>Back</Button>
                {imported ? (
                  <Button variant="secondary" onClick={() => router.push(`/projects/${imported.id}`)}>Open {imported.name}</Button>
                ) : null}
                <Button
                  variant="primary"
                  disabled={!repo}
                  onClick={() => {
                    if (!repo) return
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
                  Continue
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {stage === "upload" ? (
        <section>
          <PageHeader title="Upload a project" description="ZIP, tar.gz, or a local folder. Nothing leaves this browser in Phase 1." />
          <div
            className="drop-target mt-8"
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
            <p className="font-medium">Drop a project archive</p>
            <p className="mt-1 text-sm text-muted">or choose a file or folder</p>
            <div className="mt-4 flex gap-2">
              <label className="btn btn-secondary">
                Browse files
                <input
                  className="sr-only"
                  type="file"
                  accept=".zip,.tar,.gz,.tgz,.html"
                  onChange={(event) => {
                    if (event.target.files) void acceptFiles(event.target.files)
                  }}
                />
              </label>
              <label className="btn btn-ghost">
                Browse folder
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
          </div>
          {upload ? (
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{upload.name}</p>
                <p className="text-sm text-muted">{formatBytes(upload.size)}</p>
              </div>
              <div className="meter mt-3" aria-label="Upload progress" role="meter" aria-valuenow={Math.round(upload.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${upload.progress * 100}%` }} />
              </div>
              {upload.error ? <p className="field-error mt-2">{upload.error}</p> : null}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    cancelUpload.current = true
                    setUpload(null)
                  }}
                >
                  {upload.progress < 1 && !upload.error ? "Cancel" : "Remove"}
                </Button>
                {upload.error ? (
                  <Button variant="secondary" onClick={() => setUpload(null)}>
                    Retry
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <Button className="mt-6" variant="ghost" onClick={() => setStage("choose")}>Back</Button>
        </section>
      ) : null}

      {stage === "git" || stage === "image" || stage === "compose" ? (
        <section>
          <PageHeader
            title={stage === "git" ? "Git repository" : stage === "image" ? "Docker image" : "Docker Compose"}
            description="Phase 1 records the source and simulates detection. It does not pull or build yet."
          />
          <div className="mt-6">
            {stage === "git" ? (
              <Field label="Repository URL" hint="Example: https://github.com/Roberadesissaii/notes-api.git">
                <TextInput value={gitUrl} onChange={(event) => setGitUrl(event.target.value)} />
              </Field>
            ) : null}
            {stage === "image" ? (
              <Field label="Image" hint="Example: ghcr.io/acme/api:1.8">
                <TextInput value={image} onChange={(event) => setImage(event.target.value)} />
              </Field>
            ) : null}
            {stage === "compose" ? (
              <Field label="Compose file">
                <TextInput value={composeFile} onChange={(event) => setComposeFile(event.target.value)} />
              </Field>
            ) : null}
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="ghost" onClick={() => setStage("choose")}>Back</Button>
            <Button
              variant="primary"
              onClick={() => {
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
              }}
            >
              Analyze
            </Button>
          </div>
          {formError ? <p className="field-error mt-3">{formError}</p> : null}
        </section>
      ) : null}

      {stage === "analyze" && analysis ? (
        <section>
          <PageHeader title={analysis.failed ? "Framework detection failed" : "Analyzing project"} description={analysis.summary} />
          <ul className="mt-8 space-y-2">
            {analysis.checks.slice(0, reduced ? analysis.checks.length : shownChecks).map((check) => (
              <li key={check.label} className="flex items-center gap-3 text-sm">
                <span aria-hidden className={check.ok ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"}>{check.ok ? "✓" : "!"}</span>
                <span className="font-mono text-[13px]">{check.label}</span>
              </li>
            ))}
          </ul>
          {(reduced || shownChecks >= analysis.checks.length) ? (
            <dl className="mt-8 grid gap-3 text-sm">
              <Row term="Detected" value={FRAMEWORKS[analysis.framework].label} />
              <Row term="Package manager" value={analysis.packageManager ?? "None"} />
              <Row term="Build command" value={analysis.buildCommand || "Not set"} />
              <Row term="Start command" value={analysis.startCommand || "Not set"} />
              <Row term="Port" value={String(analysis.internalPort)} />
            </dl>
          ) : null}
          <div className="mt-8 flex gap-2">
            <Button variant="ghost" onClick={() => setStage(source?.type === "github" ? "github" : source?.type === "upload" ? "upload" : "choose")}>Back</Button>
            <Button variant="primary" disabled={!reduced && shownChecks < analysis.checks.length} onClick={() => setStage("configure")}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {stage === "configure" ? (
        <form
          onSubmit={form.handleSubmit(onDeploy)}
          className="mt-2"
        >
          <PageHeader title="Configure deployment" description="The common path is enough to deploy. Resource limits stay folded until you need them." />
          <div className="mt-8 space-y-8">
            <section className="panel space-y-4 p-5">
              <h2 className="text-[15px] font-semibold">General</h2>
              <Field label="Project name" error={form.formState.errors.name?.message}>
                <TextInput {...form.register("name")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Environment">
                  <SelectInput {...form.register("environment")}>
                    <option value="production">Production</option>
                    <option value="preview">Preview</option>
                    <option value="development">Development</option>
                  </SelectInput>
                </Field>
                <Field label="Root directory">
                  <TextInput {...form.register("rootDirectory")} />
                </Field>
              </div>
            </section>
            <section className="panel space-y-4 p-5">
              <h2 className="text-[15px] font-semibold">Source</h2>
              <p className="text-sm text-muted">{describeSource(source)}</p>
              {source?.type === "github" ? (
                <Field label="Branch">
                  <TextInput {...form.register("branch")} />
                </Field>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("autoDeploy")} />
                Deploy when the branch updates
              </label>
              <p className="field-hint">The preference is saved. GitHub webhooks arrive in a later phase.</p>
            </section>
            <section className="panel space-y-4 p-5">
              <h2 className="text-[15px] font-semibold">Build</h2>
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
              <Field label="Install command"><TextInput {...form.register("installCommand")} /></Field>
              <Field label="Build command"><TextInput {...form.register("buildCommand")} /></Field>
              <Field label="Start command" error={form.formState.errors.startCommand?.message}><TextInput {...form.register("startCommand")} /></Field>
              <Field label="Output directory"><TextInput {...form.register("outputDirectory")} /></Field>
            </section>
            <section className="panel space-y-4 p-5">
              <h2 className="text-[15px] font-semibold">Runtime</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Internal port"><TextInput type="number" {...form.register("internalPort", { valueAsNumber: true })} /></Field>
                <Field label="Health endpoint"><TextInput {...form.register("healthPath")} /></Field>
              </div>
              <Field label="Exposure">
                <SelectInput {...form.register("portMode")}>
                  <option value="auto">Auto-assigned port</option>
                  <option value="custom">Custom port</option>
                </SelectInput>
              </Field>
              <Field label="Host port" hint={portMode === "auto" ? "Assigned from the next free port on this server." : "Must be free on this server."}>
                <TextInput type="number" disabled={portMode === "auto"} {...form.register("exposedPort", { valueAsNumber: true })} />
              </Field>
            </section>
            <EnvEditor value={env} onChange={setEnv} />
            <section>
              <button type="button" className="text-sm font-medium text-muted" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>
                {advanced ? "Hide advanced" : "Advanced"}
              </button>
              {advanced ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  <label className="flex items-center gap-2 self-end text-sm">
                    <input type="checkbox" {...form.register("simulateFailure")} />
                    Simulate a failed build
                  </label>
                </div>
              ) : null}
            </section>
          </div>
          {formError ? <p className="field-error mt-4">{formError}</p> : null}
          <div className="mt-8 flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setStage("analyze")}>Back</Button>
            <Button type="submit" variant="primary" loading={deploying}>Deploy</Button>
          </div>
        </form>
      ) : null}
      </div>
      <NewProjectAside stepIndex={STEPS.findIndex((item) => item.stages.includes(stage))} suggestedPort={suggestedPort} />
      </div>
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
  const state = useDeployState()
  if (!state) return null
  const server = homeServer(state)
  const recent = [...state.projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3)
  return (
    <aside className="np-aside" aria-label="Deployment details">
      {server ? (
        <section className="np-aside-card">
          <p className="np-aside-label">Deploy target</p>
          <div className="np-target">
            <IconTile icon={Server} tone="brand" />
            <span className="min-w-0 flex-1"><strong>{server.name}</strong><small>{server.os} · {server.ip}</small></span>
            <ServerStatusView value={server.status} />
          </div>
          <dl className="np-target-stats">
            <div><dt>CPU</dt><dd>{server.cpuPercent}%</dd><span className="meter"><span style={{ width: `${server.cpuPercent}%` }} /></span></div>
            <div><dt>Memory</dt><dd>{formatGb(server.memoryUsedGb)} / {formatGb(server.memoryTotalGb)}</dd><span className="meter"><span style={{ width: `${server.memoryUsedGb / server.memoryTotalGb * 100}%` }} /></span></div>
          </dl>
          <p className="np-port"><span>Next free port</span><code>:{suggestedPort}</code></p>
        </section>
      ) : null}
      <section className="np-aside-card">
        <p className="np-aside-label">What happens next</p>
        <ol className="np-timeline">
          {NEXT_STEPS.map((step, index) => (
            <li key={step.title} data-state={index < stepIndex ? "done" : index === stepIndex ? "current" : "todo"}>
              <span className="np-timeline-dot">{index < stepIndex ? <Check aria-hidden /> : index + 1}</span>
              <span><strong>{step.title}</strong><small>{step.body}</small></span>
            </li>
          ))}
        </ol>
      </section>
      {recent.length ? (
        <section className="np-aside-card">
          <p className="np-aside-label">Recently deployed</p>
          <ul className="np-recent">
            {recent.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`}>
                  <span className="min-w-0 flex-1"><strong>{project.name}</strong><small>{FRAMEWORKS[project.framework].label} · <span className="capitalize">{project.environment}</span></small></span>
                  <ArrowRight aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3">
      <dt className="text-muted">{term}</dt>
      <dd className="font-mono text-[13px]">{value}</dd>
    </div>
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
