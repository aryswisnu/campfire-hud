export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  type: string
  description: string
  model: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  tokens: number
  lastTool: string
  effort?: string
  /** Estimated from the token counts and list prices. */
  costUsd?: number
}

/** `selectedId`: the running agent the list shows in full; absent, the newest. */
export type Panel = { isDoneCollapsed: boolean; selectedId?: string }

export type Tokens = { input: number; output: number }

export type Repo = {
  branch: string
  staged: number
  modified: number
  untracked: number
  added: number
  removed: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-hud': {
      agents: AgentRun[]
      tokens: Tokens
      repo: Repo | null
      now: number
      panel: Panel
    }
  }
}
