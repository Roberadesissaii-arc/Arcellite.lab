import { describe, expect, it } from "vitest"
import { answerProjectQuestion } from "./assistant"
import { createInitialState } from "./fixtures"

const now = Date.parse("2026-09-25T12:00:00Z")
describe("local project assistant", () => {
  it("scopes status to the selected project without exposing environment values or changing state", () => {
    const state = createInitialState(now)
    const project = state.projects[0]
    project.env.push({id:"secret",key:"TOKEN",value:"private-test-value",secret:true,scope:"all"})
    const before = JSON.stringify(state)
    const reply = answerProjectQuestion(state,"Is my project alive?",project.id,now)
    expect(reply.text).toContain(project.name)
    expect(reply.text).not.toContain(state.projects[1].name)
    expect(reply.text).not.toContain("private-test-value")
    expect(JSON.stringify(state)).toBe(before)
    expect(reply.links[0].href).toBe(`/projects/${project.id}`)
  })
  it("reports offline resources and unresolved DNS without inventing uptime", () => {
    const state = createInitialState(now)
    state.servers[0].status = "offline"
    expect(answerProjectQuestion(state,"Check server resources","all",now).text).toContain("Reconnect")
    const reply = answerProjectQuestion(state,"What needs attention?","all",now)
    expect(reply.text).toContain("offline")
    expect(reply.links.some(link=>link.href==="/domains")).toBe(true)
  })
  it("declines unsupported questions and handles an empty workspace", () => {
    const state = createInitialState(now)
    expect(answerProjectQuestion(state,"Write a poem","all",now).text).toContain("cannot execute commands or answer general questions")
    state.projects=[]
    expect(answerProjectQuestion(state,"What is running?","all",now).text).toContain("No projects yet")
  })
})
