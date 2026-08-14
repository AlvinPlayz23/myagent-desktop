import { useCallback, useEffect, useMemo, useRef, useState, KeyboardEvent, ClipboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { AddToList, ChevronRight, Search01, Tick01 } from './ui/icons'
import type { ContentBlock, ProvidersInfo, ReasoningEffort } from '../../../shared/protocol'
import { cn } from '../util'
import { commandMatches, parseCommand, type CommandName } from '../commands'
import { composerFocus, composerModelPicker } from '../shortcuts'
import { BLOOM_FAST, bloomUp } from '../motion'
import ProviderLogo from './ProviderLogo'

// ----------------------------------------------------------------------
// Physics & Colors
// ----------------------------------------------------------------------
const SPRING_TRANSITION = "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
const EASE_SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)"

// ----------------------------------------------------------------------
// Sub-components requested by USER
// ----------------------------------------------------------------------

function MorphingText({ text }: { text: string }): JSX.Element {
  const [width, setWidth] = useState<number | "auto">("auto")
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (spanRef.current) {
      setWidth(spanRef.current.offsetWidth)
    }
  }, [text])

  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
      style={{ width }}
    >
      <span ref={spanRef} className="invisible whitespace-nowrap px-1">
        {text}
      </span>
      <span
        key={text}
        className="absolute inset-0 flex items-center justify-center whitespace-nowrap animate-in fade-in zoom-in-95 duration-300"
      >
        {text}
      </span>
    </span>
  )
}

function ModelIcon({ model, className }: { model: string; className?: string }): JSX.Element {
  const icons: Record<string, string> = {
    "Composer 2.5": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/cursor-ai-code-icon_j4vnux.svg",
    "Gemini 3.5 Flash": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/google-gemini-icon_l6kk5q.svg",
    "GPT 5.5": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695269/openai-icon_zozuib.svg",
    "Opus 4.8": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/Claude_AI_symbol_yqfzlc.svg",
    "GLM 5.2": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695269/z-ai-icon_xi4xvo.svg"
  }

  const filters: Record<string, string> = {
    "GPT 5.5": "dark:invert",
  }

  const src = icons[model]
  if (!src) {
    const providerName = model.includes('/') ? model.split('/', 1)[0] : 'openai'
    return <ProviderLogo providerId={providerName} size={14} className={className} />
  }

  return (
    <img
      src={src}
      alt={model}
      className={cn("object-contain", filters[model], className)}
    />
  )
}

function ArrowUpIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MicIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="5" y="1" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.75 6.5V7a4.25 4.25 0 0 0 8.5 0v-.5M7 11.25V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function StopIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// Four arc segments of a ring, filled clockwise from 12 o'clock as effort rises.
const ARC_PATHS = ((): string[] => {
  const C = 7
  const R = 4.6
  const SPAN = 68
  const GAP = 22
  const point = (deg: number): string => {
    const rad = ((deg - 90) * Math.PI) / 180
    return `${(C + R * Math.cos(rad)).toFixed(3)} ${(C + R * Math.sin(rad)).toFixed(3)}`
  }
  return [0, 1, 2, 3].map((i) => {
    const start = i * (SPAN + GAP) + GAP / 2
    return `M ${point(start)} A ${R} ${R} 0 0 1 ${point(start + SPAN)}`
  })
})()

const EFFORT_ARCS: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  XHigh: 4,
  Max: 4
}

