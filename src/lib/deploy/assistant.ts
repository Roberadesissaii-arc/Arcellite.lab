import type { AppState } from "./types"
import { latestDeployment, projectBadge } from "./helpers"

export interface AssistantReply { text: string; links: { label: string; href: string }[] }

/** Read-only Phase 1 assistant. Never sends workspace data to an external model. */
export function answerProjectQuestion(state: AppState, question: string, projectId: string, now: number): AssistantReply {
  const q = question.toLowerCase()
  const selected = state.projects.find(p => p.id === projectId)
  const named = state.projects.find(p => q.includes(p.name.toLowerCase()))
  const project = named ?? selected
  const projects = project ? [project] : state.projects
  const deployments = state.deployments.filter(d => projects.some(p => p.id === d.projectId))
  const links = project ? [{ label: `Open ${project.name}`, href: `/projects/${project.id}` }] : [{ label: "View projects", href: "/projects" }]
  if (/domain|dns|ssl|tls|hostname/.test(q)) {
    const domains = state.domains.filter(d => !project || d.projectId === project.id)
    return { text: domains.length ? domains.map(d => `${d.name}: ${d.status.replaceAll('-', ' ')}. TLS: ${d.ssl.replaceAll('-', ' ')}.${d.error ? ` ${d.error}` : ''}`).join('\n') + '\nOpen Domains for DNS records and verification. Domain and TLS checks are simulated in Phase 1.' : 'This project has no custom domains. Its local endpoint remains available while its container is running.', links: [...links, { label: "Manage domains", href: "/domains" }] }
  }
  if (/server|cpu|memory|storage|resource/.test(q)) {
    return { text: state.servers.map(s => `${s.name} is ${s.status}. ${s.status === 'offline' ? 'Reconnect the server before deploying.' : `CPU ${s.cpuPercent}%; memory ${s.memoryUsedGb} / ${s.memoryTotalGb} GB; storage ${s.storageUsedGb} / ${s.storageTotalGb} GB.`}`).join('\n'), links: [{ label: "Inspect servers", href: "/servers" }, { label: "View metrics", href: "/metrics" }] }
  }
  if (/fail|error|attention|wrong|issue|problem/.test(q)) {
    const failed = projects.map(p => ({p,d:latestDeployment(deployments,p.id,now)})).filter(({d}) => d?.status === 'failed')
    const offline = state.servers.filter(s => s.status === 'offline')
    const pending = state.domains.filter(d => (!project || d.projectId === project.id) && ['dns-required','invalid'].includes(d.status))
    return { text: [...failed.map(({p,d}) => `${p.name}: ${d?.error?.title ?? 'Latest deployment failed'}. ${d?.error?.detail ?? 'Review the deployment logs.'} ${d?.error?.action ?? ''}`), ...offline.map(s => `${s.name} is offline. Reconnect it from the server page.`), ...pending.map(d => `${d.name} needs DNS verification. Check its records in Domains.`)].join('\n') || 'No failed latest deployments, offline servers, or unresolved DNS records were found in this scope.', links: [...failed.map(({p,d}) => ({label:`Inspect ${p.name} failure`,href:`/deployments/${d!.id}`})),{label:'View logs',href:project ? `/projects/${project.id}/logs` : '/logs'},{label:'Manage domains',href:'/domains'}] }
  }
  if (/log/.test(q)) return {text:'Open the logs to search messages, filter by level, and follow deployment output. I can summarize deployment status here; I do not infer errors that are absent from the current state.',links:[{label:'Open logs',href:project ? `/projects/${project.id}/logs` : '/logs'}]}
  if (/running|alive|live|status|health|deploy|project|container|summary/.test(q)) {
    const summary = projects.map(p => { const d=latestDeployment(deployments,p.id,now); const containers=state.containers.filter(c=>c.projectId===p.id);return `${p.name}: ${projectBadge(p,d)}. ${containers.filter(c=>c.state==='running').length} of ${containers.length} containers running.${d ? ` Latest release: ${d.commitSha.slice(0,7)} (${d.status}).` : ' No deployments yet.'}` })
    return {text:(summary.join('\n') || 'No projects yet. Create a project to begin monitoring deployments.')+'\nThese are the current local mock states, not external uptime checks.',links:[...links,{label:'Inspect containers',href:'/containers'}]}
  }
  return {text:'I can check project status, running containers, failed deployments, server resources, and domain verification from this workspace. Try “Is my project running?” or “What needs attention?” I cannot execute commands or answer general questions in this local Phase 1 assistant.',links}
}
