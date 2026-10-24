// Reduces the existing AgentEvent stream into a per-session LLM turn
// timeline. Subscribes to api.onPush independently of the app's main
// reducer (state.ts) — see ./README.md for why, and for the event
// correlation this relies on.
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AgentEvent, ServerPush } from '../../../shared/protocol'
import type { LlmTurn, RetryAttempt } from './types'

const MAX_TURNS = 200

/**
 * Folds one agent event into the turn timeline. Pure so a batch can be reduced
 * event-by-event: a single IPC message now carries every event that landed in
 * one tick, and dropping all but the first would lose turn boundaries that
 * share a tick with the message that opened them.
 */
function reduceTurn(
  current: LlmTurn[],
  ev: AgentEvent,
  now: number,
  nextId: () => number
): LlmTurn[] {
  switch (ev.type) {
    case 'turn_start': {
      const turn: LlmTurn = { id: nextId(), status: 'pending', startedAt: now, retries: [] }
      const next = [...current, turn]
      return next.length > MAX_TURNS ? next.slice(next.length - MAX_TURNS) : next
    }

    case 'retry': {
      const last = current[current.length - 1]
      if (!last || last.ttfbAt || last.endedAt) return current
      const attempt: RetryAttempt = {
        attempt: ev.attempt ?? 0,
        maxAttempts: ev.maxAttempts ?? 0,
        at: now
      }
      const updated: LlmTurn = { ...last, status: 'retrying', retries: [...last.retries, attempt] }
      return [...current.slice(0, -1), updated]
    }

    case 'message_start': {
      const last = current[current.length - 1]
      if (ev.message?.role !== 'assistant' || !last || last.ttfbAt || last.endedAt) return current
      const updated: LlmTurn = {
        ...last,
        status: 'streaming',
        ttfbAt: now,
        model: ev.message.model,
        provider: ev.message.provider
      }
      return [...current.slice(0, -1), updated]
    }

    case 'message_end': {
      const last = current[current.length - 1]
      if (ev.message?.role !== 'assistant' || !last || last.endedAt) return current
      const msg = ev.message
      const status: LlmTurn['status'] =
        msg.stopReason === 'error' ? 'error' : msg.stopReason === 'aborted' ? 'aborted' : 'done'
      const updated: LlmTurn = {
        ...last,
        status,
        endedAt: now,
        model: msg.model ?? last.model,
        provider: msg.provider ?? last.provider,
        stopReason: msg.stopReason,
        errorMessage: msg.errorMessage,
        usage: msg.usage
      }
      return [...current.slice(0, -1), updated]
    }

    default:
      return current
  }
}

export function useLlmTrace(sessionId: string | null): LlmTurn[] {
  const [turns, setTurns] = useState<LlmTurn[]>([])

  useEffect(() => {
    setTurns([])
    if (!sessionId) return

    let nextId = 1

    const off = api.onPush((batch) => {
      // A batch carries every event that arrived in one tick, which is
      // routinely more than one per session (message_start and message_end
      // land together). All of them are folded in arrival order.
      const events = batch
        .filter((p): p is Extract<ServerPush, { kind: 'event' }> => p.kind === 'event' && p.sessionId === sessionId)
        .map((p) => p.event)
      if (events.length === 0) return

      const now = Date.now()
      setTurns((current) => {
        let next = current
        for (const ev of events) next = reduceTurn(next, ev, now, () => nextId++)
        return next
      })
    })

    return off
  }, [sessionId])

  return turns
}
