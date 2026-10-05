import { useEffect, useState } from 'react'

/**
 * A clock that ticks once a second, but only while `active`.
 *
 * Elapsed timers for background subagents live next to the streaming transcript,
 * where an unconditional interval would re-render a card on every token. The
 * value is returned rather than stored in a context so several timers can share
 * one clock without drifting.
 *
 * The initial value is read once at mount and refreshed on every activation, so
 * a timer that becomes active mid-session starts from the real current time
 * rather than from whenever the component first rendered.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}