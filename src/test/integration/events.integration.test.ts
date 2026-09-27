import { sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/server/db/client"
import { events, sessions } from "@/server/db/schema"
import { eventStream } from "@/server/events/stream"
import { resolveSession } from "@/server/auth/session"
import { addMember, Browser, bootstrapOwner, createProject, json, resetDatabase, routes, type RouteHandler } from "./harness"

interface Frame {
  id?: string
  event?: string
  data?: string
  comment?: string
}

/** Reads SSE frames from a response until `until` is satisfied or the timeout passes. */
class StreamReader {
  private buffer = ""
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>
  private readonly decoder = new TextDecoder()
  frames: Frame[] = []
  done = false

  constructor(body: ReadableStream<Uint8Array>) {
    this.reader = body.getReader()
  }

  async until(predicate: (frames: Frame[]) => boolean, timeoutMs = 5000): Promise<Frame[]> {
    const deadline = Date.now() + timeoutMs
    while (!predicate(this.frames)) {
      if (this.done) throw new Error(`stream ended; frames: ${JSON.stringify(this.frames)}`)
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`timed out; frames: ${JSON.stringify(this.frames)}`)
      const next = await Promise.race([this.reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining))])
      if (next === null) continue
      if (next.done) {
        this.done = true
        continue
      }
      this.buffer += this.decoder.decode(next.value, { stream: true })
      let index: number
      while ((index = this.buffer.indexOf("\n\n")) >= 0) {
        const raw = this.buffer.slice(0, index)
        this.buffer = this.buffer.slice(index + 2)
        const frame: Frame = {}
        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) frame.comment = line.slice(1).trim()
          else if (line.startsWith("id: ")) frame.id = line.slice(4)
          else if (line.startsWith("event: ")) frame.event = line.slice(7)
          else if (line.startsWith("data: ")) frame.data = line.slice(6)
        }
        this.frames.push(frame)
      }
    }
    return this.frames
  }

  dataFrames() {
    return this.frames.filter((frame) => frame.data && !frame.event).map((frame) => JSON.parse(frame.data!) as { seq: number; type: string; objectId: string })
  }

  async cancel() {
    await this.reader.cancel().catch(() => {})
  }
}

async function open(browser: Browser, lastEventId?: string) {
  const controller = new AbortController()
  const response = await browser.call(routes.stream.GET as RouteHandler, "/api/v1/events/stream", {
    headers: lastEventId === undefined ? {} : { "last-event-id": lastEventId },
    signal: controller.signal,
  })
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")
  return { reader: new StreamReader(response.body!), close: () => controller.abort() }
}

let owner: Browser
beforeEach(async () => {
  await resetDatabase()
  owner = await bootstrapOwner()
})

