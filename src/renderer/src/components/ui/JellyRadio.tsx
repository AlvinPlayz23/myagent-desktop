import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, motionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react'
import './JellyRadio.css'

export interface JellyRadioItem {
  value: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

type JellyRadioSize = 'sm' | 'md' | 'lg'
// [chip height, font size, horizontal padding]
const SIZES: Record<JellyRadioSize, [number, number, number]> = { sm: [28, 12, 12], md: [36, 13, 16], lg: [44, 14, 20] }

const spring = (k: number, m: number, bounce: number) => ({
  type: 'spring' as const,
  stiffness: k,
  damping: 2 * Math.sqrt(k * m) * (1 - bounce),
  mass: m
})

interface ChipMotionValues {
  x: MotionValue<number>
  sx: MotionValue<number>
  sy: MotionValue<number>
}

type ChipProps = {
  mv: ChipMotionValues
  children: ReactNode
} & Omit<React.ComponentProps<typeof motion.button>, 'style' | 'children'>

const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  {
    mv,
    children,
    ...rest
  },
  ref
): JSX.Element {
  const transform = useTransform(() => `translateX(${mv.x.get()}px) scale(${mv.sx.get()}, ${mv.sy.get()})`)
  return (
    <motion.button ref={ref} style={{ transform }} {...rest}>
      {children}
    </motion.button>
  )
})

// __SPLIT__

