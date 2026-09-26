import type { AnalysisResult, Framework, GitRepository } from "./types"

export interface FrameworkProfile {
  label: string
  packageManager: string | null
  installCommand: string
  buildCommand: string
  startCommand: string
  outputDirectory: string | null
  internalPort: number
  healthPath: string
}

export const FRAMEWORKS: Record<Framework, FrameworkProfile> = {
  nextjs: {
    label: "Next.js",
    packageManager: "pnpm",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
    outputDirectory: ".next",
    internalPort: 3000,
    healthPath: "/",
  },
  vite: {
    label: "Vite",
    packageManager: "pnpm",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm preview --host 0.0.0.0 --port 4173",
    outputDirectory: "dist",
    internalPort: 4173,
    healthPath: "/",
  },
  node: {
    label: "Node.js",
    packageManager: "pnpm",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "pnpm start",
    outputDirectory: "dist",
    internalPort: 3000,
    healthPath: "/health",
  },
  express: {
    label: "Express",
    packageManager: "pnpm",
    installCommand: "pnpm install",
    buildCommand: "pnpm build",
    startCommand: "node dist/server.js",
    outputDirectory: "dist",
    internalPort: 3000,
    healthPath: "/health",
  },
  fastapi: {
    label: "FastAPI",
    packageManager: "pip",
    installCommand: "pip install -r requirements.txt",
    buildCommand: "python -m compileall app",
    startCommand: "uvicorn app.main:app --host 0.0.0.0 --port 8000",
    outputDirectory: null,
    internalPort: 8000,
    healthPath: "/health",
  },
  flask: {
    label: "Flask",
    packageManager: "pip",
    installCommand: "pip install -r requirements.txt",
    buildCommand: "python -m compileall .",
    startCommand: "gunicorn -b 0.0.0.0:8000 app:app",
    outputDirectory: null,
    internalPort: 8000,
    healthPath: "/health",
  },
  static: {
    label: "Static HTML",
    packageManager: null,
    installCommand: "",
    buildCommand: "",
    startCommand: "serve the output directory",
    outputDirectory: ".",
    internalPort: 8080,
    healthPath: "/",
  },
  dockerfile: {
    label: "Dockerfile",
    packageManager: null,
    installCommand: "",
    buildCommand: "docker build -t app:latest .",
    startCommand: "docker run --rm -p 8080:8080 app:latest",
    outputDirectory: null,
    internalPort: 8080,
    healthPath: "/",
  },
  compose: {
    label: "Docker Compose",
    packageManager: null,
    installCommand: "",
    buildCommand: "docker compose build",
    startCommand: "docker compose up -d",
    outputDirectory: null,
    internalPort: 8080,
    healthPath: "/",
  },
  unknown: {
    label: "Unknown",
    packageManager: null,
    installCommand: "",
    buildCommand: "",
    startCommand: "",
    outputDirectory: null,
    internalPort: 3000,
    healthPath: "/",
  },
}

export const FRAMEWORK_ORDER: Framework[] = [
  "nextjs",
  "vite",
  "express",
  "node",
  "fastapi",
  "flask",
  "static",
  "dockerfile",
  "compose",
  "unknown",
]

function has(files: string[], pattern: RegExp): boolean {
  return files.some((file) => pattern.test(file))
}

