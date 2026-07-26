import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react'
import { motion } from 'motion/react'
import { ArrowUp02, AddToList, ChevronDown, ChevronRight, Search01, Square, Tick01 } from './ui/icons'
import type { ProviderEntry, ProvidersInfo } from '../../../shared/protocol'
import { cn } from '../util'
import { commandMatches, parseCommand, type CommandName } from '../commands'

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

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio', 'vllm'])

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
  onCommand?(name: CommandName, argument: string): void
}

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
  onCommand
}: Props): JSX.Element {
  const [text, setText] = useState('')
  const [modelsOpen, setModelsOpen] = useState(false)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [addingCustomModel, setAddingCustomModel] = useState(false)
  const [customModel, setCustomModel] = useState('')
  const [query, setQuery] = useState('')
  const [commandIndex, setCommandIndex] = useState(0)
  const area = useRef<HTMLTextAreaElement>(null)
  const modelMenu = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent): void => {
      if (modelMenu.current && !modelMenu.current.contains(event.target as Node)) setModelsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!modelsOpen) {
      setQuery('')
      setAddingCustomModel(false)
      setCustomModel('')
      return
    }
    const activeProviderFromModel = model?.includes('/') ? model.split('/', 1)[0] : null
    const initial =
      activeProviderFromModel && providers?.providers.some((p) => p.name === activeProviderFromModel)
        ? activeProviderFromModel
        : providers?.providers[0]?.name ?? null
    setActiveProvider(initial)
    requestAnimationFrame(() => searchInput.current?.focus())
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

  const pickModel = (ref: string): void => {
    const index = ref.indexOf('/')
    if (index <= 0 || index === ref.length - 1 || !onModel) return
    onModel(ref.slice(0, index), ref.slice(index + 1))
    setModelsOpen(false)
    setAddingCustomModel(false)
    setCustomModel('')
    setQuery('')
  }

  const trimmedQuery = query.trim().toLowerCase()
  const searching = trimmedQuery.length > 0

  type Match = { provider: ProviderEntry; models: string[] }
  const matches = useMemo<Match[]>(() => {
    if (!providers || !searching) return []
    return providers.providers
      .map((p) => ({ provider: p, models: p.models.filter((m) => m.toLowerCase().includes(trimmedQuery)) }))
      .filter((entry) => entry.models.length > 0)
  }, [providers, searching, trimmedQuery])

  const totalMatches = matches.reduce((n, m) => n + m.models.length, 0)

  const activeProviderLabel = model?.includes('/') ? model.split('/', 1)[0] : null
  const shortModel = model?.includes('/') ? model.slice(model.indexOf('/') + 1) : model

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl">
      {queuedFollowUps.length > 0 && (
        <motion.div
          className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-subtle px-3 py-2 text-[11.5px] text-muted-foreground"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <AddToList size={14} strokeWidth={1.8} className="shrink-0" />
          <span className="font-medium text-foreground">
            {queuedFollowUps.length} follow-up{queuedFollowUps.length === 1 ? '' : 's'} queued
          </span>
          <span className="min-w-0 truncate">{queuedFollowUps[0]}</span>
        </motion.div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (running) onStop()
          else submit(false)
      }}
      >
      <div
        className={cn(
          'rounded-[26px] p-px transition-colors duration-200',
          running ? 'bg-input' : 'bg-transparent'
        )}
      >
        <div className="relative overflow-visible rounded-[24px] border border-border bg-elevated transition-[border-color,box-shadow] focus-within:border-input focus-within:ring-1 focus-within:ring-input">
          <div className="px-4 pb-[58px] pt-4">
            <textarea
              ref={area}
              value={text}
              rows={1}
              placeholder={
                placeholder ??
                (running
                  ? 'Steer the agent… (Ctrl+Enter to queue a follow-up)'
                  : 'Ask anything…')
              }
              onChange={(e) => {
                setText(e.target.value)
                setCommandIndex(0)
                grow()
              }}
              onKeyDown={onKey}
              className="min-h-[72px] max-h-[220px] w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/65"
            />
            {commandSuggestions.length > 0 && (
              <div className="absolute bottom-[calc(100%+0.6rem)] left-0 z-40 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-elevated p-1 shadow-lg [animation:pop_0.16s_ease]">
                <div className="px-2.5 pb-1 pt-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/70">Commands</div>
                {commandSuggestions.map((command, index) => (
                  <button
                    key={command.name}
                    type="button"
                    className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', index === commandIndex ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
                    onMouseEnter={() => setCommandIndex(index)}
                    onClick={() => {
                      executeCommand(command.slash)
                    }}
                  >
                    <span className="w-20 shrink-0 font-mono text-[11.5px] text-foreground">{command.slash}</span>
                    <span className="min-w-0 flex-1 text-[12px]">{command.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <div className="min-w-0">
              {providers && onModel && (
                <div className="relative" ref={modelMenu}>
                  <button
                    type="button"
                    className="flex h-8 max-w-[260px] items-center gap-1.5 rounded-full px-2.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-60"
                    onClick={() => setModelsOpen((value) => !value)}
                    disabled={running}
                    title={model || 'Select model'}
                  >
                    {activeProviderLabel ? (
                      <ProviderDot name={activeProviderLabel} />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-input" aria-hidden />
                    )}
                    <span className="truncate">{shortModel || 'model'}</span>
                    <ChevronDown size={13} className="shrink-0" />
                  </button>

                  {modelsOpen && (
                    <div
                      className="absolute bottom-10 left-0 z-40 w-[520px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-border bg-elevated shadow-lg [animation:pop_0.16s_ease]"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          setModelsOpen(false)
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                        <Search01 size={13} className="shrink-0 text-muted-foreground" />
                        <input
                          ref={searchInput}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search across all providers…"
                          spellCheck={false}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/65"
                        />
                        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground/70">
                          {searching ? `${totalMatches} match${totalMatches === 1 ? '' : 'es'}` : '⌘K'}
                        </span>
                      </div>

                      <div className="flex">
                        <div className="w-[180px] shrink-0 border-r border-border py-1.5">
                          {searching ? (
                            <>
                              <div className="px-3 pb-1 pt-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
                                Matches
                              </div>
                              {matches.length === 0 && (
                                <div className="px-3 py-2 text-[11.5px] text-muted-foreground/70">
                                  No models match
                                </div>
                              )}
                              {matches.map(({ provider: p, models }) => (
                                <button
                                  key={p.name}
                                  type="button"
                                  className={cn(
                                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors hover:bg-hover',
                                    activeProvider === p.name && 'bg-hover'
                                  )}
                                  onClick={() => setActiveProvider(p.name)}
                                >
                                  <ProviderDot name={p.name} />
                                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                  <span className="shrink-0 text-[10.5px] text-muted-foreground/70">{models.length}</span>
                                </button>
                              ))}
                            </>
                          ) : (
                            <>
                              <div className="px-3 pb-1 pt-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
                                Providers
                              </div>
                              {providers.providers.map((entry) => (
                                <button
                                  key={entry.name}
                                  type="button"
                                  className={cn(
                                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors hover:bg-hover',
                                    activeProvider === entry.name && 'bg-hover text-foreground'
                                  )}
                                  onClick={() => {
                                    setActiveProvider(entry.name)
                                    setAddingCustomModel(false)
                                  }}
                                >
                                  <ProviderDot name={entry.name} />
                                  <span className="min-w-0 flex-1 truncate">
                                    {entry.name}
                                    {LOCAL_PROVIDERS.has(entry.name) && (
                                      <span className="ml-1 text-[10px] text-muted-foreground/60">· local</span>
                                    )}
                                  </span>
                                  <span className="shrink-0 text-[10.5px] text-muted-foreground/70">
                                    {entry.models.length || '–'}
                                  </span>
                                </button>
                              ))}
                            </>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 py-1.5">
                          {searching ? (
                            <div className="max-h-72 overflow-y-auto overscroll-contain px-1">
                              {matches.length === 0 ? (
                                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground/70">
                                  Nothing matches “{query}”.
                                </div>
                              ) : (
                                matches.map(({ provider: p, models }) => (
                                  <div key={p.name} className="pb-1">
                                    <div className="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
                                      <ProviderDot name={p.name} size={6} />
                                      {p.name}
                                    </div>
                                    {models.map((modelID) => {
                                      const ref = `${p.name}/${modelID}`
                                      const active = ref === model
                                      return (
                                        <button
                                          key={ref}
                                          type="button"
                                          className={cn(
                                            'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors hover:bg-hover',
                                            active && 'bg-selected text-foreground'
                                          )}
                                          onClick={() => pickModel(ref)}
                                        >
                                          <span className="min-w-0 flex-1 truncate">{modelID}</span>
                                          {active && <Tick01 size={12} className="shrink-0 text-muted-foreground" />}
                                        </button>
                                      )
                                    })}
                                  </div>
                                ))
                              )}
                            </div>
                          ) : provider && addingCustomModel ? (
                            <div className="px-1">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                                onClick={() => setAddingCustomModel(false)}
                              >
                                <ChevronRight size={12} className="rotate-180" />
                                <span>Back to {provider.name} models</span>
                              </button>
                              <div className="px-2.5 pb-1 pt-2 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
                                Add custom model to {provider.name}
                              </div>
                              <div className="flex gap-1.5 px-1 pb-1 pt-1.5">
                                <input
                                  value={customModel}
                                  onChange={(e) => setCustomModel(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && customModel.trim()) {
                                      e.preventDefault()
                                      pickModel(`${provider.name}/${customModel.trim()}`)
                                    }
                                  }}
                                  placeholder="model-id"
                                  spellCheck={false}
                                  autoFocus
                                  className="min-w-0 flex-1 rounded-full border border-border bg-subtle px-3 py-1.5 font-mono text-[12px] text-foreground outline-none focus:border-input focus:ring-1 focus:ring-input"
                                />
                                <button
                                  type="button"
                                  className="rounded-full bg-selected px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-hover disabled:opacity-40"
                                  onClick={() => pickModel(`${provider.name}/${customModel.trim()}`)}
                                  disabled={!customModel.trim()}
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          ) : provider ? (
                            <>
                              <div className="flex items-center gap-1.5 px-3 pb-1 pt-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
                                <ProviderDot name={provider.name} size={6} />
                                {provider.name}
                              </div>
                              {provider.models.length > 0 ? (
                                <div className="max-h-64 overflow-y-auto overscroll-contain px-1">
                                  {provider.models.map((modelID) => {
                                    const ref = `${provider.name}/${modelID}`
                                    const active = ref === model
                                    return (
                                      <button
                                        key={modelID}
                                        type="button"
                                        className={cn(
                                          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors hover:bg-hover',
                                          active && 'bg-selected text-foreground'
                                        )}
                                        onClick={() => pickModel(ref)}
                                      >
                                        <span className="min-w-0 flex-1 truncate">{modelID}</span>
                                        {active && <Tick01 size={12} className="shrink-0 text-muted-foreground" />}
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/70">
                                  No models discovered yet.
                                  <div className="mt-0.5 text-[11px] text-muted-foreground/60">
                                    Add a custom model below or configure the provider in <span className="font-mono">/providers</span>.
                                  </div>
                                </div>
                              )}
                              <button
                                type="button"
                                className="mt-1 flex w-full items-center gap-2 border-t border-border px-3 pt-2 pb-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                                onClick={() => setAddingCustomModel(true)}
                              >
                                <span className="min-w-0 flex-1">Add custom model</span>
                                <ChevronRight size={12} className="shrink-0" />
                              </button>
                            </>
                          ) : (
                            <div className="px-3 py-4 text-[12px] text-muted-foreground/70">
                              Select a provider on the left.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {running && (
                <>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
                    title="Queue as follow-up (Ctrl+Enter)"
                    onClick={() => submit(true)}
                    disabled={!hasText}
                  >
                    <AddToList size={15} strokeWidth={1.8} />
                  </button>
                </>
              )}
              <motion.button
                type={running ? 'button' : 'submit'}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none'
                )}
                title={running ? 'Stop the run' : 'Send'}
                onClick={running ? onStop : undefined}
                disabled={!running && !hasText}
                aria-label={running ? 'Stop generation' : 'Send message'}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 600, damping: 28 }}
              >
                {running ? <Square size={12} strokeWidth={1.8} /> : <ArrowUp02 size={15} strokeWidth={2.2} />}
              </motion.button>
            </div>
          </div>
        </div>
      </div>
      </form>
    </div>
  )
}
