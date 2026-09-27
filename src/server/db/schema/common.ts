import { timestamp } from "drizzle-orm/pg-core"

/** UTC instant. Every timestamp in the control plane is timestamptz. */
export const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" })
export const createdAt = () => instant("created_at").notNull().defaultNow()
export const updatedAt = () => instant("updated_at").notNull().defaultNow()
