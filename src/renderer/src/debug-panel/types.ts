// Local types for the LLM debug panel. See ./README.md for how these are
// derived from the existing AgentEvent stream.
import type { Usage } from '../../../shared/protocol'

export interface RetryAttempt {
  attempt: number
  maxAttempts: number
  at: number // ms epoch, event-arrival time (approximate, not server-exact)
}

export type LlmTurnStatus = 'pending' | 'retrying' | 'streaming' | 'done' | 'error' | 'aborted'

export interface LlmTurn {
  id: number // local sequence number, 1-based per session
  status: LlmTurnStatus
  startedAt: number // turn_start arrival time
  ttfbAt?: number // message_start (assistant) arrival time
  endedAt?: number // message_end (assistant) arrival time
  model?: string
  provider?: string
  retries: RetryAttempt[]
  stopReason?: string
  errorMessage?: string
  usage?: Usage
}
