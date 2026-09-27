import { z } from "zod"
import { IdSchema, ServerStatusSchema, TimestampSchema } from "./common"

/**
 * A server as the workspace sees it: registration plus the latest observed facts.
 * Raw Docker objects never cross this boundary.
 */
export const ServerDtoSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  status: ServerStatusSchema,
  os: z.string(),
  arch: z.string(),
  network: z.strictObject({
    ip: z.string(),
    iface: z.string(),
    cidr: z.string(),
    gateway: z.string(),
    dns: z.array(z.string()),
  }),
  cpuCount: z.number().int().positive(),
  memoryTotalGb: z.number().nonnegative(),
  storageTotalGb: z.number().nonnegative(),
  usage: z.strictObject({
    cpuPercent: z.number().nonnegative(),
    memoryUsedGb: z.number().nonnegative(),
    storageUsedGb: z.number().nonnegative(),
    networkMbps: z.number().nonnegative(),
  }),
  docker: z.strictObject({ version: z.string(), status: z.enum(["running", "unavailable"]) }),
  agent: z.strictObject({ version: z.string(), status: z.enum(["connected", "offline"]) }),
  startedAt: TimestampSchema,
  observedAt: TimestampSchema.nullable(),
})
export type ServerDTO = z.infer<typeof ServerDtoSchema>
