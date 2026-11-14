import { memo, useCallback, useEffect, useRef, useState, KeyboardEvent, ClipboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, ArrowDown01Icon, ArrowUp02Icon, Attachment01Icon, AudioWave01Icon, Cancel01Icon, Mic01Icon, Shield01Icon, StopIcon as StopIconGlyph } from '@hugeicons/core-free-icons'
import { AddToList, Folder01, GitBranch01, Robot01, Tick01 } from './ui/icons'
import ContextViewer from './ContextViewer'
import FileMentionPopup from './FileMentionPopup'
import { api } from '../api'
import type { ContentBlock, GitBranch, ProvidersInfo, ReasoningEffort, WorkspaceFile } from '../../../shared/protocol'
import type { ComposerVariant, EffortSelectorVariant, ModelSelectorVariant } from '../preferences'
import { baseName, cn } from '../util'
import { commandMatches, parseCommand, type CommandName } from '../commands'
import { composerFocus } from '../shortcuts'
import ModelEffortPicker from './ModelEffortPicker'

// ----------------------------------------------------------------------
// Physics & Colors
// ----------------------------------------------------------------------
const SPRING_TRANSITION = "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
const EASE_EXPAND = "cubic-bezier(0.22, 1, 0.36, 1)"

// ----------------------------------------------------------------------
// Sub-components requested by USER
// ----------------------------------------------------------------------

function ArrowUpIcon(): JSX.Element {
  return <HugeiconsIcon icon={ArrowUp02Icon} size={14} strokeWidth={2} aria-hidden />
}

function MicIcon(): JSX.Element {
  return <HugeiconsIcon icon={Mic01Icon} size={15} strokeWidth={1.75} aria-hidden />
}

function StopIcon(): JSX.Element {
  return <HugeiconsIcon icon={StopIconGlyph} size={14} strokeWidth={1.75} className="fill-current" aria-hidden />
}

function WaveformIcon(): JSX.Element {
  return <HugeiconsIcon icon={AudioWave01Icon} size={15} strokeWidth={1.75} aria-hidden />
}

function ChevronDownIcon(): JSX.Element {
  return <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.75} aria-hidden />
}

function PlusIcon(): JSX.Element {
  return <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} aria-hidden />
}

function ClipIcon(): JSX.Element {
  return <HugeiconsIcon icon={Attachment01Icon} size={15} strokeWidth={1.75} aria-hidden />
}

function CloseIcon(): JSX.Element {
  return <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} aria-hidden />
}

function ShieldIcon(): JSX.Element {
  return <HugeiconsIcon icon={Shield01Icon} size={14} strokeWidth={1.6} aria-hidden />
}

// ----------------------------------------------------------------------
// Footer bar controls (footer composer variant)
// ----------------------------------------------------------------------

/** One quiet control row in the footer bar; buttons share this shell. */
const FOOTER_CONTROL = 'flex h-6 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm outline-none transition-colors'

/**
 * Project folder for the footer bar. The chat footer can only point somewhere
 * else by starting a new session, so `onSelect` decides what that means
 * (App opens the home composer; Home just switches the pending project).
 */
