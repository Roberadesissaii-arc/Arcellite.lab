import "server-only"
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm"
import { ProjectSourceDtoSchema, type ProjectCreateRequest, type ProjectDTO, type ProjectUpdateRequest } from "@/lib/api/contracts/project"
import { ApiFailure, notFound } from "@/server/api/failure"
import { writeAudit } from "@/server/audit/audit"
import { requireCapability, type Actor } from "@/server/auth/authorize"
import { db, type Executor, type Tx } from "@/server/db/client"
import { projectBuildConfigs, projectRuntimeConfigs, projects, projectSources } from "@/server/db/schema"
import { publishEvent } from "@/server/events/publish"
import { recordActivity } from "./activity"

const selection = {
  project: projects,
  source: projectSources,
  build: projectBuildConfigs,
  runtime: projectRuntimeConfigs,
}

type ProjectRow = {
  project: typeof projects.$inferSelect
  source: typeof projectSources.$inferSelect
  build: typeof projectBuildConfigs.$inferSelect
  runtime: typeof projectRuntimeConfigs.$inferSelect
}

/** The only way a project leaves the server. No environment values, ever. */
export function toProjectDTO(row: ProjectRow): ProjectDTO {
  return {
    id: row.project.id,
    name: row.project.name,
    slug: row.project.slug,
    environment: row.project.environment as ProjectDTO["environment"],
    framework: row.project.framework as ProjectDTO["framework"],
    source: ProjectSourceDtoSchema.parse({ type: row.source.type, ...row.source.metadata }),
    branch: row.project.branch,
    rootDirectory: row.build.rootDirectory,
    packageManager: row.build.packageManager,
    installCommand: row.build.installCommand,
    buildCommand: row.build.buildCommand,
    startCommand: row.build.startCommand,
    outputDirectory: row.build.outputDirectory,
    internalPort: row.runtime.internalPort,
    exposedPort: row.runtime.exposedPort,
    portMode: row.runtime.portMode as ProjectDTO["portMode"],
    healthPath: row.runtime.healthPath,
    restartPolicy: row.runtime.restartPolicy as ProjectDTO["restartPolicy"],
    cpuLimit: row.runtime.cpuLimit,
    memoryLimitMb: row.runtime.memoryLimitMb,
    autoDeploy: row.project.autoDeploy,
    // Nothing is deployed until the agent exists.
    runtimeState: "not-deployed",
    activeDeploymentId: null,
    createdAt: row.project.createdAt.toISOString(),
    updatedAt: row.project.updatedAt.toISOString(),
  }
}

function baseQuery(executor: Executor) {
  return executor
    .select(selection)
    .from(projects)
    .innerJoin(projectSources, eq(projectSources.projectId, projects.id))
    .innerJoin(projectBuildConfigs, eq(projectBuildConfigs.projectId, projects.id))
    .innerJoin(projectRuntimeConfigs, eq(projectRuntimeConfigs.projectId, projects.id))
}

export async function findProject(executor: Executor, workspaceId: string, projectId: string): Promise<ProjectRow | null> {
  const [row] = await baseQuery(executor)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)))
    .limit(1)
  return row ?? null
}