describe("event stream", () => {
  it("delivers a change immediately over LISTEN/NOTIFY", async () => {
    const stream = await open(owner)
    await stream.reader.until((frames) => frames.some((frame) => frame.event === "ready"))
    const project = await json<{ id: string }>(await createProject(owner, { name: "Live" }))
    await stream.reader.until(() => stream.reader.dataFrames().some((event) => event.type === "project.created" && event.objectId === project.id), 3000)
    stream.close()
    await stream.reader.cancel()
  })

  it("29. replays events after Last-Event-ID, in order, without earlier ones", async () => {
    await createProject(owner, { name: "One" })
    const [{ seq: cursor }] = await db().select({ seq: sql<number>`max(seq)::int` }).from(events)
    const two = await json<{ id: string }>(await createProject(owner, { name: "Two" }))
    const three = await json<{ id: string }>(await createProject(owner, { name: "Three" }))
    const stream = await open(owner, String(cursor))
    await stream.reader.until(() => stream.reader.dataFrames().length >= 2)
    const replayed = stream.reader.dataFrames()
    expect(replayed.map((event) => event.objectId)).toEqual([two.id, three.id])
    expect(replayed.every((event) => event.seq > cursor)).toBe(true)
    expect(replayed.map((event) => event.seq)).toEqual([...replayed.map((event) => event.seq)].sort((a, b) => a - b))
    // The SSE id is the seq, so the browser's next Last-Event-ID continues from here.
    expect(stream.reader.frames.filter((frame) => frame.data && !frame.event).map((frame) => Number(frame.id))).toEqual(replayed.map((event) => event.seq))
    stream.close()
    await stream.reader.cancel()
  })

  it("30. never sends workspace B's events to workspace A", async () => {
    const other = await addMember("owner", "b@example.com", { workspaceName: "Workspace B" })
    const streamA = await open(owner, "0")
    const streamB = await open(other, "0")
    const mine = await json<{ id: string }>(await createProject(owner, { name: "A only" }))
    const theirs = await json<{ id: string }>(await createProject(other, { name: "B only" }))
    await streamA.reader.until(() => streamA.reader.dataFrames().some((event) => event.objectId === mine.id))
    await streamB.reader.until(() => streamB.reader.dataFrames().some((event) => event.objectId === theirs.id))
    // Give any stray notification time to arrive.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(streamA.reader.dataFrames().some((event) => event.objectId === theirs.id)).toBe(false)
    expect(streamB.reader.dataFrames().some((event) => event.objectId === mine.id)).toBe(false)
    // Replay is workspace-scoped too.
    const replayA = await open(owner, "0")
    await replayA.reader.until(() => replayA.reader.dataFrames().some((event) => event.objectId === mine.id))
    expect(replayA.reader.dataFrames().some((event) => event.objectId === theirs.id)).toBe(false)
    for (const stream of [streamA, streamB, replayA]) {
      stream.close()
      await stream.reader.cancel()
    }
  })

  it("asks the client to resync when the gap is too large or the cursor is invalid", async () => {
    const [{ id: workspaceId }] = await db().execute<{ id: string }>(sql`select id from workspaces limit 1`).then((result) => result.rows)
    await db().execute(sql`insert into events (workspace_id, type, object_type) select ${workspaceId}, 'project.updated', 'project' from generate_series(1, 520)`)
    const tooFar = await open(owner, "0")
    await tooFar.reader.until((frames) => frames.some((frame) => frame.event === "resync"))
    expect(tooFar.reader.dataFrames()).toHaveLength(0)
    tooFar.close()
    await tooFar.reader.cancel()

    const future = await open(owner, "999999999")
    await future.reader.until((frames) => frames.some((frame) => frame.event === "resync"))
    future.close()
    await future.reader.cancel()

    // A malformed Last-Event-ID is ignored: the stream starts at the latest event.
    const junk = await open(owner, "1; drop table events")
    await junk.reader.until((frames) => frames.some((frame) => frame.event === "ready"))
    expect(junk.reader.dataFrames()).toHaveLength(0)
    junk.close()
    await junk.reader.cancel()
  })

  it("resyncs a cursor older than pruned history", async () => {
    await createProject(owner, { name: "Old" })
    await createProject(owner, { name: "Newer" })
    const [{ seq: oldest }] = await db().select({ seq: sql<number>`min(seq)::int` }).from(events)
    await db().execute(sql`delete from events where seq = ${oldest}`)
    const stream = await open(owner, String(oldest - 1))
    await stream.reader.until((frames) => frames.some((frame) => frame.event === "resync"))
    stream.close()
    await stream.reader.cancel()
  })

  it("closes when the session is revoked, and sends heartbeats meanwhile", async () => {
    const session = await resolveSession(db(), owner.session)
    const controller = new AbortController()
    const reader = new StreamReader(
      eventStream({ session: session!, sessionToken: owner.session, lastEventId: null, signal: controller.signal, heartbeatMs: 50, sessionCheckMs: 100 }),
    )
    await reader.until((frames) => frames.some((frame) => frame.comment === "heartbeat"))
    await db().update(sessions).set({ revokedAt: sql`now()` })
    await reader.until((frames) => frames.some((frame) => frame.event === "session-expired"), 3000)
    await reader.until(() => reader.done, 3000)
  })

  it("closes at the session's absolute expiry", async () => {
    const session = await resolveSession(db(), owner.session)
    const reader = new StreamReader(
      eventStream({ session: { ...session!, expiresAt: new Date(Date.now() + 150) }, sessionToken: owner.session, lastEventId: null, signal: new AbortController().signal }),
    )
    await reader.until((frames) => frames.some((frame) => frame.event === "session-expired"), 3000)
    await reader.until(() => reader.done, 3000)
  })

  it("limits open streams per session and frees the slot on disconnect", async () => {
    const streams = []
    for (let index = 0; index < 5; index += 1) streams.push(await open(owner))
    const sixth = await owner.call(routes.stream.GET as RouteHandler, "/api/v1/events/stream")
    expect(sixth.status).toBe(429)
    const first = streams.shift()!
    first.close()
    await first.reader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const replacement = await open(owner)
    streams.push(replacement)
    for (const stream of streams) {
      stream.close()
      await stream.reader.cancel()
    }
  })
})
