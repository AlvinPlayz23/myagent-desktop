/*
 * Ported from React Bits' SlideCommit: a pill you drag to the end to confirm,
 * with the label wiped by the passing handle, a spinner while the confirmation
 * is in flight, an unfurl on success and a shake home on failure.
 *
 * Colours come from the app's ink/success/destructive anchors rather than fixed
 * hex, so every named theme and both light and dark work without a JS theme
 * probe — the same contract JellyRadio.css keeps next door. Each fill therefore
 * takes an explicit on-colour (`onHandleColor` …) instead of deriving one with
 * a YIQ luminance guess, which cannot read a `var()`.
 *
 * Motion is driven by springs on a single `x` motion value: the drag sets it
 * directly, and every visual — clip, label fade, arrow fade, squash, swell —
 * is a transform of it, so the gesture stays on the compositor.
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { usePrefersReducedMotion } from '../../hooks/use-reduced-motion'
import { EASE_OUT } from '../../motion'
import { Loading03 } from './icons'
import './SlideCommit.css'

const PAD = 4
const SQUASH_MAX = 0.08
const SQUASH_DIV = 110
const SWELL = 1.03
/** Shortest the spinner is allowed to stand, so a fast backend does not flash. */
const MIN_PENDING = 300
const SHAKE: number[] = [0, -5, 5, -3, 3, -1, 0]

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
/** Viewport-velocity of the handle, px/s, over the last few pointer samples. */
const velocityOf = (hist: number[][]): number => {
  if (hist.length < 2) return 0
  const [t0, x0] = hist[0]
  const [t1, x1] = hist[hist.length - 1]
  return ((x1 - x0) / Math.max(1, t1 - t0)) * 1000
}

const finePointer = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia('(hover: hover) and (pointer: fine)').matches

export interface SlideCommitProps {
  /** Instruction centred in the pill; the capsule wipes it as you drag. */
  label?: ReactNode
  /** Words beside the tick once confirmed. */
  doneLabel?: ReactNode
  /** Replaces the instruction, in the danger colour, after a rejection. */
  errorLabel?: ReactNode
  /** Called when the handle reaches the end. Return a promise to show the
      spinner: it unfurls on resolve and springs home on reject. */
  onConfirm?: () => void | Promise<unknown>
  /** Called when the done pill unfurls. */
  onDone?: () => void
  /** Called with the rejection reason; it is swallowed otherwise. */
  onError?: (reason: unknown) => void
  /** The pill behind the handle. */
  trackColor?: string
  /** The handle, and the ground it paints. */
  handleColor?: string
  successColor?: string
  dangerColor?: string
  /** Readable text colour on each of the three fills above. */
  onHandleColor?: string
  onSuccessColor?: string
  onErrorColor?: string
  width?: number
  height?: number
  radius?: number
  /** How fast the unfurl and the return take over once you let go, 0-100. */
  speed?: number
  /** Energy left when the handle returns to the wall: 0 stops dead. */
  returnBounce?: number
  /** How much the track dips as the done pill lands. 0 removes it. */
  landingDip?: number
  /** How long the done pill stands before it closes back. 0 holds it. */
  holdMs?: number
  disabled?: boolean
  icon?: ReactNode
  className?: string
}