export async function listProjects(actor: Actor): Promise<ProjectDTO[]> {
  await requireCapability(actor, "read_project")
  const rows = await baseQuery(db())
    .where(and(eq(projects.workspaceId, actor.workspaceId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.createdAt))
  return rows.map(toProjectDTO)
}

export async function getProject(actor: Actor, projectId: string): Promise<ProjectDTO> {
  await requireCapability(actor, "read_project")
  const row = await findProject(db(), actor.workspaceId, projectId)
  if (!row) throw notFound("That project")
  return toProjectDTO(row)
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "app"
}

/** Serializes project writes per workspace so slug and port checks cannot race. */
async function lockWorkspaceProjects(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`arcellite:projects:${workspaceId}`}))`)
}

async function assertPortFree(tx: Tx, workspaceId: string, port: number, exceptProjectId?: string): Promise<void> {
  const conflicts = await tx
    .select({ id: projects.id })
    .from(projectRuntimeConfigs)
    .innerJoin(projects, eq(projects.id, projectRuntimeConfigs.projectId))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        isNull(projects.archivedAt),
        eq(projectRuntimeConfigs.exposedPort, port),
        exceptProjectId ? ne(projects.id, exceptProjectId) : undefined,
      ),
    )
    .limit(1)
  if (conflicts.length) {
    throw new ApiFailure("PORT_CONFLICT", `${port} is already assigned to another project.`, { details: { field: "exposedPort", port } })
  }
}

async function uniqueSlug(tx: Tx, workspaceId: string, name: string): Promise<string> {
  const base = slugify(name)
  const taken = new Set(
    (
      await tx
        .select({ slug: projects.slug })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)))
    ).map((row) => row.slug),
  )
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export async function createProject(tx: Tx, actor: Actor, input: ProjectCreateRequest): Promise<ProjectDTO> {
  await requireCapability(actor, "manage_project")
  await lockWorkspaceProjects(tx, actor.workspaceId)
  await assertPortFree(tx, actor.workspaceId, input.exposedPort)
  const slug = await uniqueSlug(tx, actor.workspaceId, input.name)
  const [project] = await tx
    .insert(projects)
    .values({
      workspaceId: actor.workspaceId,
      name: input.name,
      slug,
      environment: input.environment,
      framework: input.framework,
      branch: input.branch,
      autoDeploy: input.autoDeploy,
      createdBy: actor.userId,
    })
    .returning({ id: projects.id })
  const { type, ...metadata } = input.source
  await tx.insert(projectSources).values({ projectId: project.id, type, metadata })
  await tx.insert(projectBuildConfigs).values({
    projectId: project.id,
    rootDirectory: input.rootDirectory,
    packageManager: input.packageManager,
    installCommand: input.installCommand,
    buildCommand: input.buildCommand,
    startCommand: input.startCommand,
    outputDirectory: input.outputDirectory,
  })
  await tx.insert(projectRuntimeConfigs).values({
    projectId: project.id,
    internalPort: input.internalPort,
    exposedPort: input.exposedPort,
    portMode: input.portMode,
    healthPath: input.healthPath,
    restartPolicy: input.restartPolicy,
    cpuLimit: input.cpuLimit,
    memoryLimitMb: input.memoryLimitMb,
  })
  await recordActivity(tx, actor, {
    action: "Project created",
    result: "success",
    objectType: "Project",
    objectId: project.id,
    objectName: input.name,
    href: `/projects/${project.id}`,
    detail: sourceSummary(input.source),
  })
  await writeAudit(tx, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "project.create", outcome: "success", objectType: "project", objectId: project.id, requestId: actor.requestId, metadata: { name: input.name, sourceType: type } })
  await publishEvent(tx, { workspaceId: actor.workspaceId, type: "project.created", objectType: "project", objectId: project.id, payload: { name: input.name } })
  const row = await findProject(tx, actor.workspaceId, project.id)
  if (!row) throw notFound("That project")
  return toProjectDTO(row)
}

export async function updateProject(actor: Actor, projectId: string, patch: ProjectUpdateRequest): Promise<ProjectDTO> {
  await requireCapability(actor, "manage_project")
  return db().transaction(async (tx) => {
    await lockWorkspaceProjects(tx, actor.workspaceId)
    const current = await findProject(tx, actor.workspaceId, projectId)
    if (!current) throw notFound("That project")
    if (patch.exposedPort !== undefined && patch.exposedPort !== current.runtime.exposedPort) {
      await assertPortFree(tx, actor.workspaceId, patch.exposedPort, projectId)
    }
    const projectFields = pick(patch, ["name", "environment", "framework", "branch", "autoDeploy"])
    await tx
      .update(projects)
      .set({ ...projectFields, updatedAt: sql`now()`, version: sql`${projects.version} + 1` })
      .where(eq(projects.id, projectId))
    const buildFields = pick(patch, ["rootDirectory", "packageManager", "installCommand", "buildCommand", "startCommand", "outputDirectory"])
    if (Object.keys(buildFields).length) await tx.update(projectBuildConfigs).set(buildFields).where(eq(projectBuildConfigs.projectId, projectId))
    const runtimeFields = pick(patch, ["internalPort", "exposedPort", "portMode", "healthPath", "restartPolicy", "cpuLimit", "memoryLimitMb"])
    if (Object.keys(runtimeFields).length) await tx.update(projectRuntimeConfigs).set(runtimeFields).where(eq(projectRuntimeConfigs.projectId, projectId))
    const name = patch.name ?? current.project.name
    const fields = Object.keys(patch)
    await recordActivity(tx, actor, { action: "Project settings updated", result: "info", objectType: "Project", objectId: projectId, objectName: name, href: `/projects/${projectId}/settings` })
    await writeAudit(tx, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "project.update", outcome: "success", objectType: "project", objectId: projectId, requestId: actor.requestId, metadata: { fields } })
    await publishEvent(tx, { workspaceId: actor.workspaceId, type: "project.updated", objectType: "project", objectId: projectId, payload: { fields } })
    const row = await findProject(tx, actor.workspaceId, projectId)
    if (!row) throw notFound("That project")
    return toProjectDTO(row)
  })
}

/** Soft delete. History, environment rows, and audit stay; no infrastructure is touched. */
export async function archiveProject(actor: Actor, projectId: string): Promise<void> {
  await requireCapability(actor, "manage_project")
  await db().transaction(async (tx) => {
    const current = await findProject(tx, actor.workspaceId, projectId)
    if (!current) throw notFound("That project")
    await tx.update(projects).set({ archivedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(projects.id, projectId))
    await recordActivity(tx, actor, { action: "Project archived", result: "warning", objectType: "Project", objectId: projectId, objectName: current.project.name, href: "/projects", detail: "Removed from this control plane. Its history is kept." })
    await writeAudit(tx, { workspaceId: actor.workspaceId, actorUserId: actor.userId, action: "project.archive", outcome: "success", objectType: "project", objectId: projectId, requestId: actor.requestId, metadata: { name: current.project.name } })
    await publishEvent(tx, { workspaceId: actor.workspaceId, type: "project.archived", objectType: "project", objectId: projectId, payload: { name: current.project.name } })
  })
}

function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {}
  for (const key of keys) if (value[key] !== undefined) out[key] = value[key]
  return out
}

function sourceSummary(source: ProjectCreateRequest["source"]): string {
  switch (source.type) {
    case "github":
      return source.fullName
    case "upload":
      return `Upload · ${source.filename}`
    case "git":
      return source.url
    case "image":
      return source.image
    case "compose":
    case "dockerfile":
      return source.filename
  }
}