export function detectFramework(files: string[]): { framework: Framework; evidence: string[]; failed: boolean } {
  const evidence: string[] = []
  if (has(files, /(^|\/)docker-compose\.ya?ml$/i) || has(files, /(^|\/)compose\.ya?ml$/i)) {
    evidence.push("Docker Compose file")
    return { framework: "compose", evidence, failed: false }
  }
  if (has(files, /(^|\/)Dockerfile$/)) {
    evidence.push("Dockerfile")
    return { framework: "dockerfile", evidence, failed: false }
  }
  if (has(files, /(^|\/)next\.config\.(ts|js|mjs)$/)) {
    evidence.push("next.config")
    if (has(files, /^app\/|^src\/app\//)) evidence.push("app/")
    return { framework: "nextjs", evidence, failed: false }
  }
  if (has(files, /(^|\/)vite\.config\.(ts|js|mjs)$/)) {
    evidence.push("vite.config")
    return { framework: "vite", evidence, failed: false }
  }
  if (has(files, /(^|\/)requirements\.txt$/) || has(files, /(^|\/)pyproject\.toml$/)) {
    if (has(files, /fastapi|app\/main\.py/i)) {
      evidence.push("FastAPI application")
      return { framework: "fastapi", evidence, failed: false }
    }
    if (has(files, /flask|app\.py/i)) {
      evidence.push("Flask application")
      return { framework: "flask", evidence, failed: false }
    }
  }
  if (has(files, /(^|\/)package\.json$/)) {
    if (has(files, /server\.(ts|js)$/) || has(files, /express/i)) {
      evidence.push("package.json")
      evidence.push("server entry")
      return { framework: "express", evidence, failed: false }
    }
    evidence.push("package.json")
    return { framework: "node", evidence, failed: false }
  }
  if (has(files, /(^|\/)index\.html$/)) {
    evidence.push("index.html")
    return { framework: "static", evidence, failed: false }
  }
  return { framework: "unknown", evidence, failed: true }
}

export function analysisFromFiles(files: string[], rootDirectory = "."): AnalysisResult {
  const detected = detectFramework(files)
  const profile = FRAMEWORKS[detected.framework]
  const checks = files.slice(0, 6).map((file) => ({ label: file, ok: true }))
  if (detected.failed) {
    checks.push({ label: "framework manifest", ok: false })
  }
  return {
    framework: detected.framework,
    failed: detected.failed,
    summary: detected.failed
      ? "No framework manifest was recognized. Choose a framework to continue."
      : `Detected ${profile.label}.`,
    checks: checks.length ? checks : [{ label: "source", ok: !detected.failed }],
    packageManager: profile.packageManager,
    installCommand: profile.installCommand,
    buildCommand: profile.buildCommand,
    startCommand: profile.startCommand,
    outputDirectory: profile.outputDirectory,
    internalPort: profile.internalPort,
    healthPath: profile.healthPath,
    rootDirectory,
    files,
  }
}

export function analysisFromRepository(repo: Pick<GitRepository, "files" | "framework">): AnalysisResult {
  const fromFiles = analysisFromFiles(repo.files)
  if (!fromFiles.failed) return fromFiles
  return analysisFromFiles(repo.files.length ? repo.files : fallbackFiles(repo.framework))
}

export function filesForUpload(filename: string): string[] {
  const name = filename.toLowerCase()
  if (name.includes("unknown") || name.includes("misc") || name.includes("random")) return ["README.md"]
  if (name.includes("compose")) return ["docker-compose.yml", "Dockerfile", "app/main.py"]
  if (name.includes("docker")) return ["Dockerfile", "app/server.js"]
  if (name.includes("flask")) return ["app.py", "requirements.txt", "templates/index.html"]
  if (name.includes("fastapi") || name.includes("api")) return ["requirements.txt", "app/main.py", "pyproject.toml"]
  if (name.includes("vite")) return ["package.json", "vite.config.ts", "index.html", "src/main.tsx"]
  if (name.includes("express") || name.includes("worker")) return ["package.json", "src/server.ts"]
  if (name.includes("static") || name.includes("html")) return ["index.html", "styles.css"]
  if (name.endsWith(".html")) return ["index.html"]
  return ["package.json", "pnpm-lock.yaml", "next.config.ts", "app/page.tsx"]
}

function fallbackFiles(framework: Framework): string[] {
  switch (framework) {
    case "nextjs":
      return ["package.json", "next.config.ts", "app/page.tsx"]
    case "vite":
      return ["package.json", "vite.config.ts", "index.html"]
    case "express":
      return ["package.json", "src/server.ts"]
    case "node":
      return ["package.json", "src/index.ts"]
    case "fastapi":
      return ["requirements.txt", "app/main.py"]
    case "flask":
      return ["requirements.txt", "app.py"]
    case "static":
      return ["index.html"]
    case "dockerfile":
      return ["Dockerfile"]
    case "compose":
      return ["docker-compose.yml"]
    case "unknown":
      return ["README.md"]
  }
}

export function filesForGitUrl(url: string): string[] {
  const value = url.toLowerCase()
  if (value.includes("fastapi") || value.includes("api")) return filesForUpload("api")
  if (value.includes("vite")) return filesForUpload("vite")
  if (value.includes("flask")) return filesForUpload("flask")
  return filesForUpload("next-app.zip")
}

export function filesForImage(): string[] {
  return ["Dockerfile"]
}

export function filesForCompose(filename: string): string[] {
  return [filename || "docker-compose.yml", "Dockerfile"]
}
