/*
 * Press-and-hold to confirm. The fill sweeps across while held; letting go
 * (or sliding off) early springs it back, holding past `holdMs` fires
 * `onConfirm`. A promise shows the spinner, resolves to a brief confirmation
 * and rejects to an error state — the same contract SlideCommit keeps, minus
 * the drag gesture.
 *
 * Keyboard works the same way: hold Space or Enter, release early to cancel,
 * Escape to bail. There is deliberately no plain-click path — when motion is
 * off the caller renders a normal button instead, which doubles as the
 * accessible fallback.
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { cn } from '@/lib/utils'
import { Cancel01, Check, Loading03 } from './icons'

export interface HoldButtonProps {
  /** Idle text, e.g. "Hold to push". */
  label: ReactNode
  /** Shown while held, e.g. "Keep holding…". */
  holdingLabel?: ReactNode
  pendingLabel?: ReactNode
  doneLabel?: ReactNode
  errorLabel?: ReactNode
  /** Trailing content in the idle state — count pills, kbd hints. */
  meta?: ReactNode
  /** Native tooltip. */
  hint?: string
  /** Leading glyph in the idle state. */
  icon?: ReactNode
  /** How long the press must be held, ms. */
  holdMs?: number
  /** How long the confirmation stands before closing back. */
  doneHoldMs?: number
  /** How long the error stands before closing back. */
  errorHoldMs?: number
  onConfirm?: () => void | Promise<unknown>
  onDone?: () => void
  onError?: (reason: unknown) => void
  disabled?: boolean
  className?: string
}

type Phase = 'idle' | 'holding' | 'pending' | 'done' | 'error'

export default function HoldButton({
  label,
  holdingLabel = 'Keep holding…',
  pendingLabel,
  doneLabel,
  errorLabel,
  meta,
  hint,
  icon,
  holdMs = 900,
  doneHoldMs = 1200,
  errorHoldMs = 1500,
  onConfirm,
  onDone,
  onError,
  disabled = false,
  className = ''
}: HoldButtonProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const pointerId = useRef<number | null>(null)
  const t0 = useRef(0)
  const raf = useRef(0)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unwatch = useRef<(() => void) | null>(null)
  const cfg = useRef({ holdMs, onConfirm, onDone, onError, doneHoldMs, errorHoldMs })
  cfg.current = { holdMs, onConfirm, onDone, onError, doneHoldMs, errorHoldMs }

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      if (settleTimer.current) clearTimeout(settleTimer.current)
      unwatch.current?.()
    },
    []
  )

  const setPhaseBoth = (next: Phase): void => {
    phaseRef.current = next
    setPhase(next)
  }

  const detach = (): void => {
    unwatch.current?.()
    unwatch.current = null
    pointerId.current = null
  }

  const settleIdle = (): void => {
    setPhaseBoth('idle')
    setProgress(0)
  }

  const succeed = (): void => {
    setPhaseBoth('done')
    cfg.current.onDone?.()
    settleTimer.current = setTimeout(settleIdle, cfg.current.doneHoldMs)
  }

  const fail = (reason: unknown): void => {
    setPhaseBoth('error')
    cfg.current.onError?.(reason)
    settleTimer.current = setTimeout(settleIdle, cfg.current.errorHoldMs)
  }

  const finish = (): void => {
    detach()
    cancelAnimationFrame(raf.current)
    setProgress(1)
    setPhaseBoth('pending')
    let out: void | Promise<unknown>
    try {
      out = cfg.current.onConfirm?.()
    } catch (reason) {
      fail(reason)
      return
    }
    if (out && typeof (out as Promise<unknown>).then === 'function') {
      ;(out as Promise<unknown>).then(
        () => succeed(),
        (reason: unknown) => fail(reason)
      )
    } else {
      succeed()
    }
  }

  const abort = (): void => {
    if (phaseRef.current !== 'holding') return
    detach()
    cancelAnimationFrame(raf.current)
    // The fill's own 150ms transition runs it back; no motion value needed.
    setPhaseBoth('idle')
    setProgress(0)
  }

  const tick = (): void => {
    const p = Math.min(1, (performance.now() - t0.current) / Math.max(1, cfg.current.holdMs))
    setProgress(p)
    if (p >= 1) {
      finish()
      return
    }
    raf.current = requestAnimationFrame(tick)
  }

  const begin = (id: number): void => {
    if (disabled || phaseRef.current !== 'idle') return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    pointerId.current = id
    t0.current = performance.now()
    setPhaseBoth('holding')
    setProgress(0)
    const onMove = (ev: PointerEvent): void => {
      // Slide off to cancel — the press only counts while it stays inside.
      if (ev.pointerId !== pointerId.current || !buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) {
        abort()
      }
    }
    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId.current) return
      abort()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    unwatch.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      unwatch.current = null
    }
    raf.current = requestAnimationFrame(tick)
  }

  // A second mutation starting mid-hold (stage-all, fetch) disables the
  // button out from under the press — bail instead of firing into it.
  useEffect(() => {
    if (disabled) abort()
    // Reads the holding state through a ref; only the flag matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    begin(event.pointerId)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === ' ' || event.key === 'Enter') {
      // preventDefault swallows the native click activation, so the timer is
      // the only path to onConfirm — quick taps can never fire it.
      event.preventDefault()
      if (!event.repeat) begin(-1)
    } else if (event.key === 'Escape') {
      abort()
    }
  }

  const onKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      abort()
    }
  }

  const shownLabel =
    phase === 'holding' ? holdingLabel : phase === 'pending' ? (pendingLabel ?? label) : phase === 'done' ? (doneLabel ?? label) : phase === 'error' ? (errorLabel ?? label) : label

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      title={hint}
      className={cn(
        'relative flex h-9 w-full touch-none select-none items-center justify-center gap-1.5 overflow-hidden rounded-lg border text-ui-sm font-medium outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring [-webkit-touch-callout:none]',
        phase === 'done' && 'border-success/40 bg-success/10 text-success-foreground',
        phase === 'error' && 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
        (phase === 'idle' || phase === 'holding') && 'border-border text-foreground hover:bg-hover',
        phase === 'holding' && 'cursor-wait border-ring/40',
        phase === 'pending' && 'border-border text-muted-foreground',
        // Dim only while idle: a pending or confirmed pill must stay legible.
        disabled && phase === 'idle' && 'opacity-40',
        className
      )}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 origin-left bg-success/20"
        style={{
          transform: `scaleX(${progress})`,
          transition: phase === 'holding' ? 'none' : 'transform 150ms ease-out'
        }}
      />
      <span className="relative flex min-w-0 items-center gap-1.5">
        {phase === 'pending' ? (
          <Loading03 size={12} className="shrink-0 animate-spin" />
        ) : phase === 'done' ? (
          <Check size={12} className="shrink-0" />
        ) : phase === 'error' ? (
          <Cancel01 size={12} className="shrink-0" />
        ) : (
          icon
        )}
        <span className="truncate">{shownLabel}</span>
        {phase === 'idle' && meta}
      </span>
      <span className="sr-only" aria-live="polite">
        {phase === 'pending' ? 'Working' : phase === 'done' ? 'Confirmed' : phase === 'error' ? 'Action failed' : ''}
      </span>
    </button>
  )
}