function ProjectPicker({
  cwd,
  projects,
  onSelect,
  onAddProject
}: {
  cwd: string | null
  projects: { cwd: string; name: string }[]
  onSelect?(cwd: string): void
  onAddProject?(): void
}): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!cwd) return null
  const current = projects.find((project) => project.cwd === cwd) ?? null
  const label = current?.name ?? baseName(cwd)

  if (!onSelect) {
    return (
      <span className={cn(FOOTER_CONTROL, 'text-muted-foreground')} title={cwd}>
        <Folder01 size={14} strokeWidth={1.6} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
    )
  }

  return (
    <div className="relative min-w-0 shrink-0" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          FOOTER_CONTROL,
          'max-w-[170px]',
          open ? 'bg-hover text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
        )}
        title={cwd}
        aria-label={`Project. Current: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Folder01 size={14} strokeWidth={1.6} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-full left-0 z-50 mb-1 max-h-[280px] w-[220px] origin-bottom-left overflow-y-auto rounded-lg border border-popover-border bg-menu p-1 shadow-[var(--shadow-pop)]"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.99 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            onMouseDown={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Projects"
          >
            {projects.map((project) => {
              const active = project.cwd === cwd
              return (
                <button
                  key={project.cwd}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    if (!active) onSelect(project.cwd)
                  }}
                  title={project.cwd}
                  className={cn(
                    'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm transition-colors',
                    active ? 'bg-selected font-medium text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                  )}
                >
                  <Folder01 size={13} strokeWidth={1.7} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {active && <Tick01 size={12} className="shrink-0 text-muted-foreground" />}
                </button>
              )
            })}
            {onAddProject && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onAddProject()
                }}
                className="mt-1 flex h-7 w-full items-center gap-2 rounded-md border-t border-border px-2 pt-1 text-left text-ui-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              >
                <Add01IconGlyph />
                <span className="min-w-0 flex-1 truncate">Add project…</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Add01IconGlyph(): JSX.Element {
  return <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.7} aria-hidden />
}

/**
 * Current git branch with an upward menu that checks out another one. Hidden
 * outside a repository, so the footer never shows a control that cannot act.
 */
function BranchPicker({ cwd }: { cwd: string | null }): JSX.Element | null {
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (!cwd) {
      setBranches([])
      return
    }
    void window.myagent.git
      .branches(cwd)
      .then((result) => setBranches(result.ok ? result.result : []))
      .catch(() => setBranches([]))
  }, [cwd])

  useEffect(() => {
    setOpen(false)
    setError(null)
    load()
  }, [load])

  // Another surface (the git panel, the source-control window) can move HEAD
  // while this menu is closed; the shared event keeps the label honest.
  useEffect(() => {
    const onMutated = (event: Event): void => {
      const detail = (event as CustomEvent<{ cwd?: string }>).detail
      if (!detail?.cwd || detail.cwd === cwd) load()
    }
    window.addEventListener('myagent:git-mutated', onMutated)
    return () => window.removeEventListener('myagent:git-mutated', onMutated)
  }, [cwd, load])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = branches.find((branch) => branch.current)?.name ?? null
  if (!cwd || !current) return null

  const checkout = async (name: string): Promise<void> => {
    if (!cwd || busy) return
    setBusy(name)
    setError(null)
    const result = await window.myagent.git.checkout(cwd, name)
    setBusy(null)
    if (!result.ok) {
      setError(result.error?.message ?? 'Could not switch branch.')
      return
    }
    setOpen(false)
    load()
    window.dispatchEvent(new CustomEvent('myagent:git-mutated', { detail: { cwd } }))
  }

  return (
    <div className="relative min-w-0 shrink-0" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          FOOTER_CONTROL,
          'max-w-[170px]',
          open ? 'bg-hover text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
        )}
        title={`Branch: ${current}`}
        aria-label={`Branch. Current: ${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <GitBranch01 size={14} strokeWidth={1.6} className="shrink-0" />
        <span className="min-w-0 truncate">{current}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-full left-0 z-50 mb-1 max-h-[280px] w-[230px] origin-bottom-left overflow-y-auto rounded-lg border border-popover-border bg-menu p-1 shadow-[var(--shadow-pop)]"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.99 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            onMouseDown={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Branches"
          >
            {branches.map((branch) => (
              <button
                key={branch.name}
                type="button"
                role="menuitem"
                disabled={!!busy || branch.current}
                onClick={() => void checkout(branch.name)}
                title={branch.upstream ? `Tracking ${branch.upstream}` : branch.name}
                className={cn(
                  'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm transition-colors',
                  branch.current
                    ? 'bg-selected font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                  busy === branch.name && 'opacity-60'
                )}
              >
                <GitBranch01 size={13} strokeWidth={1.7} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {branch.current && <Tick01 size={12} className="shrink-0 text-muted-foreground" />}
              </button>
            ))}
            {error && (
              <p role="alert" className="mx-1 mt-1 border-t border-border px-1 pb-1 pt-2 text-ui-xs text-destructive-foreground">
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ----------------------------------------------------------------------
// Attachments
// ----------------------------------------------------------------------

interface Attachment {
  id: string
  url: string
  name: string
  data: string
  mimeType: string
  size: number
  width?: number
  height?: number
}

const MAX_ATTACHMENTS = 6
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function readImage(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      const marker = url.indexOf(',')
      if (marker < 0) {
        reject(new Error(`Could not encode ${file.name}.`))
        return
      }
      const image = new Image()
      const finish = (width?: number, height?: number): void =>
        resolve({
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          url,
          name: file.name || 'clipboard image',
          data: url.slice(marker + 1),
          mimeType: file.type,
          size: file.size,
          width,
          height
        })
      image.onload = () => finish(image.naturalWidth, image.naturalHeight)
      image.onerror = () => finish()
      image.src = url
    }
    reader.readAsDataURL(file)
  })
}

function AttachmentThumb({
  attachment,
  index,
  onRemove,
  onOpen
}: {
  attachment: Attachment
  index: number
  onRemove: (id: string) => void
  onOpen: (attachment: Attachment, rect: DOMRect) => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      ref={ref}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation()
        if (ref.current) onOpen(attachment, ref.current.getBoundingClientRect())
      }}
      style={{ animationDelay: `${index * 35}ms`, animationFillMode: "backwards" }}
      className={cn(
        "group relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted outline-none",
        "transition-transform duration-200 ease-[var(--ease-smooth-out)] hover:scale-[1.04] active:scale-[0.96]",
        "animate-in fade-in slide-in-from-top-3 zoom-in-90 duration-[var(--duration-fast)]"
      )}
      aria-label={`Open preview of ${attachment.name}`}
    >
      <img src={attachment.url} alt={attachment.name} className="attachment-image size-full object-cover" draggable={false} />
      {/* design:allow — attachment hover scrim over an image thumbnail, not a modal backdrop; it must darken whatever image sits under it. */}
      <span className={cn("absolute inset-0 flex items-start justify-end bg-black/0 transition-colors duration-200", hovered && "bg-black/25")}>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onRemove(attachment.id); }}
          className={cn(
            "m-1 flex size-4 items-center justify-center rounded bg-background/90 text-foreground-subtle transition-colors duration-200 hover:bg-background hover:text-foreground",
            hovered ? "opacity-100 scale-100" : "opacity-0 scale-50 pointer-events-none"
          )}
          aria-label={`Remove ${attachment.name}`}
        >
          <CloseIcon />
        </span>
      </span>
    </button>
  )
}

function AttachmentGalleryModal({
  attachment,
  originRect,
  onClose
}: {
  attachment: Attachment
  originRect: DOMRect
  onClose: () => void
}): JSX.Element {
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening')
  const [targetRect, setTargetRect] = useState<{
    top: number
    left: number
    width: number
    height: number
    radius: number
  } | null>(null)

  useEffect(() => {
    const maxW = Math.min(window.innerWidth * 0.86, 560)
    const maxH = Math.min(window.innerHeight * 0.78, 720)
    const naturalW = attachment.width || 800
    const naturalH = attachment.height || 600
    const scale = Math.min(maxW / naturalW, maxH / naturalH, 1.6)

    const width = naturalW * scale
    const height = naturalH * scale

    setTargetRect({
      top: (window.innerHeight - height) / 2,
      left: (window.innerWidth - width) / 2,
      width,
      height,
      radius: 20
    })

    const raf = requestAnimationFrame(() => setPhase('open'))
    return () => cancelAnimationFrame(raf)
  }, [attachment])

  const handleClose = useCallback(() => setPhase('closing'), [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  const isOpen = phase === 'open'
  const isClosing = phase === 'closing'

  const geometry = isOpen && targetRect
    ? targetRect
    : { top: originRect.top, left: originRect.left, width: originRect.width, height: originRect.height, radius: 8 }

  // Thumbnail → fullscreen is a spatial morph, so it wants a travel ease rather
  // than a bounce: an overshoot on top/left/width/height visibly wobbles the
  // frame past its target. Close is shorter than open, mirroring EASE_IN /
  // EASE_OUT in motion.ts.
  const animEasing = isClosing ? 'cubic-bezier(0.64, 0, 0.78, 0)' : 'cubic-bezier(0.22, 1, 0.36, 1)'
  const animDur = isClosing ? '0.16s' : '0.22s'
  const flipTransition = `top ${animDur} ${animEasing}, left ${animDur} ${animEasing}, width ${animDur} ${animEasing}, height ${animDur} ${animEasing}, border-radius ${animDur} ${animEasing}`

  return (
    <div className="fixed inset-0 z-[100]" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-overlay transition-opacity duration-[var(--duration-medium)]" style={{ opacity: isOpen ? 1 : 0 }} />
      <div
        style={{
          position: 'fixed',
          top: geometry.top, left: geometry.left, width: geometry.width, height: geometry.height,
          borderRadius: geometry.radius, transition: flipTransition, overflow: 'hidden',
          boxShadow: isOpen ? '0 24px 60px -12px rgb(0 0 0 / 0.35)' : '0 0px 0px 0px rgb(0 0 0 / 0)'
        }}
        className="bg-muted"
        onTransitionEnd={() => { if (phase === 'closing') onClose(); }}
        onClick={(e) => e.stopPropagation()}
      >
        <img src={attachment.url} alt={attachment.name} className="attachment-image size-full object-cover" draggable={false} />
      </div>

      <button
        type="button" onClick={handleClose}
        style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? "scale(1)" : "scale(0.7)" }}
        className={cn(
          "fixed right-4 top-4 flex size-8 items-center justify-center rounded-lg bg-card text-foreground-subtle shadow-[var(--shadow-pop)]",
          "transition-[opacity,transform,background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] hover:bg-hover hover:text-foreground",
          !isOpen && "pointer-events-none"
        )}
      >
        <span className="scale-150"><CloseIcon /></span>
      </button>
    </div>
  )
}

