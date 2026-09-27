import type { DeployProvider } from "./provider"
import { actions, getServerSnapshot, getSnapshot, isReady, subscribe } from "./store"

function wrap<T>(value: T): Promise<T> {
  return Promise.resolve(value)
}

/** Phase 1 deployment provider. All effects stay in the browser. */
export const mockDeployProvider: DeployProvider = {
  subscribe,
  isReady,
  getSnapshot,
  getServerSnapshot,
  createProject: (input) => wrap(actions.createProject(input)),
  updateProject: (id, patch) => wrap(actions.updateProject(id, patch)),
  deleteProject: (id) => wrap(actions.deleteProject(id)),
  startDeployment: (projectId) => wrap(actions.startDeployment(projectId)),
  cancelDeployment: (id) => wrap(actions.cancelDeployment(id)),
  redeploy: (projectId) => wrap(actions.redeploy(projectId)),
  refreshServer: (id) => wrap(actions.refreshServer(id)),
  restartAgent: (id) => wrap(actions.restartAgent(id)),
  disconnectServer: (id) => wrap(actions.disconnectServer(id)),
  reconnectServer: (id) => wrap(actions.reconnectServer(id)),
  containerAction: (id, action) => wrap(actions.containerAction(id, action)),
  addDomain: (input) => wrap(actions.addDomain(input)),
  verifyDomain: (id) => wrap(actions.verifyDomain(id)),
  deleteDomain: (id) => wrap(actions.deleteDomain(id)),
  connectGitHub: () => wrap(actions.connectGitHub()),
  disconnectGitHub: () => wrap(actions.disconnectGitHub()),
  updateSettings: (patch) => wrap(actions.updateSettings(patch)),
  completeOnboarding: () => wrap(actions.completeOnboarding()),
  resetDemo: () => wrap(actions.resetDemo()),
  clearWorkspace: () => wrap(actions.clearWorkspace()),
  metrics: (serverId) => wrap(actions.metrics(serverId)),
  logs: (query) => wrap(actions.logs(query)),
}
