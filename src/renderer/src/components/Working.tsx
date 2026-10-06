import Orb from './Orb'
import type { OrbVariant } from '../preferences'

/** Live agent activity indicator used when a run has not produced visible output yet. */
export default function Working({ variant = 'S1' }: { variant?: OrbVariant }): JSX.Element {
  return (
    <span
      className="inline-flex select-none items-center gap-1.5 text-ui-caption font-medium leading-[18px] text-muted-foreground"
      role="status"
      aria-label="Working"
    >
      <Orb variant={variant} size={20} className="text-muted-foreground" />
      <span className="shimmer-text">Working</span>
    </span>
  )
}
