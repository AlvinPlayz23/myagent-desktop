import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Message01Icon } from '@hugeicons/core-free-icons'
import { ChevronDown, ChevronRight, Folder01, FolderAdd, Rotate01 } from './ui/icons'
import type { ContentBlock, ProvidersInfo, ReasoningEffort, SessionMeta } from '../../../shared/protocol'
import Composer from './Composer'
import { Button } from './ui/button'
import { cn, relTime } from '../util'
import type { CommandName } from '../commands'
import type { EffortSelectorVariant, ModelSelectorVariant } from '../preferences'
import { BLOOM_FAST, EASE_OUT } from '../motion'

interface Props {
  loading: boolean
  fatal: string | null
  projects: { cwd: string; name: string }[]
  selected: string | null
  appName: string
  onSelect(cwd: string): void
  onAddProject(): void
  onSend(content: ContentBlock[], model?: string, effort?: ReasoningEffort): Promise<void>
  onRetry(): void
  providers: ProvidersInfo
  onDiscoverModels?(name: string): void
  notice?: string | null
  onDismissNotice?(): void
  sendOnEnter?: boolean
  modelSelectorVariant?: ModelSelectorVariant
  effortSelectorVariant?: EffortSelectorVariant
  onCommand(name: CommandName, argument: string): void
  /** Recent sessions across all projects, newest first (drives the Recents row). */
  recentSessions?: SessionMeta[]
  onOpenSession?(id: string): void
  onSettings?(): void
}

// Staggered entrance: mark → headline → composer → cards. One orchestrated
// reveal on landing beats scattered micro-interactions later.
const container = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0 } }
}
const rise = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } }
}
const recentListMotion = {
  initial: { opacity: 0, y: 4, height: 0, filter: 'blur(4px)' }, // motion:allow-blur
  visible: { opacity: 1, y: 0, height: 'auto', filter: 'blur(0px)' }, // motion:allow-blur
  leaving: { opacity: 0, y: -6, height: 0, filter: 'blur(4px)' } // motion:allow-blur
}

