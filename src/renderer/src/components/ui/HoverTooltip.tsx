import { type ReactNode } from 'react'
import { cn } from '../../util'

/**
 * Lightweight hover/focus tooltip, rendered inline (no portal, no provider).
 *
 * Inline is deliberate: the composer chrome it decorates doesn't clip, and a
 * plain group-hover bubble keeps this dependency-free next to the Base UI
 * `tooltip.tsx`, which needs provider + portal wiring for a single call site.
 *
 * The reveal is delayed so scrubbing across controls doesn't flash tooltips;
 * the delay only applies on the way in, so dismissal is instant.
 */
export default function HoverTooltip({
  label,
  children,
  side = 'top',
  className
}: {
  label: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}): JSX.Element {
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/60 bg-popover px-2 py-1.5 text-[11.5px] font-medium text-foreground opacity-0 shadow-lg',
          'transition-[opacity,transform] duration-150 ease-out delay-0 group-hover/tip:delay-[350ms] group-focus-within/tip:delay-[350ms]',
          'motion-reduce:transition-none',
          side === 'top' ? 'bottom-full mb-1.5 translate-y-1' : 'top-full mt-1.5 -translate-y-1',
          'group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0',
          'group-hover/tip:opacity-100 group-focus-within/tip:opacity-100'
        )}
      >
        {label}
      </span>
    </span>
  )
}
