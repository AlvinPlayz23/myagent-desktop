import { ArrowShrink01, Cpu } from './ui/icons'
import type { ChatState } from '../state'
import { Button } from './ui/Button'

interface Props {
  chat: ChatState
  title?: string
  onCompact(): void
  // debug-panel: toggles the LLM debug drawer (see ../debug-panel/README.md)
  onToggleDebug(): void
  // debug-panel: whether the drawer is currently open (drives the toggle's active state)
  debugOpen: boolean
}

export default function ChatHeader({ chat, title, onCompact, onToggleDebug, debugOpen }: Props): JSX.Element {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-4">
      <span className="truncate text-[14px] font-medium text-foreground select-none pointer-events-none">
        {title || chat.cwd}
      </span>

      <div className="no-drag ml-auto flex items-center gap-2">
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