// ----------------------------------------------------------------------
// Main Props & Component
// ----------------------------------------------------------------------

interface Props {
  running: boolean
  onSend(content: ContentBlock[], queue: boolean): Promise<void>
  onStop(): void
  placeholder?: string
  model?: string
  providers?: ProvidersInfo
  onModel?(provider: string, model: string): void
  /** Live-refreshes a provider's model list from its /v1/models endpoint when the menu opens. */
  onDiscoverModels?(name: string): void
  effort?: ReasoningEffort
  onSetEffort?(effort: ReasoningEffort): void
  sendOnEnter?: boolean
  queuedFollowUps?: string[]
  notice?: string | null
  onDismissNotice?(): void
  onCommand?(name: CommandName, argument: string): void
  contextSessionId?: string
  contextRevision?: number
  subagentRunning?: boolean
  subagentsOpen?: boolean
  onToggleSubagents?(): void
  /** Compact pill mode: single-row bar shown once a session has started. */
  compact?: boolean
  /** Model picker presentation: compact dropdown or gallery with provider rail. */
  modelSelectorVariant?: ModelSelectorVariant
  /** Effort picker presentation: slider rail (default) or the original chip row. */
  effortSelectorVariant?: EffortSelectorVariant
  /** Composer layout: controls inside the card (`classic`) or in a footer bar. */
  composerVariant?: ComposerVariant
  /** Project root the `@` picker searches; the picker is off without one. */
  cwd?: string | null
  /** Known project folders for the footer bar's project control. */
  projects?: { cwd: string; name: string }[]
  /** Point the composer at another project; absent makes the chip a label. */
  onSelectProject?(cwd: string): void
  onAddProject?(): void
}

/** Draft height caps. The compact pill reuses the same cap as its draft so the
 *  shell can never clip the content it is wrapping. */
const COMPACT_MAX_HEIGHT = 220
const CARD_MAX_HEIGHT = 220
/** Line box of the compact draft (`leading-[24px]`, `p-0`). The draft is
 *  "wrapped" the moment it measures taller than one line; that is what docks
 *  the controls onto their own row and swaps the pill radius for the card one. */
const COMPACT_LINE_HEIGHT = 24
const NEWLINE = String.fromCharCode(10)

/** Draft text, with every inline mention chip serialized back to `@path`. */
function draftText(root: HTMLElement): string {
  let out = ''
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.dataset.mention) {
      out += `@${node.dataset.mention}`
      return
    }
    if (node.tagName === 'BR') {
      out += NEWLINE
      return
    }
    node.childNodes.forEach(walk)
  }
  root.childNodes.forEach(walk)
  return out
}

/** The `@token` being typed, if the caret sits inside one. */
function mentionAtCaret(): { query: string } | null {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null
  const node = sel.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const before = (node.textContent ?? '').slice(0, sel.anchorOffset)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  // Mid-word `@` is an address, not a mention.
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (query.length > 80 || /[\s@]/.test(query)) return null
  return { query }
}

