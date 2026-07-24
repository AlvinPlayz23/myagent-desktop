// Reduces the existing AgentEvent stream into a per-session LLM turn
// timeline. Subscribes to api.onPush independently of the app's main
// reducer (state.ts) — see ./README.md for why, and for the event
// correlation this relies on.
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { LlmTurn, RetryAttempt } from './types'

const MAX_TURNS = 200

export function useLlmTrace(sessionId: string | null): LlmTurn[] {
  const [turns, setTurns] = useState<LlmTurn[]>([])

  useEffect(() => {
    setTurns([])
    if (!sessionId) return

    let nextId = 1

    const off = api.onPush((push) => {
      if (push.kind !== 'event' || push.sessionId !== sessionId) return
      const ev = push.event
      const now = Date.now()

      setTurns((current) => {
        switch (ev.type) {
          case 'turn_start': {
            const turn: LlmTurn = { id: nextId++, status: 'pending', startedAt: now, retries: [] }
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
      })
    })

    return off
  }, [sessionId])

  return turns
}