export interface JellyRadioProps {
  items: Array<string | JellyRadioItem>
  value?: string
  defaultValue?: string
  onChange?(value: string, index: number): void
  /** Colors accept any CSS color, including `var(--token)` references. */
  chipColor?: string
  activeColor?: string
  textColor?: string
  activeTextColor?: string
  size?: JellyRadioSize
  gap?: number
  radius?: number
  /** How much the selected chip grows, and its neighbours barge away. */
  swell?: number
  barge?: number
  shrink?: number
  jelly?: number
  bounce?: number
  stagger?: number
  stiffness?: number
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export default function JellyRadio({
  items,
  value,
  defaultValue,
  onChange,
  chipColor = 'var(--hover)',
  activeColor = 'var(--foreground)',
  textColor = 'var(--muted-foreground)',
  activeTextColor = 'var(--background)',
  size = 'sm',
  gap = 6,
  radius = 14,
  swell = 0.2,
  barge = 6,
  shrink = 0.05,
  jelly = 1,
  bounce = 0.25,
  stagger = 22,
  stiffness = 580,
  disabled = false,
  ariaLabel = 'Options',
  className = ''
}: JellyRadioProps): JSX.Element {
  const list: JellyRadioItem[] = items.map((item) => (typeof item === 'string' ? { value: item, label: item } : item))
  const [inner, setInner] = useState<string>(() => defaultValue ?? list[0]?.value ?? '')
  const current = value ?? inner
  const at = Math.max(
    0,
    list.findIndex((item) => item.value === current)
  )
  const reduce = useReducedMotion()
  const groupRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
  const widths = useRef<number[]>([])
  const mvs = useRef<ChipMotionValues[]>([])
  const applied = useRef(at)
  const cfg = useRef({ swell, barge, shrink, jelly, bounce, stagger, stiffness, reduce, count: list.length })
  cfg.current = { swell, barge, shrink, jelly, bounce, stagger, stiffness, reduce, count: list.length }
  const [h, font, px] = SIZES[size] ?? SIZES.md
  const itemsKey = list.map((item) => item.value).join('|')

  const mvFor = (index: number): ChipMotionValues => {
    let mv = mvs.current[index]
    if (!mv) {
      mv = { x: motionValue(0), sx: motionValue(1), sy: motionValue(1) }
      mvs.current[index] = mv
    }
    return mv
  }

  // __SPLIT2__

  const apply = (selected: number, instant: boolean): void => {
    const c = cfg.current
    const group = groupRef.current
    const rtl = group ? getComputedStyle(group).direction === 'rtl' : false
    const push = ((widths.current[selected] ?? 0) * c.swell) / 2 + c.barge
    for (let i = 0; i < c.count; i += 1) {
      const mv = mvFor(i)
      const on = i === selected
      const far = Math.abs(i - selected)
      const dir = Math.sign(i - selected) * (rtl ? -1 : 1)
      const x = dir * push
      const s = on ? 1 + c.swell : 1 - c.shrink
      if (instant || c.reduce) {
        mv.x.jump(x)
        mv.sx.jump(s)
        mv.sy.jump(s)
        continue
      }
      const k = c.stiffness * (1 - 0.12 * Math.min(far, 3))
      const inFlight = mv.x.isAnimating() || mv.sx.isAnimating() || mv.sy.isAnimating()
      const delay = inFlight ? 0 : (far * c.stagger) / 1000
      animate(mv.x, x, { ...spring(k, 0.9, c.bounce), delay })
      const j = c.jelly
      animate(mv.sx, s, {
        ...spring(k * (1 + 0.24 * j), 0.9 - 0.1 * j, Math.min(0.85, c.bounce + 0.3 * j)),
        delay
      })
      animate(mv.sy, s, { ...spring(k * (1 - 0.14 * j), 0.9 + 0.05 * j, c.bounce), delay: delay + 0.05 * j })
    }
  }

  const measure = (): void => {
    const group = groupRef.current
    if (!group) return
    widths.current = chipRefs.current.map((el) => el?.offsetWidth ?? 0)
    const chipH = chipRefs.current[0]?.offsetHeight ?? 0
    const maxW = Math.max(0, ...widths.current)
    group.style.setProperty('--jr-pad-x', `${Math.ceil((maxW * swell * 1.3) / 2 + barge) + 2}px`)
    group.style.setProperty('--jr-pad-y', `${Math.ceil((chipH * swell) / 2) + 2}px`)
  }

  useLayoutEffect(() => {
    const settle = (): void => {
      measure()
      apply(applied.current, true)
    }
    settle()
    const observer = new ResizeObserver(settle)
    if (groupRef.current) observer.observe(groupRef.current)
    void document.fonts?.ready.then(settle)
    return () => observer.disconnect()
    // Re-measure only when the items or sizing inputs change; `at` changes are
    // handled by the effect below, and the spring config is read via cfg ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, size, gap, swell, barge, shrink])

  useEffect(() => {
    if (applied.current === at) return
    applied.current = at
    apply(at, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at])

  useEffect(
    () => () =>
      mvs.current.forEach((mv) => {
        mv.x.destroy()
        mv.sx.destroy()
        mv.sy.destroy()
      }),
    []
  )

  // __SPLIT3__

  const commit = (index: number, instant: boolean): void => {
    const item = list[index]
    if (disabled || index === at || !item || item.disabled) return
    applied.current = index
    apply(index, instant)
    if (value === undefined) setInner(item.value)
    onChange?.(item.value, index)
  }

  const stepFrom = (index: number, dir: number): number => {
    const n = list.length
    let j = index
    for (let tries = 0; tries < n; tries += 1) {
      j = (j + dir + n) % n
      if (!list[j]?.disabled) return j
    }
    return index
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = stepFrom(index, 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = stepFrom(index, -1)
    else if (event.key === 'Home') next = stepFrom(-1, 1)
    else if (event.key === 'End') next = stepFrom(list.length, -1)
    else if (event.key === ' ' || event.key === 'Enter') next = index
    if (next === null) return
    event.preventDefault()
    commit(next, true)
    chipRefs.current[next]?.focus()
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      data-disabled={disabled ? '' : undefined}
      className={`jelly-radio${className ? ` ${className}` : ''}`}
      style={
        {
          '--jr-chip': chipColor,
          '--jr-active': activeColor,
          '--jr-text': textColor,
          '--jr-active-text': activeTextColor,
          '--jr-gap': `${gap}px`,
          '--jr-radius': `${radius}px`,
          '--jr-h': `${h}px`,
          '--jr-font': `${font}px`,
          '--jr-px': `${px}px`
        } as React.CSSProperties
      }
    >
      {list.map((item, index) => (
        <Chip
          key={item.value}
          mv={mvFor(index)}
          ref={(el) => {
            chipRefs.current[index] = el
          }}
          type="button"
          role="radio"
          aria-checked={index === at}
          tabIndex={index === at ? 0 : -1}
          disabled={disabled || !!item.disabled}
          className="jelly-radio__chip"
          data-on={index === at ? 'true' : 'false'}
          onClick={(e) => commit(index, e.detail === 0)}
          onKeyDown={(e) => onKeyDown(e, index)}
        >
          <span className="jelly-radio__skin">
            {item.icon ? <span className="jelly-radio__icon">{item.icon}</span> : null}
            <span className="jelly-radio__label">{item.label}</span>
          </span>
        </Chip>
      ))}
    </div>
  )
}
