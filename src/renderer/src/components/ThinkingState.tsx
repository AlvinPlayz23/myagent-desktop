// Text-only reasoning status. Running sessions use Working.tsx so the Orb
// remains specific to active agent work rather than model reasoning.
export default function ThinkingState({ label = 'Thinking' }: { label?: string }): JSX.Element {
  return <span className="shimmer-text select-none text-[13px] font-medium leading-[18px] text-muted-foreground">{label}</span>
}
