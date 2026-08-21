import type { AgentEvent } from '../../shared/protocol'

interface StreamCoalescerOptions {
  emit: (sessionId: string, event: AgentEvent) => void
  isActive: (sessionId: string) => boolean
  maxDelayMs?: number
  backgroundIntervalMs?: number
}

const DEFAULT_MAX_DELAY_MS = 250
const DEFAULT_BACKGROUND_INTERVAL_MS = 500

export interface StreamCoalescer {
  push: (sessionId: string, event: AgentEvent) => void
  drop: (sessionId: string) => void
  activate: (sessionId: string) => void
  flush: () => void
  dispose: () => void
}

export function createStreamCoalescer(options: StreamCoalescerOptions): StreamCoalescer {
  const { emit, isActive } = options
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const backgroundIntervalMs = options.backgroundIntervalMs ?? DEFAULT_BACKGROUND_INTERVAL_MS

  let pending = new Map<string, AgentEvent>()
  const lastEmitted = new Map<string, number>()
  let rafId: number | null = null
  let timerId: ReturnType<typeof setTimeout> | null = null

  const cancelScheduled = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  const hasActivePending = (): boolean => {
    for (const id of pending.keys()) {
      if (isActive(id)) return true
    }
    return false
  }

  const schedule = (): void => {
    if (rafId !== null) return
    if (hasActivePending()) {
      // An active stream must never wait out a background timer that is
      // already armed: drop it and move to the per-frame schedule.
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }
      rafId = requestAnimationFrame(() => flush())
      timerId = setTimeout(() => flush(), maxDelayMs)
    } else if (timerId === null) {
      timerId = setTimeout(() => flush(), backgroundIntervalMs)
    }
  }

  function flush(): void {
    cancelScheduled()
    if (pending.size === 0) return
    const now = Date.now()
    const remaining = new Map<string, AgentEvent>()
    for (const [id, ev] of pending) {
      if (!isActive(id)) {
        const last = lastEmitted.get(id) ?? 0
        if (now - last < backgroundIntervalMs) {
          remaining.set(id, ev)
          continue
        }
        lastEmitted.set(id, now)
      } else {
        lastEmitted.delete(id)
      }
      emit(id, ev)
    }
    pending = remaining
    if (pending.size > 0) schedule()
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && pending.size > 0) flush()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    push(sessionId, event) {
      if (event.type === 'message_update' && event.assistantMessageEvent?.partial) {
        pending.set(sessionId, event)
        schedule()
        return
      }
      pending.delete(sessionId)
      emit(sessionId, event)
    },
    drop(sessionId) {
      pending.delete(sessionId)
      lastEmitted.delete(sessionId)
    },
    activate(sessionId) {
      // Focus moved but no new delta may arrive to re-run the scheduler, so
      // re-evaluate here: pending work for the now-active session must move
      // to the per-frame schedule instead of waiting out the background timer.
      if (!pending.has(sessionId)) return
      lastEmitted.delete(sessionId)
      schedule()
    },
    flush,
    dispose() {
      cancelScheduled()
      pending = new Map()
      lastEmitted.clear()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}
