import { z } from "zod"
import { IdSchema, TimestampSchema } from "./common"

export const MetricSampleSchema = z.strictObject({ t: TimestampSchema, v: z.number() })
export type MetricSample = z.infer<typeof MetricSampleSchema>

/** Server telemetry. Series are timestamped samples at a stated resolution, oldest first. */
export const ServerMetricsDtoSchema = z.strictObject({
  serverId: IdSchema,
  available: z.boolean(),
  reason: z.string().nullable(),
  current: z.strictObject({
    cpuPercent: z.number().nonnegative(),
    memoryUsedGb: z.number().nonnegative(),
    memoryTotalGb: z.number().nonnegative(),
    storageUsedGb: z.number().nonnegative(),
    storageTotalGb: z.number().nonnegative(),
    networkMbps: z.number().nonnegative(),
  }),
  containers: z.strictObject({ total: z.number().int().nonnegative(), running: z.number().int().nonnegative() }),
  readyDeployments: z.number().int().nonnegative(),
  resolutionSeconds: z.number().int().positive(),
  series: z.strictObject({
    cpu: z.array(MetricSampleSchema),
    memory: z.array(MetricSampleSchema),
    disk: z.array(MetricSampleSchema),
    network: z.array(MetricSampleSchema),
  }),
})
export type ServerMetricsDTO = z.infer<typeof ServerMetricsDtoSchema>
