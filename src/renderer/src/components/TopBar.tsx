import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Archive01,
  ArrowShrink01,
  Cpu,
  Edit01,
  GitBranch01,
  HelpCircle,
  MoreHorizontal,
  Settings01
} from './ui/icons'
import type { ChatState } from '../state'
import { BLOOM_FAST, bloomDown } from '../motion'
import { baseName, cn } from '../util'

/**
 * Unified top strip. Owns the window drag region (the TabBar inside it is the
 * drag surface) and gathers every chrome action that used to live in a separate,
 * mostly-empty ChatHeader row: Git, the LLM debug drawer, the session overflow
 * menu, and a profile menu for app-level actions (Settings, Shortcuts).
 *
 * `chat` is null on the Home screen — then only the profile menu renders and the
 * session actions disappear entirely.
 */
interface Props {
  chat: ChatState | null
  title?: string
  onCompact(): void
  onRename(): void
  onArchive(): void
  onToggleDebug(): void
  debugOpen: boolean
  onToggleGit(): void
  gitOpen: boolean
  onSettings(): void
  settingsOpen: boolean
  onHelp(): void
}

function iconButton(active: boolean): string {
  return cn(
    'grid size-8 shrink-0 place-items-center rounded-full outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
  )
}

/** Small shared avatar so the trigger and menu header read as one identity. */
function Avatar({ size }: { size: number }): JSX.Element {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-neutral-400 to-neutral-700 font-semibold text-white dark:from-neutral-500 dark:to-neutral-800"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      M
    </span>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  title
}: {
  icon: JSX.Element
  label: string
  onClick(): void
  disabled?: boolean
  title?: string
}): JSX.Element {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-caption text-foreground transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/** Shared bloom-down popover shell used by both menus. */
function Popover({
  anchorRef,
  width,
  children
}: {
  anchorRef: React.RefObject<HTMLDivElement>
  width: number
  children: React.ReactNode
}): JSX.Element {
  return (
    <motion.div
      ref={anchorRef}
      variants={bloomDown}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={BLOOM_FAST}
      className="absolute right-0 top-9 z-50 origin-top-right overflow-hidden rounded-lg border border-popover-border bg-menu py-1 shadow-md"
      style={{ width }}
    >
      {children}
    </motion.div>
  )
}

function TopBar(props: Props): JSX.Element {
  const {
    chat, title, onCompact, onRename, onArchive,
    onToggleDebug, debugOpen, onToggleGit, gitOpen,
    onSettings, onHelp
  } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen && !profileOpen) return
    const close = (): void => { setMenuOpen(false); setProfileOpen(false) }
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || profileRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [menuOpen, profileOpen])

  const project = chat ? baseName(chat.cwd) : null
  const sessionLabel = title || project || ''

  return (
    <div className="no-drag ml-auto flex shrink-0 items-center gap-1">
      {chat && (
        <>
          <button
            className={iconButton(gitOpen)}
            title={gitOpen ? 'Close source control' : 'Open source control'}
            aria-pressed={gitOpen}
            aria-label="Source control"
            onClick={onToggleGit}
          >
            <GitBranch01 size={15} strokeWidth={1.8} />
          </button>
          {/* debug-panel: toggle button for the LLM debug drawer */}
          <button
            className={iconButton(debugOpen)}
            title={debugOpen ? 'Close LLM debug panel' : 'Open LLM debug panel'}
            aria-pressed={debugOpen}
            aria-label="LLM debug panel"
            onClick={onToggleDebug}
          >
            <Cpu size={15} strokeWidth={1.8} />
          </button>

          <div className="relative">
            <button
              className={iconButton(menuOpen)}
              title="Session actions"
              aria-label="Session actions"
              aria-expanded={menuOpen}
              onClick={() => { setProfileOpen(false); setMenuOpen((v) => !v) }}
            >
              <MoreHorizontal size={16} strokeWidth={1.8} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <Popover anchorRef={menuRef} width={224}>
                  <div className="border-b border-border/60 px-3 py-2">
                    <div className="truncate text-ui-caption font-semibold text-foreground">{sessionLabel}</div>
                    {title && project && (
                      <div className="mt-0.5 truncate text-ui-sm text-muted-foreground">{project}</div>
                    )}
                  </div>
                  <MenuItem
                    icon={<Edit01 size={12} className="shrink-0 text-muted-foreground" />}
                    label="Rename"
                    onClick={() => { onRename(); setMenuOpen(false) }}
                  />
                  <MenuItem
                    icon={<ArrowShrink01 size={12} className="shrink-0 text-muted-foreground" />}
                    label="Compact context"
                    disabled={chat.running}
                    title={chat.running ? 'Stop the active run before compacting' : undefined}
                    onClick={() => { onCompact(); setMenuOpen(false) }}
                  />
                  <MenuItem
                    icon={<Archive01 size={12} className="shrink-0 text-muted-foreground" />}
                    label="Archive"
                    onClick={() => { onArchive(); setMenuOpen(false) }}
                  />
                </Popover>
              )}
            </AnimatePresence>
          </div>

          <div className="mx-1 h-5 w-px shrink-0 bg-border/60" aria-hidden />
        </>
      )}
      {/* Profile / app menu. Always present, so Home and a session share the
          same top-right anchor — the mockups put Settings and help here. */}
      <div className="relative">
        <button
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full outline-none transition-shadow',
            'focus-visible:ring-2 focus-visible:ring-ring',
            profileOpen ? 'ring-2 ring-ring/40' : 'hover:ring-2 hover:ring-ring/25'
          )}
          title="Account & settings"
          aria-label="Account & settings"
          aria-expanded={profileOpen}
          onClick={() => { setMenuOpen(false); setProfileOpen((v) => !v) }}
        >
          <Avatar size={22} />
        </button>
        <AnimatePresence>
          {profileOpen && (
            <Popover anchorRef={profileRef} width={224}>
              <div className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2.5">
                <Avatar size={30} />
                <div className="min-w-0">
                  <div className="truncate text-ui-caption font-semibold text-foreground">Local workspace</div>
                  <div className="truncate text-ui-sm text-muted-foreground">this device</div>
                </div>
              </div>
              <MenuItem
                icon={<Settings01 size={13} className="shrink-0 text-muted-foreground" />}
                label="Settings"
                onClick={() => { onSettings(); setProfileOpen(false) }}
              />
              <MenuItem
                icon={<HelpCircle size={13} className="shrink-0 text-muted-foreground" />}
                label="Shortcuts & commands"
                onClick={() => { onHelp(); setProfileOpen(false) }}
              />
            </Popover>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default memo(TopBar)