function Composer({
  running,
  onSend,
  onStop,
  placeholder,
  model,
  providers,
  onModel,
  onDiscoverModels,
  effort = '',
  onSetEffort,
  sendOnEnter = true,
  queuedFollowUps = [],
  notice = null,
  onDismissNotice,
  onCommand,
  contextSessionId,
  contextRevision = 0,
  subagentRunning = false,
  subagentsOpen = false,
  onToggleSubagents,
  compact = false,
  modelSelectorVariant = 'compact',
  effortSelectorVariant = 'slider',
  composerVariant = 'classic',
  cwd = null,
  projects = [],
  onSelectProject,
  onAddProject
}: Props): JSX.Element {
  const [text, setText] = useState('')
  const [docked, setDocked] = useState(false)
  const [commandIndex, setCommandIndex] = useState(0)
  // `@file` mentions: the token under the caret drives the picker, and a picked
  // file becomes an inline chip in the draft (see `insertMention`).
  const [mention, setMention] = useState<{ query: string } | null>(null)
  const [mentionFiles, setMentionFiles] = useState<WorkspaceFile[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionLoading, setMentionLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [readingAttachments, setReadingAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [activeAttachment, setActiveAttachment] = useState<{ attachment: Attachment; rect: DOMRect } | null>(null)

  // Voice recording & Web Audio API
  const [isRecording, setIsRecording] = useState(false)
  const [audioData, setAudioData] = useState<number[]>(() => new Array(5).fill(0))

  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const recognitionRef = useRef<any>(null)
  const demoIntervalRef = useRef<number | null>(null)

  const area = useRef<HTMLDivElement>(null)
  const dockedRef = useRef(false)
  /** Width of the input while the controls are still beside it. */
  const inlineWidth = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const attachmentReads = useRef(0)
  const attachmentQueue = useRef<Promise<void>>(Promise.resolve())
  const attachmentsRef = useRef<Attachment[]>([])

  useEffect(() => {
    composerFocus.current = () => area.current?.focus()
    return () => {
      composerFocus.current = null
    }
  }, [])

  const commandSuggestions = commandMatches(text)
  const mentionQuery = mention?.query ?? null

  // Search the project for the token under the caret. Debounced so a typed
  // path costs one walk, and results that arrive after the token changed are
  // dropped rather than flashing into the list.
  useEffect(() => {
    if (!cwd || mentionQuery === null) {
      setMentionFiles([])
      setMentionLoading(false)
      return
    }
    let active = true
    setMentionLoading(true)
    const timer = setTimeout(() => {
      void api.searchFiles(cwd, mentionQuery).then((files) => {
        if (!active) return
        setMentionFiles(files)
        setMentionIndex(0)
        setMentionLoading(false)
      })
    }, 90)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [cwd, mentionQuery])

  const executeCommand = (value: string): boolean => {
    const parsed = parseCommand(value)
    if (!parsed) return false
    if ('error' in parsed) {
      onCommand?.('help', parsed.error)
      return true
    }
    onCommand?.(parsed.command.name, parsed.argument)
    clearDraft()
    return true
  }

  const submit = async (queue: boolean): Promise<void> => {
    if (submittingRef.current || attachmentReads.current > 0) return
    const t = text.trim()
    if (!t && attachments.length === 0) return
    if (t && executeCommand(t)) return
    const content: ContentBlock[] = []
    if (t) content.push({ type: 'text', text: t })
    content.push(...attachments.map(({ data, mimeType }) => ({ type: 'image' as const, data, mimeType })))
    submittingRef.current = true
    setSubmitting(true)
    try {
      await onSend(content, queue)
      clearDraft()
      setMention(null)
      attachmentsRef.current = []
      setAttachments([])
      setAttachmentError(null)
    } catch {
      // Retain draft on error
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    // Mid-composition Enter confirms the IME candidate, it does not send.
    if (e.nativeEvent.isComposing) return
    // The mention list owns the arrows and Enter while it is open.
    if (mention && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((current) => (current + (e.key === 'ArrowDown' ? 1 : -1) + mentionFiles.length) % mentionFiles.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionFiles[mentionIndex] ?? mentionFiles[0])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }
    if (commandSuggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCommandIndex((current) => (current + (e.key === 'ArrowDown' ? 1 : -1) + commandSuggestions.length) % commandSuggestions.length)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        clearDraft()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const command = commandSuggestions[commandIndex] ?? commandSuggestions[0]
        writeDraft(command.slash)
        return
      }
    }
    if (e.key === 'Enter') {
      // Shift+Enter (and Enter when send-on-Enter is off) is a line break. The
      // browser's own paragraph insert would fork the draft into <div>s, so the
      // break goes in as plain text instead.
      if (e.shiftKey || !sendOnEnter) {
        e.preventDefault()
        insertPlainText(NEWLINE)
        return
      }
      e.preventDefault()
      if (commandSuggestions.length > 0 && !text.includes(' ')) {
        const command = commandSuggestions[commandIndex] ?? commandSuggestions[0]
        executeCommand(command.slash)
        return
      }
      void submit(e.ctrlKey && running)
    }
  }

  // One source of truth for draft height: the editable node measures itself and
  // the compact shell follows via `docked`.
  const grow = useCallback((): void => {
    const el = area.current
    if (!el) return

    // Remember the width the input has while the controls sit beside it.
    // The dock decision is always measured at THAT width: docking hands the
    // input the whole row, so measuring at the displayed width would un-wrap
    // the very line that caused the dock, and the layout would flip back and
    // forth right where the text reaches the model picker.
    if (compact && !dockedRef.current && el.clientWidth > 0) inlineWidth.current = el.clientWidth

    let decisionHeight = 0
    if (compact && inlineWidth.current > 0) {
      // Synchronous measure-and-restore, so nothing paints mid-way.
      el.style.width = `${inlineWidth.current}px`
      el.style.height = 'auto'
      decisionHeight = el.scrollHeight
      el.style.width = ''
    }

    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, compact ? COMPACT_MAX_HEIGHT : CARD_MAX_HEIGHT)
    el.style.height = `${next}px`

    const nextDocked = compact && (decisionHeight > COMPACT_LINE_HEIGHT || draftText(el).includes(NEWLINE))
    dockedRef.current = nextDocked
    setDocked(nextDocked)
  }, [compact])

  /** Read the draft out of the editable node after any manual edit. */
  const commitDraft = (): void => {
    const el = area.current
    if (!el) return
    setText(draftText(el))
    setMention(cwd ? mentionAtCaret() : null)
    grow()
  }

  /** Replace the whole draft (slash autocomplete): chips do not survive it. */
  const writeDraft = (next: string): void => {
    const el = area.current
    if (el) {
      el.textContent = next
      if (next) {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
    setText(next)
    grow()
  }

  /** Append at the end while keeping existing chips (dictation). */
  const appendToDraft = (chunk: string): void => {
    const el = area.current
    if (!el) {
      setText((prev) => (prev ? `${prev} ` : '') + chunk)
      return
    }
    el.append(document.createTextNode(`${draftText(el) ? ' ' : ''}${chunk}`))
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    commitDraft()
  }

  const clearDraft = (): void => {
    const el = area.current
    if (el) {
      el.innerHTML = ''
      el.style.height = 'auto'
    }
    setText('')
  }

  /** Newlines and pasted text go in as plain text, never as web markup. */
  const insertPlainText = (plain: string): void => {
    const el = area.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(plain)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    commitDraft()
  }

  /** Turn the `@token` under the caret into an inline chip for `file`. */
  const insertMention = (file: WorkspaceFile): void => {
    const el = area.current
    if (!el) return
    // Focus first: the caret we replace is the one inside this node.
    el.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const drop = (mention?.query.length ?? 0) + 1
    const node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE && range.startOffset >= drop) {
      range.setStart(node, range.startOffset - drop)
    }
    range.deleteContents()
    const chip = document.createElement('span')
    chip.dataset.mention = file.path
    chip.contentEditable = 'false'
    chip.className = 'draft-chip'
    chip.title = file.path
    chip.textContent = file.name
    const space = document.createTextNode(' ')
    const fragment = document.createDocumentFragment()
    fragment.append(chip, space)
    range.insertNode(fragment)
    const caret = document.createRange()
    caret.setStartAfter(space)
    caret.collapse(true)
    sel.removeAllRanges()
    sel.addRange(caret)
    setMention(null)
    commitDraft()
  }

  const onDraftInput = (el: HTMLDivElement): void => {
    let next = draftText(el)
    // Deleting the last character leaves an empty text node or a placeholder
    // <br> behind. That would read as "\n" and keep the draft non-empty, so
    // the placeholder could never come back; normalise it to truly empty.
    if (next === '' || next === NEWLINE) {
      if (el.childNodes.length > 0) el.replaceChildren()
      next = ''
    }
    setText(next)
    setCommandIndex(0)
    setMention(cwd ? mentionAtCaret() : null)
    grow()
  }

  // Re-measure on every text/mode change, not only on keystrokes: dictation,
  // slash-command autocomplete and clear-on-submit all mutate `text` without
  // an input event, and the pill has to morph back down for those as well.
  useEffect(() => {
    grow()
  }, [grow, text])

  // Pill <-> card is a different subtree, so a swap mounts a fresh editable
  // node. Restore the draft into it (chips degrade to their `@path` text).
  useEffect(() => {
    const el = area.current
    if (!el || draftText(el) === text) return
    el.textContent = text
    grow()
  }, [compact])

  const hasText = text.trim().length > 0
  const placeholderText = placeholder ?? (running ? 'Steer the agent. (Ctrl+Enter to queue a follow-up)' : 'Ask anything')
  // The footer layout writes its own affordances into the empty state, so the
  // hint line doubles as the legend for `/` and `@`.
  const footerPlaceholder =
    placeholder ?? (running ? placeholderText : 'Ask anything, / for commands, @ for context')
  const pillTall = docked

  // --- Voice Recording Logic ---
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
      recognitionRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch {}
      audioContextRef.current = null
    }
    if (demoIntervalRef.current) {
      window.clearInterval(demoIntervalRef.current)
      demoIntervalRef.current = null
    }
    setIsRecording(false)
    setAudioData(new Array(5).fill(0))
  }, [])

  const startRecording = useCallback(async () => {
    let stream: MediaStream | null = null
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
    } catch (err) {
      // Microphone access denied or unavailable
    }

    setIsRecording(true)

    if (stream) {
      streamRef.current = stream
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        const audioCtx = new AudioCtx()
        audioContextRef.current = audioCtx
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const updateVisualizer = () => {
          analyser.getByteFrequencyData(dataArray)
          const bands = new Array(5).fill(0)
          const step = Math.floor(dataArray.length / 5)
          for (let i = 0; i < 5; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
              sum += dataArray[i * step + j]
            }
            bands[i] = sum / step / 255
          }
          setAudioData(bands)
          rafRef.current = requestAnimationFrame(updateVisualizer)
        }
        updateVisualizer()
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true

        recognition.onresult = (event: any) => {
          let finalTranscript = ""
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript
            }
          }
          if (finalTranscript) {
            appendToDraft(finalTranscript)
          }
        }

        recognition.onerror = () => stopRecording()
        recognition.onend = () => stopRecording()
        recognitionRef.current = recognition
        try { recognition.start() } catch {}
      }
    } else {
      demoIntervalRef.current = window.setInterval(() => {
        setAudioData(Array.from({ length: 5 }, () => Math.random() * 0.8 + 0.1))
      }, 120)
    }
  }, [stopRecording])

  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  const removeAttachment = (id: string): void => {
    if (submittingRef.current) return
    const next = attachmentsRef.current.filter((attachment) => attachment.id !== id)
    attachmentsRef.current = next
    setAttachments(next)
    setAttachmentError(null)
  }

  const addFiles = (files: File[]): void => {
    if (files.length === 0 || submittingRef.current) return
    attachmentReads.current += 1
    setReadingAttachments(true)
    attachmentQueue.current = attachmentQueue.current
      .then(async () => {
        setAttachmentError(null)
        for (const file of files) {
          if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
            setAttachmentError('Use a PNG, JPEG, GIF, or WebP image.')
            continue
          }
          if (file.size > MAX_ATTACHMENT_BYTES) {
            setAttachmentError(`${file.name || 'Image'} exceeds the 8 MiB limit.`)
            continue
          }

          const beforeRead = attachmentsRef.current
          if (beforeRead.length >= MAX_ATTACHMENTS) {
            setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} images.`)
            break
          }
          if (beforeRead.reduce((sum, attachment) => sum + attachment.size, 0) + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
            setAttachmentError('Attachments exceed the 20 MiB total limit.')
            break
          }

          try {
            const attachment = await readImage(file)
            const current = attachmentsRef.current
            if (current.length >= MAX_ATTACHMENTS) {
              setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} images.`)
              break
            }
            if (current.reduce((sum, item) => sum + item.size, 0) + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
              setAttachmentError('Attachments exceed the 20 MiB total limit.')
              break
            }
            const next = [...current, attachment]
            attachmentsRef.current = next
            setAttachments(next)
          } catch (error) {
            setAttachmentError(error instanceof Error ? error.message : `Could not read ${file.name}.`)
          }
        }
      })
      .finally(() => {
        attachmentReads.current -= 1
        if (attachmentReads.current === 0) setReadingAttachments(false)
      })
  }

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    addFiles(files)
  }

  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length > 0) {
      event.preventDefault()
      addFiles(files)
      return
    }
    // Paste is plain text only: the browser would otherwise drop the source's
    // HTML into the editable node.
    const plain = event.clipboardData.getData('text/plain')
    if (!plain) return
    event.preventDefault()
    insertPlainText(plain)
  }

  const hasAttachments = attachments.length > 0
  const canSubmit = (hasText || hasAttachments) && !readingAttachments
  const retrying = notice != null && /retry/i.test(notice)
  const cmdCount = commandSuggestions.length
  // Visible heights of the merged tray's sections. The tray tucks its last 8px
  // behind the composer, and each section carries its own bottom breathing room.
  const ATTACH_ROW = 64
  const NOTICE_ROW = 40
  // The `@` list is a tab of this same tray, so it is a fixed height like the
  // command list � up to six rows and the tray's bottom breathing.
  const mentionVisible =
    mention && cwd ? Math.min(Math.max(mentionFiles.length, 1), 6) : 0
  const mentionRows = mentionVisible > 0 ? 18 + mentionVisible * 30 + (mentionVisible - 1) * 2 : 0
  const cmdRows = cmdCount > 0 ? cmdCount * 30 + (cmdCount - 1) * 2 + 12 + (hasAttachments || mentionRows > 0 ? 1 : 0) : 0
  const noticeRows = notice ? NOTICE_ROW : 0
  const trayHeight = noticeRows + mentionRows + (hasAttachments ? ATTACH_ROW : 0) + cmdRows

  const showArrow = canSubmit && !isRecording && !running
  const showStop = running || isRecording
  const showMic = !canSubmit && !isRecording && !running

  const onActionButtonClick = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (isRecording) {
      stopRecording()
    } else if (running) {
      onStop()
    } else if (canSubmit) {
      void submit(false)
    } else {
      startRecording()
    }
  }

  // The footer layout keeps an explicit mic beside a send button that stays a
  // send button (muted while there is nothing to send) instead of morphing.
  const onPrimaryClick = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (isRecording) {
      stopRecording()
    } else if (running) {
      onStop()
    } else if (canSubmit) {
      void submit(false)
    }
  }
  const primaryLive = canSubmit || running || isRecording

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col">
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple onChange={onFilesChosen} disabled={submitting} className="hidden" tabIndex={-1} aria-hidden />

      <AnimatePresence initial={false}>
        {attachmentError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="mb-2 flex min-h-10 items-center justify-between gap-3 rounded-lg bg-destructive/8 px-3 text-ui-sm text-destructive-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--destructive)_20%,transparent)]"
          >
            <span>{attachmentError}</span>
            <button type="button" onClick={() => setAttachmentError(null)} className="grid size-8 shrink-0 place-items-center rounded-lg text-destructive-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive-foreground" aria-label="Dismiss attachment error">
              <CloseIcon />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* One tray for the status notice, `@` file list, attachment thumbnails
          and the `/` command list. Stacking them in one surface keeps a notice
          and command menu visually connected instead of floating as separate tabs. */}
      <div
        aria-hidden={trayHeight === 0}
        style={{ height: trayHeight, transition: `height ${noticeRows > 0 ? 'var(--toast-open)' : '0.14s'} ${noticeRows > 0 ? 'var(--toast-ease)' : EASE_EXPAND}` }}
        className="relative z-0 w-full overflow-hidden"
      >
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: 20,
            right: 20,
            height: trayHeight + 8,
            paddingBottom: 8,
            transform: trayHeight > 0 ? 'translateY(0)' : 'translateY(100%)',
            opacity: trayHeight > 0 ? 1 : 0,
            transition: `transform ${noticeRows > 0 ? 'var(--toast-open)' : '0.14s'} ${noticeRows > 0 ? 'var(--toast-ease)' : EASE_EXPAND}, opacity 0.1s ease-out`
          }}
          className="flex flex-col overflow-hidden rounded-t-lg border border-b-0 border-border bg-muted"
        >
          {noticeRows > 0 && (
            <div
              style={{ height: NOTICE_ROW }}
              className={cn('flex shrink-0 items-center gap-2 overflow-hidden px-3', trayHeight > noticeRows && 'border-b border-border/60')}
            >
              {retrying ? (
                <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-warning border-t-transparent" aria-hidden />
              ) : (
                <span className="size-2 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
              )}
              {retrying ? (
                <span className="shimmer-text min-w-0 flex-1 truncate whitespace-nowrap text-ui-sm font-medium">{notice}</span>
              ) : (
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-ui-sm font-medium text-muted-foreground">{notice}</span>
              )}
              {!retrying && (
                <button
                  type="button"
                  onClick={onDismissNotice}
                  className="grid size-5 shrink-0 place-items-center rounded-md text-foreground-subtlest transition-colors hover:bg-hover hover:text-foreground"
                  aria-label="Dismiss notice"
                  title="Dismiss"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          )}
          {mentionRows > 0 && (
            <div
              style={{ height: mentionRows }}
              className={cn('shrink-0', (hasAttachments || cmdCount > 0) && 'border-b border-border/60')}
            >
              <FileMentionPopup
                files={mentionFiles}
                activeIndex={mentionIndex}
                loading={mentionLoading}
                onHover={setMentionIndex}
                onPick={insertMention}
              />
            </div>
          )}
          {hasAttachments && (
            <div
              style={{ height: ATTACH_ROW }}
              className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto px-2.5"
            >
              {attachments.map((attachment, index) => (
                <AttachmentThumb
                  key={attachment.id}
                  attachment={attachment}
                  index={index}
                  onRemove={removeAttachment}
                  onOpen={(a, rect) => setActiveAttachment({ attachment: a, rect })}
                />
              ))}
              <span className="sticky right-0 ml-auto shrink-0 pl-2 text-ui-xs text-foreground-subtlest">
                {attachments.length} image{attachments.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
          {cmdCount > 0 && (
            <div
              style={{ height: cmdRows }}
              className={cn(
                'flex shrink-0 flex-col gap-0.5 px-1.5 pt-1.5',
                (hasAttachments || mentionRows > 0 || noticeRows > 0) && 'border-t border-border/60'
              )}
            >
              {commandSuggestions.map((command, index) => (
                <button
                  key={command.name}
                  type="button"
                  className={cn(
                    'flex h-[30px] w-full items-center rounded-lg px-2.5 text-left text-ui-caption transition-colors',
                    index === commandIndex ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                  )}
                  title={command.description}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setCommandIndex(index)}
                  onClick={() => executeCommand(command.slash)}
                >
                  <span className="min-w-0 truncate">{command.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {cmdCount === 0 && subagentRunning && onToggleSubagents && (
        <div className="relative z-0 h-6 w-full overflow-hidden">
          <div
            style={{ position: 'absolute', bottom: -8, left: 20, width: 36, height: 32 }}
            className="rounded-t-lg border border-b-0 border-border bg-muted"
          >
            <button
              type="button"
              onClick={onToggleSubagents}
              aria-label="Open subagents"
              aria-expanded={subagentsOpen}
              title="Subagents"
              className="grid size-full place-items-center rounded-t-lg text-muted-foreground outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Robot01 size={14} strokeWidth={1.6} />
            </button>
          </div>
        </div>
      )}

      {/* Main Input: expanded card, or compact pill once a session has started.
          The two branches are different subtrees, so the class list only
          transitions the properties of this same node — radius and fill — and
          the draft carries its own `transition-[height]`. The draft itself is a
          contenteditable rather than a textarea so `@file` mentions can sit
          inline as chips. */}
      <div
        className={cn(
          'relative z-10 rounded-xl transition-[background-color] duration-[var(--resize-dur)] ease-[var(--resize-ease)]',
          // The footer layout carries two stacked surfaces with their own
          // borders, so the classic running ring would double up here.
          !compact && composerVariant === 'classic' && 'p-px',
          running && !compact && composerVariant === 'classic' ? 'bg-input' : 'bg-transparent'
        )}
      >
        {composerVariant === 'footer' ? (
        <div className="flex flex-col">
          <div
            onMouseDown={(e) => {
              if (e.target !== area.current && !isRecording) {
                e.preventDefault()
                area.current?.focus()
              }
            }}
            className="relative overflow-visible rounded-xl border border-border bg-composer transition-[border-color,box-shadow] focus-within:border-ring/40 focus-within:ring-1 focus-within:ring-ring/20 hover:border-input-border-hover"
          >
            <div className="relative px-4 pb-1.5 pt-3">
              {!text && (
                <span aria-hidden className="pointer-events-none absolute inset-x-4 top-3 truncate text-ui-base font-medium leading-relaxed text-foreground-subtlest select-none">
                  {footerPlaceholder}
                </span>
              )}
              <div
                ref={area}
                contentEditable={!isRecording && !submitting}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="Message"
                onInput={(e) => onDraftInput(e.currentTarget)}
                onBlur={() => setMention(null)}
                onKeyDown={onKey}
                onPaste={onPaste}
                className={cn(
                  'draft-input min-h-[22px] max-h-[220px] w-full overflow-y-auto break-words border-0 bg-transparent p-0 text-ui-base leading-relaxed text-foreground outline-none',
                  (isRecording || submitting) && 'opacity-70'
                )}
              />
            </div>

            <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
              {/* Attach: a bordered circle, sitting under the draft. */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInput.current?.click()}
                disabled={submitting || attachments.length >= MAX_ATTACHMENTS}
                className="grid size-7 shrink-0 place-items-center rounded-full border border-input text-muted-foreground outline-none transition-colors hover:border-input-border-hover hover:bg-hover hover:text-foreground disabled:opacity-40"
                title="Attach images"
                aria-label="Attach images"
              >
                <PlusIcon />
              </button>

              <div className="flex shrink-0 items-center gap-1">
                {/* Audio wave overlay while recording */}
                <div
                  className={cn(
                    'flex h-7 items-center justify-end gap-[3px] overflow-hidden transition-all duration-150 ease-[var(--ease-smooth-out)]',
                    isRecording ? 'w-16 opacity-100' : 'pointer-events-none w-0 opacity-0'
                  )}
                >
                  {audioData.map((val, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full bg-primary transition-[height] duration-75 ease-out"
                      style={{ height: `${Math.max(4, val * 22)}px` }}
                    />
                  ))}
                </div>

                {running && (
                  <button
                    type="button"
                    className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
                    title="Queue as follow-up (Ctrl+Enter)"
                    onClick={() => void submit(true)}
                    disabled={!canSubmit || submitting}
                  >
                    <AddToList size={15} strokeWidth={1.8} />
                  </button>
                )}

                {contextSessionId && <ContextViewer key={contextSessionId} sessionId={contextSessionId} running={running} revision={contextRevision} model={model} />}

                {showMic && (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                    onClick={() => void startRecording()}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                    title="Voice input"
                    aria-label="Use voice input"
                  >
                    <MicIcon />
                  </button>
                )}

                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onClick={onPrimaryClick}
                  disabled={submitting || !primaryLive}
                  aria-label={showStop ? 'Stop recording or generation' : 'Send prompt'}
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-[var(--duration-quick)] focus-visible:ring-2 focus-visible:ring-ring',
                    primaryLive
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-muted text-foreground-subtlest'
                  )}
                >
                  {showStop ? <StopIcon /> : <ArrowUpIcon />}
                </button>
              </div>
            </div>
          </div>

          {/* Footer bar: what this run may touch, where it runs, and with which
              model. Square top corners and a hairline pull-up join it to the
              input card, so the two read as one panel with no gap. */}
          <div className="-mt-px mx-2 flex min-h-8 items-center gap-0.5 rounded-b-xl border border-border bg-composer-footer px-1">
            {/* Static label: this renderer has no permission modes to switch,
                so the bar states the mode it always runs in. */}
            <span
              className={cn(FOOTER_CONTROL, 'text-muted-foreground')}
              title="Full access"
            >
              <ShieldIcon />
              <span className="shrink-0">Full access</span>
            </span>
            <ProjectPicker cwd={cwd} projects={projects} onSelect={onSelectProject} onAddProject={onAddProject} />
            <BranchPicker cwd={cwd} />
            <div className="ml-auto flex min-w-0 items-center pl-1">
              {providers && onModel && (
                <ModelEffortPicker
                  model={model}
                  providers={providers}
                  effort={effort}
                  onModel={onModel}
                  onSetEffort={onSetEffort}
                  onDiscoverModels={onDiscoverModels}
                  modelSelectorVariant={modelSelectorVariant}
                  effortSelectorVariant={effortSelectorVariant}
                  trigger="bare"
                  align="right"
                  disabled={running}
                />
              )}
            </div>
          </div>
        </div>
        ) : compact ? (
        <div
          onMouseDown={(e) => {
            if (e.target !== area.current && !isRecording) {
              e.preventDefault()
              area.current?.focus()
            }
          }}
          className={cn(
            'flex min-h-12 items-center gap-1 overflow-visible rounded-xl border border-border bg-composer py-1.5 pl-1.5 pr-1.5 transition-[border-color,height] duration-[var(--resize-dur)] ease-[var(--resize-ease)] hover:border-input-border-hover',
            // One row stays compact; a wrapped draft puts the controls beneath
            // the input without changing the card's silhouette.
            pillTall ? 'flex-wrap' : 'flex-nowrap'
          )}
        >
          {/* Attach */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInput.current?.click()}
            disabled={submitting || attachments.length >= MAX_ATTACHMENTS}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
            title="Attach images"
            aria-label="Attach images"
          >
            <ClipIcon />
          </button>

          {/* Input. Once the draft wraps this claims the whole first row
              (`order-first w-full`), which is what pushes every control below
              it — the same reflow the reference does. Inline it just takes the
              leftover space between attach and the right-hand tools. */}
          <div className={cn('relative', pillTall ? 'order-first w-full pl-4 pr-2' : 'min-w-0 flex-1')}>
            {!text && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute top-0 right-0 truncate text-ui-base font-normal leading-[24px] text-muted-foreground select-none',
                  pillTall ? 'left-4' : 'left-0'
                )}
              >
                {placeholderText}
              </span>
            )}
            <div
              ref={area}
              contentEditable={!isRecording && !submitting}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Message"
              onInput={(e) => onDraftInput(e.currentTarget)}
              onBlur={() => setMention(null)}
              onKeyDown={onKey}
              onPaste={onPaste}
              className={cn(
                'draft-input block min-h-[24px] w-full overflow-y-auto break-words border-0 bg-transparent p-0 text-ui-base leading-[24px] text-foreground outline-none transition-[height] duration-[var(--resize-dur)] ease-[var(--resize-ease)]',
                (isRecording || submitting) && 'opacity-70'
              )}
            />
          </div>

          <div className="flex items-center gap-1">
          {/* Model + effort, behind one control. The popup carries both
              pickers plus a reset row; see ModelEffortPicker. */}
          {providers && onModel && (
            <ModelEffortPicker
              model={model}
              providers={providers}
              effort={effort}
              onModel={onModel}
              onSetEffort={onSetEffort}
              onDiscoverModels={onDiscoverModels}
              modelSelectorVariant={modelSelectorVariant}
              effortSelectorVariant={effortSelectorVariant}
              align="right"
              disabled={running}
            />
          )}

          {/* Grey mic (idle empty state, like reference) */}
          {showMic && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={() => void startRecording()}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
              title="Voice input"
              aria-label="Use voice input"
            >
              <MicIcon />
            </button>
          )}

          {/* Recording visualizer */}
          <div
            className={cn(
              'flex h-8 items-center justify-end gap-[3px] overflow-hidden transition-all duration-150 ease-[var(--ease-smooth-out)]',
              isRecording ? 'w-14 opacity-100' : 'w-0 opacity-0 pointer-events-none'
            )}
          >
            {audioData.map((val, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-primary transition-[height] duration-75 ease-out"
                style={{ height: `${Math.max(4, val * 24)}px` }}
              />
            ))}
          </div>

          {running && (
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
              title="Queue as follow-up (Ctrl+Enter)"
              onClick={() => void submit(true)}
              disabled={!canSubmit || submitting}
            >
              <AddToList size={15} strokeWidth={1.8} />
            </button>
          )}

          {contextSessionId && <ContextViewer key={contextSessionId} sessionId={contextSessionId} running={running} revision={contextRevision} model={model} />}
          </div>

          {/* Docked row only: pushes the send button to the far right while the
              rest of the controls stay grouped on the left. Absent inline. */}
          {pillTall && <div className="flex-1" aria-hidden />}

          {/* Primary action: wave (idle) / arrow (ready) / stop (busy) */}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={onActionButtonClick}
            disabled={submitting}
            aria-label={showArrow ? "Send prompt" : showStop ? "Stop recording or generation" : "Use voice input"}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground outline-none transition-all duration-[var(--duration-quick)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring cursor-default disabled:opacity-50"
          >
            <span className="relative flex h-full w-full items-center justify-center">
              <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-150 ease-[var(--ease-smooth-out)]", showArrow ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 rotate-45 pointer-events-none")}>
                <ArrowUpIcon />
              </span>
              <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-150 ease-[var(--ease-smooth-out)]", showMic ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-45 pointer-events-none")}>
                <WaveformIcon />
              </span>
              <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-150 ease-[var(--ease-smooth-out)]", showStop ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 rotate-45 pointer-events-none")}>
                <StopIcon />
              </span>
            </span>
          </button>
        </div>
        ) : (
        <div
          onMouseDown={(e) => {
            if (e.target !== area.current && !isRecording) {
              e.preventDefault()
              area.current?.focus()
            }
          }}
          className="relative overflow-visible rounded-xl border border-border bg-composer transition-[border-color,box-shadow] focus-within:border-ring/40 focus-within:ring-1 focus-within:ring-ring/20 hover:border-input-border-hover"
        >
          <div className="relative px-3.5 pb-[46px] pt-3.5">
            {!text && (
              <span aria-hidden className="pointer-events-none absolute inset-x-3.5 top-3.5 truncate text-ui-base font-medium leading-relaxed text-foreground-subtlest select-none">
                {placeholderText}
              </span>
            )}
            <div
              ref={area}
              contentEditable={!isRecording && !submitting}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Message"
              onInput={(e) => onDraftInput(e.currentTarget)}
              onBlur={() => setMention(null)}
              onKeyDown={onKey}
              onPaste={onPaste}
              className={cn(
                'draft-input min-h-[56px] max-h-[220px] w-full overflow-y-auto break-words border-0 bg-transparent p-0 text-ui-base leading-relaxed text-foreground outline-none',
                (isRecording || submitting) && 'opacity-70'
              )}
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2 pb-2">
            {/* Left controls: model + effort · attach */}
            <div className="flex min-w-0 items-center gap-1">
              {providers && onModel && (
                <ModelEffortPicker
                  model={model}
                  providers={providers}
                  effort={effort}
                  onModel={onModel}
                  onSetEffort={onSetEffort}
                  onDiscoverModels={onDiscoverModels}
                  modelSelectorVariant={modelSelectorVariant}
                  effortSelectorVariant={effortSelectorVariant}
                  disabled={running}
                />
              )}

              {/* Attach button */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInput.current?.click()}
                disabled={submitting || attachments.length >= MAX_ATTACHMENTS}
                className="chip size-8 justify-center px-0 flex items-center"
                title="Attach images"
              >
                <PlusIcon />
              </button>
            </div>

            {/* Right controls: voice visualizer · queue · action button */}
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Audio Wave Visualizer Overlay */}
              <div
                className={cn(
                  'flex h-8 items-center justify-end gap-[3px] overflow-hidden transition-all duration-150 ease-[var(--ease-smooth-out)]',
                  isRecording ? 'w-16 opacity-100' : 'w-0 opacity-0 pointer-events-none'
                )}
              >
                {audioData.map((val, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-primary transition-[height] duration-75 ease-out"
                    style={{ height: `${Math.max(4, val * 24)}px` }}
                  />
                ))}
              </div>

              {running && (
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
                  title="Queue as follow-up (Ctrl+Enter)"
                  onClick={() => void submit(true)}
                  disabled={!canSubmit || submitting}
                >
                  <AddToList size={15} strokeWidth={1.8} />
                </button>
              )}

              {contextSessionId && <ContextViewer key={contextSessionId} sessionId={contextSessionId} running={running} revision={contextRevision} model={model} />}

              {/* Action Button: Morphing ArrowUp / Mic / Stop */}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={onActionButtonClick}
                disabled={submitting}
                aria-label={showArrow ? "Send prompt" : showStop ? "Stop recording or generation" : "Use voice input"}
                className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground outline-none transition-all duration-[var(--duration-quick)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring cursor-default disabled:opacity-50"
              >
                <span className="relative flex h-full w-full items-center justify-center">
                  <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-150 ease-[var(--ease-smooth-out)]", showArrow ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 rotate-45 pointer-events-none")}>
                    <ArrowUpIcon />
                  </span>
                  <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-150 ease-[var(--ease-smooth-out)]", showMic ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-45 pointer-events-none")}>
                    <MicIcon />
                  </span>
                  <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-150 ease-[var(--ease-smooth-out)]", showStop ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 rotate-45 pointer-events-none")}>
                    <StopIcon />
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {activeAttachment &&
        createPortal(
          <AttachmentGalleryModal attachment={activeAttachment.attachment} originRect={activeAttachment.rect} onClose={() => setActiveAttachment(null)} />,
          document.body
        )}
    </div>
  )
}

// The composer owns the draft, the model/effort pickers and the voice recorder,
// none of which change while an answer streams in. Its props are deliberately
// identity-stable (App hands it ref-backed callbacks), so memoising it keeps
// the whole 1.7k-line surface out of the per-token render path.
export default memo(Composer)
