import "server-only"
import { EVENTS_CHANNEL } from "./publish"
import { listen, type Listener } from "./listener"

type Wake = () => void

interface HubState {
  listener: Listener | null
  subscribers: Map<string, Set<Wake>>
}

// One LISTEN connection per process, shared by every open stream. Kept on globalThis so
// Next.js dev reloads do not leak connections.
const holder = globalThis as typeof globalThis & { __arcelliteHub?: HubState }

function state(): HubState {
  holder.__arcelliteHub ??= { listener: null, subscribers: new Map() }
  return holder.__arcelliteHub
}

function wakeAll() {
  for (const set of state().subscribers.values()) for (const wake of set) wake()
}

function onNotify(payload: string) {
  let workspaceId: unknown
  try {
    workspaceId = (JSON.parse(payload) as { workspaceId?: unknown }).workspaceId
  } catch {
    return
  }
  if (typeof workspaceId !== "string") return
  for (const wake of state().subscribers.get(workspaceId) ?? []) wake()
}

/**
 * Registers `wake` for one workspace. A notification only says "something new exists";
 * the subscriber reads the events table itself, so a missed notification is never data loss.
 */
export function subscribe(workspaceId: string, wake: Wake): () => void {
  const hub = state()
  hub.listener ??= listen(EVENTS_CHANNEL, onNotify, wakeAll)
  let set = hub.subscribers.get(workspaceId)
  if (!set) hub.subscribers.set(workspaceId, (set = new Set()))
  set.add(wake)
  return () => {
    set.delete(wake)
    if (!set.size) hub.subscribers.delete(workspaceId)
  }
}

export async function stopHub(): Promise<void> {
  const hub = state()
  const listener = hub.listener
  hub.listener = null
  hub.subscribers.clear()
  await listener?.stop()
}
