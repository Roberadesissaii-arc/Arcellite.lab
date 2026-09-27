import { z } from "zod"

/*
 * Shared wire vocabulary. These tuples are the single source for the matching
 * unions in src/lib/deploy/types.ts, so the mock model and the DTOs cannot drift.
 * Everything under src/lib/api/contracts must stay safe to import in the browser.
 */

export const FRAMEWORKS = ["nextjs", "vite", "node", "express", "fastapi", "flask", "static", "dockerfile", "compose", "unknown"] as const
export const ENVIRONMENT_NAMES = ["production", "preview", "development"] as const
export const DEPLOYMENT_STATUSES = ["queued", "preparing", "building", "deploying", "ready", "failed", "canceled", "stopped"] as const
export const DEPLOYMENT_PHASES = ["queued", "preparing", "installing", "building", "creating-image", "starting", "health-check", "ready"] as const
export const STEP_STATUSES = ["pending", "active", "completed", "failed", "canceled"] as const
export const RESTART_POLICIES = ["unless-stopped", "on-failure", "always", "no"] as const
export const SERVER_STATUSES = ["online", "degraded", "offline"] as const
export const CONTAINER_STATES = ["running", "starting", "restarting", "stopped", "exited"] as const
export const CONTAINER_ROLES = ["web", "worker", "data"] as const
export const DOMAIN_KINDS = ["local", "private", "public"] as const
export const DOMAIN_STATUSES = ["active", "pending", "invalid", "dns-required", "verifying", "issuing"] as const
export const LOG_LEVELS = ["info", "warn", "error", "debug"] as const
export const LOG_TARGETS = ["project", "deployment", "container", "server"] as const
export const PORT_MODES = ["auto", "custom"] as const
export const ACTIVITY_RESULTS = ["success", "warning", "error", "info"] as const

export const IdSchema = z.string().min(1).max(128)
export const TimestampSchema = z.iso.datetime()
export const CursorSchema = z.string().min(1).max(512)
export const PortSchema = z.number().int().min(1).max(65535)

export const FrameworkSchema = z.enum(FRAMEWORKS)
export const EnvironmentNameSchema = z.enum(ENVIRONMENT_NAMES)
export const DeploymentStatusSchema = z.enum(DEPLOYMENT_STATUSES)
export const DeploymentPhaseSchema = z.enum(DEPLOYMENT_PHASES)
export const StepStatusSchema = z.enum(STEP_STATUSES)
export const RestartPolicySchema = z.enum(RESTART_POLICIES)
export const ServerStatusSchema = z.enum(SERVER_STATUSES)
export const ContainerStateSchema = z.enum(CONTAINER_STATES)
export const ContainerRoleSchema = z.enum(CONTAINER_ROLES)
export const DomainKindSchema = z.enum(DOMAIN_KINDS)
export const DomainStatusSchema = z.enum(DOMAIN_STATUSES)
export const LogLevelSchema = z.enum(LOG_LEVELS)
export const LogTargetSchema = z.enum(LOG_TARGETS)
export const PortModeSchema = z.enum(PORT_MODES)
export const ActivityResultSchema = z.enum(ACTIVITY_RESULTS)
