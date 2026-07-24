import { Folder01, ArrowShrink01, Cpu } from './ui/icons'
import type { ChatState } from '../state'
import { Button } from './ui/Button'

interface Props {
  chat: ChatState
  onCompact(): void
  // debug-panel: toggles the LLM debug drawer (see ../debug-panel/README.md)
  onToggleDebug(): void
  // debug-panel: whether the drawer is currently open (drives the toggle's active state)
  debugOpen: boolean
}

export default function ChatHeader({ chat, onCompact, onToggleDebug, debugOpen }: Props): JSX.Element {
  return (
    <header className="drag-region flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-4 pr-36">
      <div
        className="no-drag relative z-10 flex min-w-0 items-center gap-2 rounded-full border border-border bg-subtle px-3.5 py-1.5 font-mono text-[12px] text-muted-foreground"
        title={chat.cwd}
      >
        <Folder01 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
        <span className="truncate [direction:rtl]">{chat.cwd}</span>
      </div>

      <div className="no-drag relative z-10 ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          title="Compact conversation context"
          onClick={onCompact}
          disabled={chat.running}
        >
          <ArrowShrink01 size={15} strokeWidth={1.8} />
        </Button>

        {/* debug-panel: toggle button for the LLM debug drawer (also closes it) */}
        <Button
          variant={debugOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="rounded-full"
          title={debugOpen ? 'Close LLM debug panel' : 'Open LLM debug panel'}
          aria-pressed={debugOpen}
          onClick={onToggleDebug}
        >
          <Cpu size={15} strokeWidth={1.8} />
        </Button>
      </div>
    </header>
  )
}