export default function SlideCommit({
  label = 'Slide to pay',
  doneLabel = 'Paid',
  errorLabel = 'Payment failed',
  onConfirm,
  onDone,
  onError,
  trackColor = 'var(--muted)',
  handleColor = 'var(--primary)',
  successColor = 'var(--success)',
  dangerColor = 'var(--destructive)',
  onHandleColor = 'var(--primary-foreground)',
  onSuccessColor = '#ffffff',
  onErrorColor = '#ffffff',
  width = 280,
  height = 56,
  radius = 28,
  speed = 50,
  returnBounce = 0.38,
  landingDip = 0.026,
  holdMs = 1500,
  disabled = false,
  icon,
  className = ''
}: SlideCommitProps): JSX.Element {
  const reduce = usePrefersReducedMotion()
  const [phase, setPhase] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  const [held, setHeld] = useState(false)
  const [hot, setHot] = useState(false)

  const trackRef = useRef<HTMLDivElement>(null)
  const capsuleRef = useRef<HTMLDivElement>(null)
  const grip = useRef<{ id: number; grab: number | null; moved: boolean; hist: number[][] } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const homeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const run = useRef(0)
  const unwatch = useRef<(() => void) | null>(null)
  const live = useRef<{ move(event: PointerEvent): void; up(event: PointerEvent): void }>({
    move: () => {},
    up: () => {}
  })
  const lastPercent = useRef(0)

  const GRIP = height - PAD * 2
  const INNER = width - PAD * 2
  const TRAVEL = Math.max(1, INNER - GRIP)
  const r = clamp(radius, 0, height / 2)
  const gripR = Math.max(0, r - PAD)
  const k = 260 + (clamp(speed, 0, 100) / 100) * 640
  const mass = 0.9
  const critical = 2 * Math.sqrt(k * mass)
  const commitSpring = { type: 'spring' as const, stiffness: k, damping: critical, mass }
  const homeSpring = { ...commitSpring, damping: critical * (1 - clamp(returnBounce, 0, 0.5)) }

  const x = useMotionValue(0)
  const anchor = useMotionValue(0)
  const shown = useMotionValue(1)
  const spin = useMotionValue(0)
  const pulse = useMotionValue(1)
  const shake = useMotionValue(0)

  const seen = useTransform(() => clamp(x.get(), 0, TRAVEL))
  /** Right edge of the visible pill: past the handle while it is still out. */
  const edge = useTransform(() => seen.get() + GRIP + clamp(anchor.get() - seen.get(), 0, TRAVEL))
  const clip = useTransform(() => `inset(0 ${Math.max(0, INNER - edge.get())}px 0 0 round ${gripR}px)`)
  const content = useTransform(() => `translateX(${(seen.get() + edge.get()) / 2 - INNER / 2}px)`)
  const swell = hot && !held && phase === 'idle' && !reduce ? SWELL : 1
  const shape = useTransform(() => {
    const q = 1 - Math.min(SQUASH_MAX, Math.max(0, -x.get()) / SQUASH_DIV)
    return `scale(${q * swell}, ${swell / q})`
  })
  const origin = useTransform(() => `${seen.get()}px 50%`)
  const say = useTransform(() => clamp(1 - x.get() / (TRAVEL * 0.55), 0, 1))
  const arrow = useTransform(() => shown.get() * clamp(1 - (x.get() - TRAVEL * 0.55) / (TRAVEL * 0.4), 0, 1))
  const trackTransform = useTransform(() => `translateX(${shake.get()}px) scale(${pulse.get()})`)

  const labelText = typeof label === 'string' ? label : 'Slide to confirm'
  useMotionValueEvent(seen, 'change', (value: number) => {
    const percent = Math.round((value / TRAVEL) * 100)
    if (percent === lastPercent.current || !capsuleRef.current) return
    lastPercent.current = percent
    capsuleRef.current.setAttribute('aria-valuenow', String(percent))
    capsuleRef.current.setAttribute('aria-valuetext', `${labelText}, ${percent}%`)
  })

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (homeTimer.current) clearTimeout(homeTimer.current)
      unwatch.current?.()
      run.current += 1
    },
    []
  )

  /** Translates a viewport X into the component's own coordinate space, so the
      travel stays correct even when the track is painted narrower than asked. */
  const local = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return (clientX - rect.left) / (rect.width / width || 1)
  }

  const goHome = (velocity: number): void => {
    if (reduce) animate(x, 0, { duration: 0.2, ease: EASE_OUT })
    else animate(x, 0, { ...homeSpring, velocity: Math.min(0, velocity) })
  }

  const settle = (): void => {
    setPhase('idle')
    animate(shown, 1, { duration: 0.2, delay: 0.12 })
    if (reduce) anchor.set(0)
    else animate(anchor, 0, { type: 'spring', duration: 0.3, bounce: 0 })
  }

  const resolve = (viaKey: boolean): void => {
    setPhase('done')
    anchor.set(x.get())
    animate(spin, 0, { duration: 0.12 })
    if (reduce) x.set(0)
    else {
      animate(x, 0, commitSpring)
      // A soft dip as the done pill lands, so the confirm has weight. Skipped
      // for the keyboard path: nothing moved to deserve the recoil.
      if (!viaKey && landingDip > 0) {
        animate(pulse, [1, 1 - landingDip, 1], { duration: 0.46, times: [0, 0.62, 1], ease: EASE_OUT, delay: 0.1 })
      }
    }
    onDone?.()
    if (holdMs > 0) timer.current = setTimeout(settle, holdMs)
  }

  const reject = (reason: unknown): void => {
    setPhase('error')
    onError?.(reason)
    animate(spin, 0, { duration: 0.12 })
    animate(shown, 1, { duration: 0.2, delay: 0.12 })
    if (reduce) goHome(0)
    else {
      animate(shake, SHAKE, { duration: 0.45, ease: EASE_OUT })
      // After the shake, so the handle runs home rather than mid-swing.
      homeTimer.current = setTimeout(() => {
        if (!grip.current) goHome(0)
      }, 300)
    }
    timer.current = setTimeout(() => setPhase('idle'), Math.max(holdMs, 1500))
  }

  const commit = (viaKey: boolean): void => {
    if (timer.current) clearTimeout(timer.current)
    const id = ++run.current
    x.set(TRAVEL)
    let out: void | Promise<unknown>
    try {
      out = onConfirm?.()
    } catch (reason) {
      reject(reason)
      return
    }
    const pending = out && typeof (out as Promise<unknown>).then === 'function' ? (out as Promise<unknown>) : null
    if (!pending) {
      animate(shown, 0, { duration: 0.12 })
      resolve(viaKey)
      return
    }
    setPhase('pending')
    animate(shown, 0, { duration: 0.2 })
    animate(spin, 1, { duration: 0.2 })
    const t0 = performance.now()
    const later = (fn: () => void): void => {
      setTimeout(() => {
        if (id === run.current) fn()
      }, Math.max(0, MIN_PENDING - (performance.now() - t0)))
    }
    pending.then(
      () => later(() => resolve(viaKey)),
      (reason: unknown) => later(() => reject(reason))
    )
  }

  const down = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (disabled || grip.current || phase === 'pending' || phase === 'done' || event.button !== 0) return
    x.stop()
    grip.current = { id: event.pointerId, grab: null, moved: false, hist: [] }
    setHeld(true)
    try {
      trackRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // Capture is best-effort; dragging still works without it.
    }
    unwatch.current?.()
    const onMove = (ev: PointerEvent): void => {
      if (ev.isTrusted) live.current.move(ev)
    }
    const onUp = (ev: PointerEvent): void => {
      if (ev.isTrusted) live.current.up(ev)
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
  }

  const move = (event: PointerEvent): void => {
    const g = grip.current
    if (!g || g.id !== event.pointerId) return
    const at = local(event.clientX)
    if (g.grab === null) {
      g.grab = at - x.get()
      return
    }
    const next = clamp(at - g.grab, 0, TRAVEL)
    if (Math.abs(next - x.get()) > 0.5) g.moved = true
    g.hist.push([event.timeStamp, next])
    if (g.hist.length > 4) g.hist.shift()
    x.set(next)
  }

  const up = (event: PointerEvent): void => {
    const g = grip.current
    if (!g || g.id !== event.pointerId) return
    grip.current = null
    unwatch.current?.()
    try {
      trackRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore when the event was not trusted or capture is already released.
    }
    setHeld(false)
    if (x.get() >= TRAVEL) commit(false)
    else if (g.moved) goHome(velocityOf(g.hist))
  }
  live.current = { move, up }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (disabled || phase === 'pending' || phase === 'done') return
      const step = TRAVEL / 10
      if (event.key === 'End') {
        event.preventDefault()
        commit(true)
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = Math.min(TRAVEL, x.get() + step)
        x.set(next)
        if (next >= TRAVEL) commit(true)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault()
        x.set(Math.max(0, x.get() - step))
      } else if (event.key === 'Home' || event.key === 'Escape') {
        event.preventDefault()
        // Escape/Home always release the handle, mid-drag or not.
        if (grip.current) up({ pointerId: grip.current.id } as PointerEvent)
        else x.set(0)
      }
  }

  const fontSize = clamp(Math.round(height * 0.25), 13, 17)
  const iconSize = Math.round(GRIP * 0.42)
  const done = phase === 'done'

  return (
    <div
      className={`slide-commit${className ? ` ${className}` : ''}`}
      data-phase={phase}
      data-held={held ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      style={
        {
          width,
          height,
          '--sc-track': trackColor,
          '--sc-ink': handleColor,
          '--sc-ok': successColor,
          '--sc-no': dangerColor,
          '--sc-on-ink': onHandleColor,
          '--sc-on-ok': onSuccessColor,
          '--sc-on-no': onErrorColor,
          '--sc-radius': `${r}px`,
          '--sc-grip-r': `${gripR}px`,
          '--sc-pad': `${PAD}px`,
          '--sc-font': `${fontSize}px`
        } as React.CSSProperties
      }
    >
      <motion.div ref={trackRef} className="slide-commit__track" style={{ transform: trackTransform }} onPointerDown={down}>
        <motion.span className="slide-commit__label" style={{ opacity: say }} aria-hidden="true">
          <span className="slide-commit__text slide-commit__text--plain">{label}</span>
          <span className="slide-commit__text slide-commit__text--error">{errorLabel}</span>
        </motion.span>
        <motion.div
          ref={capsuleRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={labelText}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          aria-busy={phase === 'pending' || undefined}
          aria-disabled={disabled || undefined}
          className="slide-commit__capsule"
          style={{ clipPath: clip, transform: shape, transformOrigin: origin }}
          onPointerEnter={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.pointerType === 'mouse' && finePointer()) setHot(true)
          }}
          onPointerLeave={() => setHot(false)}
          onKeyDown={onKeyDown}
        >
          <motion.div className="slide-commit__content" style={{ transform: content }}>
            <motion.span className="slide-commit__arrow" style={{ opacity: arrow }} aria-hidden="true">
              {icon ?? <HugeiconsIcon icon={ArrowRight02Icon} size={iconSize} strokeWidth={2} />}
            </motion.span>
            <motion.span className="slide-commit__spin" style={{ opacity: spin }} aria-hidden="true">
              <Loading03 size={iconSize} strokeWidth={2} />
            </motion.span>
            <motion.span
              className="slide-commit__done"
              aria-hidden="true"
              initial={false}
              animate={{ opacity: done ? 1 : 0, scale: done || reduce ? 1 : 0.95 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              <HugeiconsIcon icon={Tick02Icon} size={Math.round(GRIP * 0.38)} strokeWidth={2.5} />
              {doneLabel}
            </motion.span>
          </motion.div>
        </motion.div>
        <span className="slide-commit__sr" aria-live="polite">
          {phase === 'pending' ? 'Working' : phase === 'done' ? doneLabel : phase === 'error' ? errorLabel : ''}
        </span>
      </motion.div>
    </div>
  )
}
