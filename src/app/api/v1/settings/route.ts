import { SettingsPatchSchema } from "@/lib/api/contracts/settings"
import { sessionRoute } from "@/server/api/handler"
import { getSettings, updateSettings } from "@/server/services/settings"

export const GET = sessionRoute(async ({ actor }) => ({ body: await getSettings(actor) }))

export const PATCH = sessionRoute(async (ctx) => ({ body: await updateSettings(ctx.actor, await ctx.body(SettingsPatchSchema)) }))
