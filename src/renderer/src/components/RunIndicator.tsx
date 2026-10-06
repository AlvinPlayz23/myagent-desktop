import type { RunIndicatorStyle } from '../preferences'
import Orb from './Orb'

/** Live-run glyph: one of the Orb patterns, or a plain busy-coloured dot. */
export default function RunIndicator({ variant, color = 'var(--busy)' }: { variant: RunIndicatorStyle; color?: string }): JSX.Element {
  if (variant === 'color') {
    return <span className="size-[7px] rounded-full" style={{ backgroundColor: color }} aria-hidden />
  }
  return <Orb variant={variant} size={16} style={{ color }} />
}
