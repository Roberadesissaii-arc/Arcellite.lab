import { z } from "zod"
import { ContainerRoleSchema, ContainerStateSchema, IdSchema, PortSchema, RestartPolicySchema, TimestampSchema } from "./common"

export const ContainerPortDtoSchema = z.strictObject({
  host: PortSchema.nullable(),
  container: PortSchema,
  protocol: z.enum(["tcp", "udp"]),
})

/**
 * A container observed on a server. `managed` is false for containers Arcellite did not
 * create: they are listed for context but must stay read-only.
 */
export const ContainerDtoSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  serverId: IdSchema,
  projectId: IdSchema.nullable(),
  managed: z.boolean(),
  role: ContainerRoleSchema,
  image: z.string().min(1),
  state: ContainerStateSchema,
  startedAt: TimestampSchema.nullable(),
  stateChangedAt: TimestampSchema.nullable(),
  cpuPercent: z.number().nonnegative(),
  memoryMb: z.number().nonnegative(),
  ports: z.array(ContainerPortDtoSchema),
  command: z.string(),
  restartPolicy: RestartPolicySchema,
})
export type ContainerDTO = z.infer<typeof ContainerDtoSchema>
