import { useCallback, useEffect, useRef, useState, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AddToList, ChevronDown, ChevronRight, Search01, Tick01 } from './ui/icons'
import type { ProvidersInfo } from '../../../shared/protocol'
import { cn } from '../util'
import { commandMatches, parseCommand, type CommandName } from '../commands'
import { composerFocus, composerModelPicker } from '../shortcuts'
import { BLOOM_FAST, bloomUp } from '../motion'

const PROVIDER_DOT: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97706',
  ollama: '#6366f1',
  openrouter: '#ec4899',
  lmstudio: '#14b8a6',
  vllm: '#8b5cf6',
  aihubmix: '#0ea5e9',
  zenmux: '#f59e0b'
}

const SPRING = 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'

/** Effort levels are UI-only for now — the backend does not consume them yet. */
const EFFORTS = ['Low', 'Medium', 'Max'] as const

/** Attachments are mock-only: picked and previewed, but never sent. */
const MAX_ATTACHMENTS = 6

function dotColor(name: string): string {
  return PROVIDER_DOT[name] ?? '#9ca3af'
}

function ProviderDot({ name, size = 8 }: { name: string; size?: number }): JSX.Element {
  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: dotColor(name) }}
      aria-hidden
    />
  )
}

// ── Inline glyphs (thin-stroke set from the new composer design) ────────────
function ArrowUpGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MicGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="5" y="1" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.75 6.5V7a4.25 4.25 0 0 0 8.5 0v-.5M7 11.25V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function StopGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function PlusGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CloseGlyph(): JSX.Element {
  return (
    <svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** A label whose container width animates as the text swaps, with a soft fade. */
function MorphingText({ text }: { text: string }): JSX.Element {
  const [width, setWidth] = useState<number | 'auto'>('auto')
  const measure = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (measure.current) setWidth(measure.current.offsetWidth)
  }, [text])
  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden align-middle"
      style={{ width, transition: `width 0.3s ${SPRING}` }}
    >
      <span ref={measure} className="invisible whitespace-nowrap px-0.5">
        {text}
      </span>
      <motion.span
        key={text}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
      >
        {text}
      </motion.span>
    </span>
  )
}