function DynamicBarsIcon({ level }: { level: string }): JSX.Element {
  const filled = EFFORT_ARCS[level] ?? 0
  const isMax = level === 'Max'

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      {ARC_PATHS.map((d, i) => (
        <path
          key={d}
          d={d}
          stroke={isMax ? '#3b82f6' : 'currentColor'}
          strokeWidth="1.9"
          strokeLinecap="round"
          className="transition-all duration-300"
          opacity={i < filled ? 1 : 0.28}
        />
      ))}
    </svg>
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
        "transition-transform duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:scale-[1.04] active:scale-[0.96]",
        "animate-in fade-in slide-in-from-top-3 zoom-in-90 duration-400"
      )}
      aria-label={`Open preview of ${attachment.name}`}
    >
      <img src={attachment.url} alt={attachment.name} className="attachment-image size-full object-cover" draggable={false} />
      <span className={cn("absolute inset-0 flex items-start justify-end bg-black/0 transition-colors duration-200", hovered && "bg-black/25")}>
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); onRemove(attachment.id); }}
          className={cn(
            "m-1 flex size-4 items-center justify-center rounded-full bg-background/90 text-foreground/70 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-background hover:text-foreground hover:scale-110",
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
    : { top: originRect.top, left: originRect.left, width: originRect.width, height: originRect.height, radius: 12 }

  const animEasing = isClosing ? 'ease-out' : 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  const animDur = isClosing ? '0.3s' : '0.45s'
  const flipTransition = `top ${animDur} ${animEasing}, left ${animDur} ${animEasing}, width ${animDur} ${animEasing}, height ${animDur} ${animEasing}, border-radius ${animDur} ${animEasing}`

  return (
    <div className="fixed inset-0 z-[100]" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md transition-opacity duration-400" style={{ opacity: isOpen ? 1 : 0 }} />
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
          "fixed right-4 top-4 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground/70 shadow-md backdrop-blur-sm",
          "transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-card hover:text-foreground",
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

const EFFORTS: { label: string; value: ReasoningEffort }[] = [
  { label: 'Default', value: '' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'XHigh', value: 'xhigh' },
  { label: 'Max', value: 'max' }
]

interface Props {
  running: boolean
  onSend(content: ContentBlock[], queue: boolean): Promise<void>
  onStop(): void
  placeholder?: string
  model?: string
  providers?: ProvidersInfo
  onModel?(provider: string, model: string): void
  effort?: ReasoningEffort
  onSetEffort?(effort: ReasoningEffort): void
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
  effort = '',
  onSetEffort,
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
  const [submitting, setSubmitting] = useState(false)
  const [readingAttachments, setReadingAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const [effortMenuOpen, setEffortMenuOpen] = useState(false)
  const effortMenuRef = useRef<HTMLDivElement>(null)
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

  const area = useRef<HTMLTextAreaElement>(null)
  const modelMenu = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const attachmentReads = useRef(0)
  const attachmentQueue = useRef<Promise<void>>(Promise.resolve())
  const attachmentsRef = useRef<Attachment[]>([])

  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (modelMenu.current && !modelMenu.current.contains(event.target as Node)) setModelsOpen(false)
      if (effortMenuRef.current && !effortMenuRef.current.contains(event.target as Node)) setEffortMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    composerFocus.current = () => area.current?.focus()
    composerModelPicker.current = () => setModelsOpen(true)
    return () => {
      composerFocus.current = null
      composerModelPicker.current = null
    }
  }, [])

  useEffect(() => {
    if (!modelsOpen) {
      setHoverStyle(HOVER_HIDDEN)
      return
    }
    const fromModel = model?.includes('/') ? model.split('/', 1)[0] : null
    const initial =
      fromModel && providers?.providers.some((p) => p.name === fromModel) ? fromModel : providers?.providers[0]?.name ?? null
    setActiveProvider(initial)
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
      setText('')
      attachmentsRef.current = []
      setAttachments([])
      setAttachmentError(null)
      if (area.current) area.current.style.height = 'auto'
    } catch {
      // Retain draft on error
    } finally {
      submittingRef.current = false
      setSubmitting(false)
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
      void submit(e.ctrlKey && running)
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

  const effortUnsupported = useMemo(() => {
    const entry = providers?.providers.find((p) => p.name === activeProviderLabel)
    const detail = entry?.modelDetails?.find((d) => d.id === shortModel)
    return detail != null && detail.reasoningKnown && !detail.reasoning
  }, [providers, activeProviderLabel, shortModel])
  const currentEffort = effortUnsupported ? '' : effort
  const currentEffortLabel = EFFORTS.find((item) => item.value === currentEffort)?.label ?? 'Default'

  const cycleProvider = (step: number): void => {
    const list = providers?.providers ?? []
    if (list.length === 0) return
    const at = Math.max(0, list.findIndex((p) => p.name === activeProvider))
    setActiveProvider(list[(at + step + list.length) % list.length].name)
    setHoverStyle(HOVER_HIDDEN)
  }

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
            setText((prev) => (prev ? prev + " " : "") + finalTranscript)
            grow()
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

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
  }

  const hasAttachments = attachments.length > 0
  const canSubmit = (hasText || hasAttachments) && !readingAttachments
  const retrying = notice != null && /retry/i.test(notice)
  const cmdCount = commandSuggestions.length
  const cmdHeight = cmdCount > 0 ? cmdCount * 30 + (cmdCount - 1) * 2 + 14 : 0

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

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col">
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple onChange={onFilesChosen} disabled={submitting} className="hidden" tabIndex={-1} aria-hidden />

      <AnimatePresence initial={false}>
        {attachmentError && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            className="mb-2 flex min-h-10 items-center justify-between gap-3 rounded-xl bg-destructive/8 px-3 text-[11.5px] text-destructive-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--destructive)_20%,transparent)]"
          >
            <span>{attachmentError}</span>
            <button type="button" onClick={() => setAttachmentError(null)} className="grid size-8 shrink-0 place-items-center rounded-lg text-destructive-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive-foreground" aria-label="Dismiss attachment error">
              <CloseIcon />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachment tab */}
      <div
        aria-hidden={!hasAttachments}
        style={{ height: hasAttachments ? 68 : 0, transition: `height 0.4s ${EASE_SPRING}` }}
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
            transition: `transform 0.4s ${EASE_SPRING}, opacity 0.3s ease-out`
          }}
          className="no-scrollbar flex items-start gap-2 overflow-x-auto rounded-t-2xl border border-b-0 border-border bg-card px-2 pb-1 pt-2"
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
        </div>
      </div>

      {/* Slash-command tab */}
      <div
        aria-hidden={cmdCount === 0}
        style={{ height: cmdCount > 0 ? cmdHeight : 0, transition: `height 0.4s ${EASE_SPRING}` }}
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
            transition: `transform 0.4s ${EASE_SPRING}, opacity 0.3s ease-out`
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

      {/* Follow-ups tab */}
      <div
        aria-hidden={queuedFollowUps.length === 0}
        style={{ height: queuedFollowUps.length > 0 ? 40 : 0, transition: `height 0.4s ${EASE_SPRING}` }}
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
            transition: `transform 0.4s ${EASE_SPRING}, opacity 0.3s ease-out`
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

      {/* Notice tab */}
      <div
        aria-hidden={!notice}
        style={{ height: notice ? 40 : 0, transition: `height 0.4s ${EASE_SPRING}` }}
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
            transition: `transform 0.4s ${EASE_SPRING}, opacity 0.3s ease-out`
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
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {/* Main Input Card with ol-ui & user prompt-input styling */}
      <div className={cn('relative z-10 rounded-[26px] p-px transition-colors duration-200', running ? 'bg-input' : 'bg-transparent')}>
        <div
          onMouseDown={(e) => {
            if (e.target !== area.current && !isRecording) {
              e.preventDefault()
              area.current?.focus()
            }
          }}
          className="relative overflow-visible rounded-[24px] border border-border bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-ring/40 focus-within:ring-1 focus-within:ring-ring/20 hover:border-border/80"
        >
          <div className="px-4 pb-[54px] pt-4">
            <textarea
              ref={area}
              value={text}
              rows={1}
              disabled={isRecording || submitting}
              placeholder={placeholder ?? (running ? 'Steer the agent. (Ctrl+Enter to queue a follow-up)' : 'Ask anything')}
              onChange={(e) => {
                setText(e.target.value)
                setCommandIndex(0)
                grow()
              }}
              onKeyDown={onKey}
              onPaste={onPaste}
              className="min-h-[64px] max-h-[220px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/70 disabled:opacity-70"
            />
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 pb-2.5">
            {/* Left controls: model picker · effort · attach */}
            <div className="flex min-w-0 items-center gap-1">
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
                      'chip group h-8 max-w-[220px] px-2.5 flex items-center gap-1.5',
                      modelsOpen && 'chip-active'
                    )}
                    disabled={running}
                    aria-label={`Select model. Current: ${model || 'none'}`}
                    title={model || 'Select model'}
                  >
                    <ModelIcon model={shortModel || 'GPT 5.5'} className="size-3.5 opacity-80 group-hover:opacity-100 transition-opacity" />
                    <span className="truncate select-none text-xs font-medium">
                      <MorphingText text={shortModel || 'Select Model'} />
                    </span>
                  </button>

                  <AnimatePresence>
                    {modelsOpen && (
                      <motion.div
                        style={{ transformOrigin: 'bottom left' }}
                        className="absolute bottom-full left-0 z-50 mb-2.5 w-60 max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-lg"
                        variants={bloomUp}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={BLOOM_FAST}
                      >
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

                        <div
                          className="relative flex max-h-52 flex-col gap-0.5 overflow-y-auto px-0.5"
                          onMouseLeave={() => setHoverStyle((prev) => ({ ...prev, opacity: 0, transition: 'opacity 0.2s ease-in' }))}
                        >
                          <div style={hoverStyle} className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-8 rounded-xl bg-accent" />
                          {visibleModels.length > 0 ? (
                            visibleModels.map((modelID, idx) => {
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
                                      transition: prev.opacity === 0 ? 'opacity 0.15s ease-out' : `transform 0.3s ${EASE_SPRING}, opacity 0.15s ease`
                                    }))
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    pickModel(ref)
                                  }}
                                  className="group relative flex h-8 w-full shrink-0 items-center justify-between rounded-xl px-2.5 text-left text-xs font-medium text-foreground/80 outline-none active:scale-[0.98]"
                                >
                                  <span className="flex items-center gap-2 min-w-0 truncate">
                                    <ModelIcon model={modelID} className="size-3.5 opacity-85 group-hover:opacity-100 transition-opacity shrink-0" />
                                    <span className="truncate">{modelID}</span>
                                  </span>
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
                            {activeProvider && <ProviderLogo providerId={activeProvider} size={14} />}
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

              {/* Reasoning Effort Button with DynamicBarsIcon */}
              <div className="relative" ref={effortMenuRef}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={effortUnsupported || !onSetEffort}
                  onClick={() => {
                    const index = EFFORTS.findIndex((item) => item.value === currentEffort)
                    const next = EFFORTS[(index + 1) % EFFORTS.length]
                    onSetEffort?.(next.value)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setEffortMenuOpen((v) => !v)
                  }}
                  className={cn(
                    'chip group h-8 px-2.5 flex items-center gap-1.5',
                    effortMenuOpen && 'chip-active'
                  )}
                  title={
                    effortUnsupported
                      ? 'This model does not support reasoning'
                      : 'Reasoning effort (right-click to pick)'
                  }
                  aria-haspopup="menu"
                  aria-expanded={effortMenuOpen}
                >
                  <DynamicBarsIcon level={currentEffortLabel} />
                  <span className="text-xs font-medium select-none transition-colors">
                    <MorphingText text={currentEffortLabel} />
                  </span>
                </button>

                <AnimatePresence>
                  {effortMenuOpen && !effortUnsupported && (
                    <motion.div
                      style={{ transformOrigin: 'bottom left' }}
                      className="absolute bottom-full left-0 z-50 mb-2.5 flex max-w-[260px] items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1 shadow-lg"
                      variants={bloomUp}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={BLOOM_FAST}
                    >
                      {EFFORTS.map(({ label, value }) => {
                        const activeItem = value === currentEffort
                        return (
                          <button
                            key={value}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation()
                              onSetEffort?.(value)
                              setEffortMenuOpen(false)
                            }}
                            className={cn(
                              'flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap outline-none transition-colors',
                              activeItem
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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
                  'flex h-8 items-center justify-end gap-[3px] overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]',
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
                  className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
                  title="Queue as follow-up (Ctrl+Enter)"
                  onClick={() => void submit(true)}
                  disabled={!canSubmit || submitting}
                >
                  <AddToList size={15} strokeWidth={1.8} />
                </button>
              )}

              {/* Action Button: Morphing ArrowUp / Mic / Stop */}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={onActionButtonClick}
                disabled={submitting}
                aria-label={showArrow ? "Send prompt" : showStop ? "Stop recording or generation" : "Use voice input"}
                style={{ borderRadius: 9999 }}
                className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground transition-all duration-300 hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-default shadow-sm disabled:opacity-50"
              >
                <span className="relative flex h-full w-full items-center justify-center">
                  <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]", showArrow ? "opacity-100 scale-100 rotate-0 blur-none" : "opacity-0 scale-50 rotate-45 blur-[1px] pointer-events-none")}>
                    <ArrowUpIcon />
                  </span>
                  <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]", showMic ? "opacity-100 scale-100 rotate-0 blur-none" : "opacity-0 scale-50 -rotate-45 blur-[1px] pointer-events-none")}>
                    <MicIcon />
                  </span>
                  <span className={cn("absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]", showStop ? "opacity-100 scale-100 rotate-0 blur-none" : "opacity-0 scale-50 rotate-45 blur-[1px] pointer-events-none")}>
                    <StopIcon />
                  </span>
                </span>
              </button>
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
