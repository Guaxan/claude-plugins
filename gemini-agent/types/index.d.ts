export type Question = { id: string; text: string; options?: string[] }

export type Step = {
  index: number
  kind: string
  tool?: string
  detail?: string
  state: string
  text: string
  seconds?: number
}

export type Run = {
  key: string
  conversationId?: string
  title: string
  status: 'running' | 'needs_input' | 'done' | 'error'
  steps: Step[]
  questions: Question[]
  summary?: string
  denied: string[]
  startedAt: number
  seconds?: number
  tokens?: number
}

export type AgentMemo = { conv?: string; handled: number; report?: string }

declare module 'claude-code' {
  interface PluginState {
    'gemini-agent': { runs: Shaped<Run[]>; agentConvs: Shaped<Record<string, AgentMemo>> }
  }
}
