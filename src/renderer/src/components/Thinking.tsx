import { useState } from 'react'
import { BrainCircuit, ChevronRight } from './ui/icons'
import { cn } from '../util'

// Collapsible reasoning block. Rendered both inline while an assistant message
// streams and, once finalized, as a foldable work item inside ToolGroup.
export default function Thinking({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-0 flex flex-col font-sans">
      <button
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[12px] font-medium transition-colors hover:bg-hover/60 hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <span className="grid w-3.5 place-items-center shrink-0">
          <ChevronRight size={12} strokeWidth={1.8} className={cn('text-muted-foreground/70 transition-transform', open && 'rotate-90')} />
        </span>
        <span className="grid w-4 place-items-center shrink-0">
          <BrainCircuit size={14} strokeWidth={1.8} className="text-muted-foreground" />
        </span>
        <span className="text-muted-foreground font-medium">thinking</span>
      </button>
      {open && (
        <div className="ml-7 mt-1 border-l-2 border-border/50 pl-3 py-1 font-sans text-[12.5px] italic leading-relaxed text-muted-foreground/90 whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}