export default function Home(props: Props): JSX.Element {
  const {
    loading, fatal, projects, selected, appName,
    onSelect, onAddProject, onSend, onRetry,
    providers, onDiscoverModels, notice, onDismissNotice,
    sendOnEnter, modelSelectorVariant, effortSelectorVariant, onCommand,
    recentSessions = [], onOpenSession
  } = props
  const [open, setOpen] = useState(false)
  const [showRecents, setShowRecents] = useState(true)
  const [model, setModel] = useState(providers.defaultModel ?? '')
  const [effort, setEffort] = useState<ReasoningEffort>('medium')
  const pop = useRef<HTMLDivElement>(null)
  const recentsTimer = useRef<number | null>(null)

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (pop.current && !pop.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(
    () => () => {
      if (recentsTimer.current !== null) window.clearTimeout(recentsTimer.current)
    },
    []
  )

  const focusPrompt = (): void => {
    if (recentsTimer.current !== null) window.clearTimeout(recentsTimer.current)
    recentsTimer.current = null
    setShowRecents(false)
  }

  const blurPrompt = (value: string): void => {
    if (recentsTimer.current !== null) window.clearTimeout(recentsTimer.current)
    recentsTimer.current = null
    if (value.trim()) return
    recentsTimer.current = window.setTimeout(() => {
      setShowRecents(true)
      recentsTimer.current = null
    }, 2000)
  }

  const current = projects.find((p) => p.cwd === selected) ?? projects[0] ?? null
  const recents = recentSessions.slice(0, 6)


  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6">
      <div className="flex w-full max-w-2xl flex-col items-center gap-3 pb-16">
        {fatal ? (
          <div className="flex w-full max-w-xl flex-col items-center gap-4">
            <pre className="max-h-48 w-full overflow-auto rounded-xl border border-destructive/30 bg-destructive/8 p-4 font-mono text-ui-sm leading-relaxed text-destructive-foreground">
              {fatal}
            </pre>
            <Button onClick={onRetry} className="rounded-full">
              <Rotate01 size={14} strokeWidth={1.8} />
              <span>Retry</span>
            </Button>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-1.5 py-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 rounded-full bg-primary [animation:work-pulse_1.2s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Button onClick={onAddProject} className="rounded-full" size="lg">
            <FolderAdd size={15} strokeWidth={1.8} />
            <span>Add a project</span>
          </Button>
        ) : (
          <motion.div variants={container} initial="initial" animate="animate" className="flex w-full flex-col gap-4">
            {/* Header row: app name left, project picker right  the original
                layout, kept quiet so the composer stays the focus. */}
            {/* Stacking: the composer's own popovers (model picker) must paint
                over the app-name text, so the composer sits above by default.
                The project picker is inside this header row — whose blur/filter
                variant makes it a stacking context — so the header only rises
                above the composer while that picker is open. */}
            <motion.div
              variants={rise}
              className={cn(
                'flex flex-col items-center gap-3 px-5 pb-3',
                open ? 'relative z-30' : 'relative z-10'
              )}
            >
              <h1 className="m-0 min-w-0 max-w-full text-balance text-center text-ui-xl font-medium text-foreground">
                Where should we begin?
              </h1>
              <div className="relative shrink-0" ref={pop} aria-label={appName}>
                <button
                  className="flex h-8 max-w-[280px] items-center gap-2 rounded-lg px-2.5 text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setOpen(!open)}
                  title={current?.cwd}
                >
                  <Folder01 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                  <span className="truncate text-ui-caption font-medium text-foreground">
                    {current?.name ?? 'project'}
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                </button>

                <AnimatePresence>
                  {open && (
                    <motion.div
                      className="absolute left-1/2 top-10 z-50 max-h-[320px] w-[260px] -translate-x-1/2 origin-top overflow-y-auto rounded-xl bg-menu p-1 shadow-[var(--shadow-pop)]"
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -3, scale: 0.99 }}
                      transition={BLOOM_FAST}
                    >
                      {projects.map((p) => (
                        <button
                          key={p.cwd}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent',
                            p.cwd === current?.cwd && 'bg-selected'
                          )}
                          onClick={() => {
                            onSelect(p.cwd)
                            setOpen(false)
                          }}
                          title={p.cwd}
                        >
                          <Folder01
                            size={13}
                            strokeWidth={1.8}
                            className={cn(
                              'shrink-0',
                              p.cwd === current?.cwd ? 'text-foreground' : 'text-muted-foreground'
                            )}
                          />
                          <span className="shrink-0 text-ui-caption font-medium text-foreground">
                            {p.name}
                          </span>
                        </button>
                      ))}
                      <button
                        className="mt-1 flex w-full items-center gap-2.5 rounded-md border-t border-border px-3 pb-2 pt-2.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => {
                          setOpen(false)
                          onAddProject()
                        }}
                      >
                        <FolderAdd size={13} strokeWidth={1.8} className="shrink-0" />
                        <span className="text-ui-caption">Add project…</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            <motion.div variants={rise} className="relative z-20">
              <Composer
                running={false}
                onPromptFocus={focusPrompt}
                onPromptBlur={blurPrompt}
                onSend={(content) => {
                  const modelRef = model || providers.defaultModel
                  const divider = modelRef.indexOf('/')
                  const provider = divider > 0 ? modelRef.slice(0, divider) : ''
                  const modelID = divider > 0 ? modelRef.slice(divider + 1) : modelRef
                  const detail = providers.providers
                    .find((entry) => entry.name === provider)
                    ?.modelDetails?.find((item) => item.id === modelID)
                  const effectiveEffort = detail?.reasoningKnown && !detail.reasoning ? '' : effort
                  return onSend(content, model || undefined, effectiveEffort)
                }}
                onStop={() => {}}
                placeholder={`Start a session in ${current?.name ?? 'this project'}…`}
                model={model || providers.defaultModel}
                providers={providers}
                onDiscoverModels={onDiscoverModels}
                notice={notice}
                onDismissNotice={onDismissNotice}
                onModel={(provider, selectedModel) => {
                  setModel(`${provider}/${selectedModel}`)
                  const detail = providers.providers
                    .find((entry) => entry.name === provider)
                    ?.modelDetails?.find((item) => item.id === selectedModel)
                  if (detail?.reasoningKnown && !detail.reasoning) setEffort('')
                }}
                effort={effort}
                onSetEffort={setEffort}
                sendOnEnter={sendOnEnter}
                modelSelectorVariant={modelSelectorVariant}
                effortSelectorVariant={effortSelectorVariant}
                onCommand={onCommand}
              />
            </motion.div>


            <AnimatePresence initial={false}>
              {recents.length > 0 && onOpenSession && showRecents && (
                <motion.section
                  key="recent-sessions"
                  variants={recentListMotion}
                  initial="initial"
                  animate="visible"
                  exit="leaving"
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                  className="w-full max-w-xl self-center overflow-hidden pt-1"
                  aria-label="Recent sessions"
                >
                  <h2 className="mb-2 px-1 text-ui-sm font-medium text-muted-foreground">
                    Recent sessions
                  </h2>
                  <ul className="m-0 list-none overflow-hidden rounded-xl border border-border/70 bg-card/50 p-0">
                    {recents.map((session, index) => (
                      <li key={session.id}>
                        <button
                          type="button"
                          onClick={() => onOpenSession(session.id)}
                          title={session.cwd}
                          className={cn(
                            'group flex min-h-10 w-full min-w-0 items-center gap-3 px-3 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                            index > 0 && 'border-t border-border/50'
                          )}
                        >
                          <HugeiconsIcon
                            icon={Message01Icon}
                            size={15}
                            strokeWidth={1.5}
                            className="shrink-0 text-foreground-subtlest"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">
                            {session.title || session.preview || `${session.messageCount} messages`}
                          </span>
                          <span className="hidden max-w-36 shrink-0 truncate text-ui-xs text-foreground-subtlest sm:block">
                            {session.cwd.split(/[\\/]/).pop()}
                          </span>
                          <span className="w-12 shrink-0 text-right text-ui-xs text-foreground-subtlest">
                            {relTime(session.modified)}
                          </span>
                          <ChevronRight
                            size={13}
                            className="shrink-0 text-foreground-subtlest transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}
