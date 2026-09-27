import { z } from "zod"
import { DomainKindSchema, DomainStatusSchema, IdSchema, PortSchema, TimestampSchema } from "./common"

export const DnsRecordDtoSchema = z.strictObject({
  type: z.enum(["A", "CNAME", "TXT"]),
  host: z.string().min(1),
  value: z.string().min(1),
  purpose: z.string(),
})

/**
 * Certificate state. `simulated` is true while no certificate authority is involved,
 * so a client can never mistake a simulated certificate for a real one.
 */
export const DomainTlsDtoSchema = z.strictObject({
  status: z.enum(["none", "pending", "active", "failed"]),
  simulated: z.boolean(),
})

export const DomainDtoSchema = z.strictObject({
  id: IdSchema,
  hostname: z.string().min(1).max(253),
  kind: DomainKindSchema,
  projectId: IdSchema,
  targetPort: PortSchema,
  status: DomainStatusSchema,
  tls: DomainTlsDtoSchema,
  records: z.array(DnsRecordDtoSchema),
  error: z.string().nullable(),
  createdAt: TimestampSchema,
  verifiedAt: TimestampSchema.nullable(),
})
export type DomainDTO = z.infer<typeof DomainDtoSchema>