// ── Mock attachments ────────────────────────────────────────────────────────
interface Attachment {
  id: string
  url: string
  name: string
  width?: number
  height?: number
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
    <motion.button
      ref={ref}
      type="button"
      layout
      initial={{ opacity: 0, y: -12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.28, ease: [0.175, 0.885, 0.32, 1.275], delay: index * 0.035 }}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation()
        if (ref.current) onOpen(attachment, ref.current.getBoundingClientRect())
      }}
      className="group relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted outline-none transition-transform duration-200 hover:scale-[1.04] active:scale-[0.96]"
      aria-label={`Open preview of ${attachment.name}`}
    >
      <img src={attachment.url} alt={attachment.name} className="size-full object-cover" draggable={false} />
      <span className={cn('absolute inset-0 flex items-start justify-end transition-colors duration-200', hovered && 'bg-black/25')}>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(attachment.id)
          }}
          className={cn(
            'm-1 flex size-4 items-center justify-center rounded-full bg-background/90 text-foreground/70 shadow-sm transition-all duration-200 hover:scale-110 hover:bg-background hover:text-foreground',
            hovered ? 'scale-100 opacity-100' : 'pointer-events-none scale-50 opacity-0'
          )}
          aria-label={`Remove ${attachment.name}`}
        >
          <CloseGlyph />
        </span>
      </span>
    </motion.button>
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
  const [target, setTarget] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const maxW = Math.min(window.innerWidth * 0.86, 560)
    const maxH = Math.min(window.innerHeight * 0.78, 720)
    const nw = attachment.width || 800
    const nh = attachment.height || 600
    const scale = Math.min(maxW / nw, maxH / nh, 1.6)
    const width = nw * scale
    const height = nh * scale
    setTarget({ top: (window.innerHeight - height) / 2, left: (window.innerWidth - width) / 2, width, height })
    const raf = requestAnimationFrame(() => setPhase('open'))
    return () => cancelAnimationFrame(raf)
  }, [attachment])

  const close = useCallback(() => setPhase('closing'), [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const isOpen = phase === 'open'
  const isClosing = phase === 'closing'
  const geo =
    isOpen && target
      ? { ...target, radius: 20 }
      : { top: originRect.top, left: originRect.left, width: originRect.width, height: originRect.height, radius: 12 }

  const ease = isClosing ? 'ease-out' : SPRING
  const dur = isClosing ? '0.3s' : '0.45s'
  const flip = `top ${dur} ${ease}, left ${dur} ${ease}, width ${dur} ${ease}, height ${dur} ${ease}, border-radius ${dur} ${ease}`

  return (
    <div className="fixed inset-0 z-[100]" onClick={close} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md transition-opacity duration-300" style={{ opacity: isOpen ? 1 : 0 }} />
      <div
        style={{
          position: 'fixed',
          top: geo.top,
          left: geo.left,
          width: geo.width,
          height: geo.height,
          borderRadius: geo.radius,
          transition: flip,
          overflow: 'hidden',
          boxShadow: isOpen ? '0 24px 60px -12px rgb(0 0 0 / 0.35)' : '0 0 0 0 rgb(0 0 0 / 0)'
        }}
        className="bg-muted"
        onTransitionEnd={() => {
          if (phase === 'closing') onClose()
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img src={attachment.url} alt={attachment.name} className="size-full object-cover" draggable={false} />
      </div>
      <button
        type="button"
        onClick={close}
        style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? 'scale(1)' : 'scale(0.7)' }}
        className={cn(
          'fixed right-4 top-4 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground/70 shadow-md backdrop-blur-sm transition-all duration-300 hover:bg-card hover:text-foreground',
          !isOpen && 'pointer-events-none'
        )}
        aria-label="Close preview"
      >
        <span className="scale-150">
          <CloseGlyph />
        </span>
      </button>
    </div>
  )
}

interface Props {
  running: boolean
  onSend(text: string, queue: boolean): void
  onStop(): void
  placeholder?: string
  model?: string
  providers?: ProvidersInfo
  onModel?(provider: string, model: string): void
  sendOnEnter?: boolean
  queuedFollowUps?: string[]
  notice?: string | null
  onDismissNotice?(): void
  onCommand?(name: CommandName, argument: string): void
}

type HoverStyle = { opacity: number; transform: string; transition: string }
const HOVER_HIDDEN: HoverStyle = { opacity: 0, transform: 'translateY(0px) scale(0.95)', transition: 'none' }

export default function Composer({
  running,
  onSend,
  onStop,
  placeholder,
  model,
  providers,
  onModel,
  sendOnEnter = true,
  queuedFollowUps = [],
  notice = null,
  onDismissNotice,
  onCommand
}: Props): JSX.Element {
  const [text, setText] = useState('')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [commandIndex, setCommandIndex] = useState(0)
  const [hoverStyle, setHoverStyle] = useState<HoverStyle>(HOVER_HIDDEN)

  // UI-only extras adopted from the new composer design.
  const [effortIndex, setEffortIndex] = useState(1)
  const [effortMenuOpen, setEffortMenuOpen] = useState(false)
  const effortMenuRef = useRef<HTMLDivElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [activeAttachment, setActiveAttachment] = useState<{ attachment: Attachment; rect: DOMRect } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioData, setAudioData] = useState<number[]>(() => new Array(5).fill(0))

  const area = useRef<HTMLTextAreaElement>(null)
  const modelMenu = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const recordTimer = useRef<number | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (modelMenu.current && !modelMenu.current.contains(event.target as Node)) setModelsOpen(false)
      if (effortMenuRef.current && !effortMenuRef.current.contains(event.target as Node)) setEffortMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // Publish imperative handles so app-level shortcuts (focus composer, open
  // model picker) can drive this Composer without prop drilling.
  useEffect(() => {
    composerFocus.current = () => area.current?.focus()
    composerModelPicker.current = () => setModelsOpen(true)
    return () => {
      composerFocus.current = null
      composerModelPicker.current = null
    }
  }, [])

  // When the picker opens, select the provider that owns the current model.
  useEffect(() => {
    if (!modelsOpen) {
      setHoverStyle(HOVER_HIDDEN)
      return
    }
    const fromModel = model?.includes('/') ? model.split('/', 1)[0] : null
    const initial =
      fromModel && providers?.providers.some((p) => p.name === fromModel) ? fromModel : providers?.providers[0]?.name ?? null
    setActiveProvider(initial)
    // Fresh search each time the picker opens.
    setModelQuery('')
  }, [modelsOpen, model, providers])

  const commandSuggestions = commandMatches(text)

  const executeCommand = (value: string): boolean => {
    const parsed = parseCommand(value)
    if (!parsed) return false
    if ('error' in parsed) {
      onCommand?.('help', parsed.error)
      return true
    }
    onCommand?.(parsed.command.name, parsed.argument)
    setText('')
    if (area.current) area.current.style.height = 'auto'
    return true
  }

  const submit = (queue: boolean): void => {
    const t = text.trim()
    if (!t) return
    if (executeCommand(t)) return
    onSend(t, queue)
    setText('')
    if (area.current) area.current.style.height = 'auto'
    if (attachments.length > 0) {
      attachments.forEach((a) => URL.revokeObjectURL(a.url))
      setAttachments([])
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (commandSuggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCommandIndex((current) => (current + (e.key === 'ArrowDown' ? 1 : -1) + commandSuggestions.length) % commandSuggestions.length)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setText('')
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const command = commandSuggestions[commandIndex] ?? commandSuggestions[0]
        setText(command.slash)
        return
      }
    }
    if (e.key === 'Enter' && sendOnEnter && !e.shiftKey) {
      e.preventDefault()
      if (commandSuggestions.length > 0 && !text.includes(' ')) {
        const command = commandSuggestions[commandIndex] ?? commandSuggestions[0]
        executeCommand(command.slash)
        return
      }
      submit(e.ctrlKey && running)
    }
  }

  const grow = (): void => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }

  const hasText = text.trim().length > 0
  const provider = providers?.providers.find((entry) => entry.name === activeProvider)
  // Models filtered by the picker's search box (case-insensitive substring).
  const query = modelQuery.trim().toLowerCase()
  const visibleModels = provider?.models.filter((m) => !query || m.toLowerCase().includes(query)) ?? []

  const pickModel = (ref: string): void => {
    const index = ref.indexOf('/')
    if (index <= 0 || index === ref.length - 1 || !onModel) return
    onModel(ref.slice(0, index), ref.slice(index + 1))
    setModelsOpen(false)
  }

  const activeProviderLabel = model?.includes('/') ? model.split('/', 1)[0] : null
  const shortModel = model?.includes('/') ? model.slice(model.indexOf('/') + 1) : model

  const cycleProvider = (step: number): void => {
    const list = providers?.providers ?? []
    if (list.length === 0) return
    const at = Math.max(0, list.findIndex((p) => p.name === activeProvider))
    setActiveProvider(list[(at + step + list.length) % list.length].name)
    setHoverStyle(HOVER_HIDDEN)
  }

  // ── Mock voice recording ──────────────────────────────────────────────────
  const stopRecording = useCallback((): void => {
    if (recordTimer.current) {
      window.clearInterval(recordTimer.current)
      recordTimer.current = null
    }
    setIsRecording(false)
    setAudioData(new Array(5).fill(0))
  }, [])

  const startRecording = useCallback((): void => {
    setIsRecording(true)
    recordTimer.current = window.setInterval(() => {
      setAudioData(Array.from({ length: 5 }, () => Math.random() * 0.8 + 0.1))
    }, 120)
  }, [])

  // ── Mock attachments ──────────────────────────────────────────────────────
  const removeAttachment = (id: string): void => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((a) => a.id !== id)
    })
  }

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    e.target.value = ''
    if (files.length === 0) return
    const room = Math.max(0, MAX_ATTACHMENTS - attachments.length)
    for (const file of files.slice(0, room)) {
      const url = URL.createObjectURL(file)
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`
      const img = new Image()
      const add = (width: number, height: number): void =>
        setAttachments((prev) => [...prev, { id, url, name: file.name, width, height }])
      img.onload = () => add(img.naturalWidth, img.naturalHeight)
      img.onerror = () => add(800, 600)
      img.src = url
    }
  }

  // Clean up timers / object URLs on unmount.
  useEffect(() => {
    return () => {
      if (recordTimer.current) window.clearInterval(recordTimer.current)
    }
  }, [])
  useEffect(() => {
    return () => attachments.forEach((a) => URL.revokeObjectURL(a.url))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasAttachments = attachments.length > 0
  // Whether the notice is a live retry (spinner) vs a settled terminal state.
  const retrying = notice != null && /retry/i.test(notice)
  // Height of the connected slash-command tab: one row (~30px) per suggestion,
  // 2px gaps, plus the tab's vertical padding.
  const cmdCount = commandSuggestions.length
  const cmdHeight = cmdCount > 0 ? cmdCount * 30 + (cmdCount - 1) * 2 + 14 : 0
  const showStop = running || isRecording
  const showSend = !running && !isRecording && hasText

  const onActionClick = (): void => {
    if (running) onStop()
    else if (isRecording) stopRecording()
    else if (hasText) submit(false)
    else startRecording()
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col">
      <input ref={fileInput} type="file" accept="image/*" multiple onChange={onFilesChosen} className="hidden" tabIndex={-1} aria-hidden />

      {/* Attachment tab — slides up from behind the input card. */}
      <div
        aria-hidden={!hasAttachments}
        style={{ height: hasAttachments ? 68 : 0, transition: `height 0.4s ${SPRING}` }}
        className="relative z-0 w-full overflow-hidden"
      >
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: 20,
            right: 20,
            height: 68,
            transform: hasAttachments ? 'translateY(0)' : 'translateY(100%)',
            opacity: hasAttachments ? 1 : 0,
            transition: `transform 0.4s ${SPRING}, opacity 0.3s ease-out`
          }}
          className="no-scrollbar flex items-start gap-2 overflow-x-auto rounded-t-2xl border border-b-0 border-border bg-muted px-2 pb-1 pt-2"
        >
          <AnimatePresence initial={false}>
            {attachments.map((attachment, index) => (
              <AttachmentThumb
                key={attachment.id}
                attachment={attachment}
                index={index}
                onRemove={removeAttachment}
                onOpen={(a, rect) => setActiveAttachment({ attachment: a, rect })}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Slash-command tab — connected, slides up from behind the card (same style as attachments). */}
      <div
        aria-hidden={cmdCount === 0}
        style={{ height: cmdCount > 0 ? cmdHeight : 0, transition: `height 0.4s ${SPRING}` }}
        className="relative z-0 w-full overflow-hidden"
      >
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: 20,
            right: 20,
            height: cmdHeight || 1,
            transform: cmdCount > 0 ? 'translateY(0)' : 'translateY(100%)',
            opacity: cmdCount > 0 ? 1 : 0,
            transition: `transform 0.4s ${SPRING}, opacity 0.3s ease-out`
          }}
          className="flex flex-col gap-0.5 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-muted px-1.5 pb-2 pt-1.5"
        >
          {commandSuggestions.map((command, index) => (
            <button
              key={command.name}
              type="button"
              className={cn(
                'flex h-[30px] w-full items-center rounded-lg px-2.5 text-left text-[13px] transition-colors',
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
      </div>

      {/* Follow-ups tab — connected, slides up from behind the card (same style as attachments & slash commands). */}
      <div
        aria-hidden={queuedFollowUps.length === 0}
        style={{ height: queuedFollowUps.length > 0 ? 40 : 0, transition: `height 0.4s ${SPRING}` }}
        className="relative z-0 w-full overflow-hidden"
      >
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: 20,
            right: 20,
            height: 40,
            transform: queuedFollowUps.length > 0 ? 'translateY(0)' : 'translateY(100%)',
            opacity: queuedFollowUps.length > 0 ? 1 : 0,
            transition: `transform 0.4s ${SPRING}, opacity 0.3s ease-out`
          }}
          className="flex items-center gap-2 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-muted px-3"
        >
          <AddToList size={14} strokeWidth={1.8} className="shrink-0" />
          <span className="whitespace-nowrap font-medium text-foreground">
            {queuedFollowUps.length} follow-up{queuedFollowUps.length === 1 ? '' : 's'} queued
          </span>
          <span className="min-w-0 truncate text-muted-foreground">{queuedFollowUps[0]}</span>
        </div>
      </div>

      {/* Notice tab — connected, slides up from behind the card (same style as
          the other tabs), with the Thinking-style shimmer on the message. */}
      <div
        aria-hidden={!notice}
        style={{ height: notice ? 40 : 0, transition: `height 0.4s ${SPRING}` }}
        className="relative z-0 w-full overflow-hidden"
      >
        <div
          style={{
            position: 'absolute',
            bottom: -8,
            left: 20,
            right: 20,
            height: 40,
            transform: notice ? 'translateY(0)' : 'translateY(100%)',
            opacity: notice ? 1 : 0,
            transition: `transform 0.4s ${SPRING}, opacity 0.3s ease-out`
          }}
          className="flex items-center gap-2 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-muted px-3"
        >
          {retrying ? (
            <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-warning border-t-transparent" aria-hidden />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
          )}
          {retrying ? (
            <span className="shimmer-text min-w-0 flex-1 truncate whitespace-nowrap text-[11.5px] font-medium">{notice}</span>
          ) : (
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[11.5px] font-medium text-muted-foreground">{notice}</span>
          )}
          {!retrying && (
            <button
              type="button"
              onClick={onDismissNotice}
              className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-hover hover:text-foreground"
              aria-label="Dismiss notice"
              title="Dismiss"
            >
              <CloseGlyph />
            </button>
          )}
        </div>
      </div>

      <div className={cn('relative z-10 rounded-[26px] p-px transition-colors duration-200', running ? 'bg-input' : 'bg-transparent')}>
        <div
          onMouseDown={(e) => {
            if (e.target !== area.current && !isRecording) {
              e.preventDefault()
              area.current?.focus()
            }
          }}
          className="relative overflow-visible rounded-[24px] border border-border bg-elevated shadow-sm transition-[border-color,box-shadow] focus-within:border-input focus-within:ring-1 focus-within:ring-input"
        >
          <div className="px-4 pb-[58px] pt-4">
            <textarea
              ref={area}
              value={text}
              rows={1}
              disabled={isRecording}
              placeholder={placeholder ?? (running ? 'Steer the agent. (Ctrl+Enter to queue a follow-up)' : 'Ask anything.')}
              onChange={(e) => {
                setText(e.target.value)
                setCommandIndex(0)
                grow()
              }}
              onKeyDown={onKey}
              className="min-h-[72px] max-h-[220px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/65 disabled:opacity-70"
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 pb-2.5">
            {/* Left controls: model picker · effort · attach */}
            <div className="flex min-w-0 items-center gap-0.5">
              {providers && onModel && (
                <div className="relative" ref={modelMenu}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setModelsOpen((v) => !v)
                    }}
                    className={cn(
                      'group flex h-8 max-w-[220px] items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground disabled:opacity-60',
                      modelsOpen && 'bg-accent/60 text-foreground'
                    )}
                    disabled={running}
                    aria-label={`Select model. Current: ${model || 'none'}`}
                    title={model || 'Select model'}
                  >
                    {activeProviderLabel ? <ProviderDot name={activeProviderLabel} /> : <span className="h-2 w-2 shrink-0 rounded-full bg-input" aria-hidden />}
                    <MorphingText text={shortModel || 'model'} />
                    <ChevronDown size={13} className="shrink-0 opacity-70 group-hover:opacity-100" />
                  </button>

                  {/* Compact animated model dropdown with provider tabs. */}
                  <AnimatePresence>
                    {modelsOpen && (
                      <motion.div
                        style={{ transformOrigin: 'bottom left' }}
                        className="absolute bottom-full left-0 z-50 mb-2.5 w-60 max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border bg-popover/95 p-1 shadow-xl backdrop-blur-md"
                        variants={bloomUp}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={BLOOM_FAST}
                      >
                        {/* Search: filters the active provider's model list. */}
                        <div className="relative mb-1 flex items-center">
                          <Search01 size={13} className="pointer-events-none absolute left-2.5 text-muted-foreground/60" strokeWidth={1.8} />
                          <input
                            autoFocus
                            value={modelQuery}
                            onChange={(e) => {
                              setModelQuery(e.target.value)
                              setHoverStyle(HOVER_HIDDEN)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && visibleModels.length > 0 && provider) {
                                e.preventDefault()
                                pickModel(`${provider.name}/${visibleModels[0]}`)
                              }
                              if (e.key === 'Escape') {
                                if (modelQuery) {
                                  e.stopPropagation()
                                  setModelQuery('')
                                }
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            placeholder="Search models…"
                            aria-label="Search models"
                            className="h-8 w-full rounded-lg border border-border bg-muted/60 pl-8 pr-2 text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-input focus:ring-1 focus:ring-input"
                          />
                        </div>

                        {/* Animated model list for the active provider */}
                        <div
                          className="relative flex max-h-52 flex-col gap-0.5 overflow-y-auto px-0.5"
                          onMouseLeave={() => setHoverStyle((prev) => ({ ...prev, opacity: 0, transition: 'opacity 0.2s ease-in' }))}
                        >
                          <div style={hoverStyle} className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-8 rounded-xl bg-accent" />
                          {visibleModels.length > 0 ? (
                            visibleModels.map((modelID, idx) => {
                              // visibleModels is derived from provider, so it
                              // is only non-empty when provider exists.
                              const ref = `${provider!.name}/${modelID}`
                              const active = ref === model
                              return (
                                <button
                                  key={modelID}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onMouseEnter={() =>
                                    setHoverStyle((prev) => ({
                                      opacity: 1,
                                      transform: `translateY(${idx * 34}px) scale(1)`,
                                      transition: prev.opacity === 0 ? 'opacity 0.15s ease-out' : `transform 0.3s ${SPRING}, opacity 0.15s ease`
                                    }))
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    pickModel(ref)
                                  }}
                                  className="group relative flex h-8 w-full shrink-0 items-center justify-between rounded-xl px-2.5 text-left text-xs font-medium text-foreground/80 outline-none active:scale-[0.98]"
                                >
                                  <span className="min-w-0 truncate">{modelID}</span>
                                  {active && <Tick01 size={12} className="ml-2 shrink-0 text-muted-foreground" />}
                                </button>
                              )
                            })
                          ) : (
                            <div className="px-3 py-4 text-center text-[11.5px] text-muted-foreground/70">
                              {provider && provider.models.length > 0 ? `No models match “${modelQuery}”.` : 'No models discovered yet.'}
                            </div>
                          )}
                        </div>

                        <div className="mx-1 mb-1 mt-1 border-t border-border" />

                        {/* Provider selector: < [provider] > */}
                        <div className="flex items-center justify-between gap-1 px-0.5 pb-0.5 pt-0.5">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation()
                              cycleProvider(-1)
                            }}
                            disabled={providers.providers.length <= 1}
                            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            aria-label="Previous provider"
                          >
                            <ChevronRight size={14} className="rotate-180" />
                          </button>
                          <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[11.5px] font-semibold text-foreground">
                            {activeProvider && <ProviderDot name={activeProvider} />}
                            <MorphingText text={activeProvider ?? 'provider'} />
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation()
                              cycleProvider(1)
                            }}
                            disabled={providers.providers.length <= 1}
                            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            aria-label="Next provider"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Effort (UI-only) — left-click cycles; right-click opens a
                  horizontal picker popup styled like the pill itself. */}
              <div className="relative" ref={effortMenuRef}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setEffortIndex((i) => (i + 1) % EFFORTS.length)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setEffortMenuOpen((v) => !v)
                  }}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground',
                    effortMenuOpen && 'bg-accent/60 text-foreground'
                  )}
                  title="Reasoning effort (right-click to pick)"
                  aria-haspopup="menu"
                  aria-expanded={effortMenuOpen}
                >
                  <MorphingText text={EFFORTS[effortIndex]} />
                </button>

                {/* Right-click popup: a horizontal row of effort pills. */}
                <AnimatePresence>
                  {effortMenuOpen && (
                    <motion.div
                      style={{ transformOrigin: 'bottom left' }}
                      className="absolute bottom-full left-0 z-50 mb-2.5 flex items-center gap-1 rounded-2xl border border-border bg-popover/95 p-1 shadow-xl backdrop-blur-md"
                      variants={bloomUp}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={BLOOM_FAST}
                    >
                      {EFFORTS.map((effort) => {
                        const active = effort === EFFORTS[effortIndex]
                        return (
                          <button
                            key={effort}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEffortIndex(EFFORTS.indexOf(effort))
                              setEffortMenuOpen(false)
                            }}
                            className={cn(
                              'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap outline-none transition-colors',
                              active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                            )}
                          >
                            {effort}
                          </button>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Attach (mock) */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInput.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                title="Attach images"
              >
                <PlusGlyph />
              </button>
            </div>

            {/* Right controls: visualizer · queue · action */}
            <div className="flex shrink-0 items-center gap-1.5">
              <div
                className={cn(
                  'flex h-8 items-center justify-end gap-[3px] overflow-hidden transition-all duration-300',
                  isRecording ? 'w-14 opacity-100' : 'w-0 opacity-0'
                )}
              >
                {audioData.map((val, i) => (
                  <div key={i} className="w-1 rounded-full bg-primary transition-[height] duration-75 ease-out" style={{ height: `${Math.max(4, val * 22)}px` }} />
                ))}
              </div>

              {running && (
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
                  title="Queue as follow-up (Ctrl+Enter)"
                  onClick={() => submit(true)}
                  disabled={!hasText}
                >
                  <AddToList size={15} strokeWidth={1.8} />
                </button>
              )}

              <motion.button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={onActionClick}
                className="relative flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
                title={running ? 'Stop the run' : isRecording ? 'Stop recording' : showSend ? 'Send' : 'Voice input (demo)'}
                aria-label={running ? 'Stop generation' : isRecording ? 'Stop recording' : showSend ? 'Send message' : 'Voice input'}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 600, damping: 28 }}
              >
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center transition-all duration-300',
                    showSend ? 'opacity-100 rotate-0 blur-none' : 'pointer-events-none rotate-45 opacity-0 blur-[1px]'
                  )}
                >
                  <ArrowUpGlyph />
                </span>
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center transition-all duration-300',
                    !running && !isRecording && !showSend ? 'opacity-100 rotate-0 blur-none' : 'pointer-events-none -rotate-45 opacity-0 blur-[1px]'
                  )}
                >
                  <MicGlyph />
                </span>
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center transition-all duration-300',
                    showStop ? 'opacity-100 rotate-0 blur-none' : 'pointer-events-none rotate-45 opacity-0 blur-[1px]'
                  )}
                >
                  <StopGlyph />
                </span>
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {activeAttachment &&
        createPortal(
          <AttachmentGalleryModal attachment={activeAttachment.attachment} originRect={activeAttachment.rect} onClose={() => setActiveAttachment(null)} />,
          document.body
        )}
    </div>
  )
}
