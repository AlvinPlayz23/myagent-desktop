import Orb from './Orb'

/** Live agent activity indicator used when a run has not produced visible output yet. */
export default function Working(): JSX.Element {
  return (
    <span
      className="inline-flex select-none items-center gap-1.5 text-[13px] font-medium leading-[18px] text-muted-foreground"
      role="status"
      aria-label="Working"
    >
      <Orb size={20} className="text-foreground/75" />
      <span className="shimmer-text">Working</span>
    </span>
  )
}
