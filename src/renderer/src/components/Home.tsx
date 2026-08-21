import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Folder01, FolderAdd, Rotate01 } from './ui/icons'
import type { ContentBlock, ProvidersInfo, ReasoningEffort } from '../../../shared/protocol'
import Composer from './Composer'
import { Button } from './ui/Button'
import { cn } from '../util'
import type { CommandName } from '../commands'
import { BLOOM_FAST } from '../motion'

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
  notice?: string | null
  onDismissNotice?(): void
  sendOnEnter?: boolean
  onCommand(name: CommandName, argument: string): void
}

export default function Home({
  loading,
  fatal,
  projects,
  selected,
  appName,
  onSelect,
  onAddProject,
  onSend,
  onRetry,
  providers,
  notice,
  onDismissNotice,
  sendOnEnter,
  onCommand
}: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState(providers.defaultModel ?? '')
  const [effort, setEffort] = useState<ReasoningEffort>('medium')
  const pop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (pop.current && !pop.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const current = projects.find((p) => p.cwd === selected) ?? projects[0] ?? null

  return (
    <div className="drag-region flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6">
      <div className="no-drag flex w-full max-w-2xl flex-col items-center gap-3 pb-16">
        {fatal ? (
          <div className="flex w-full max-w-xl flex-col items-center gap-4">
            <pre className="max-h-48 w-full overflow-auto rounded-xl border border-destructive/30 bg-destructive/8 p-4 font-mono text-[12px] leading-relaxed text-destructive-foreground">
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
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between gap-4 px-5">
              <div className="min-w-0 truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">
                {appName}
              </div>
              <div className="relative shrink-0" ref={pop}>
                <button
                  className="flex h-8 max-w-[280px] items-center gap-2 rounded-full border border-border bg-elevated px-3.5 shadow-xs transition-colors hover:border-input hover:bg-hover"
                  onClick={() => setOpen(!open)}
                  title={current?.cwd}
                >
                  <Folder01 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {current?.name ?? 'project'}
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                </button>

              <AnimatePresence>
                {open && (
                  <motion.div
                    className="absolute left-1/2 top-11 z-40 max-h-[320px] w-[260px] origin-top overflow-y-auto rounded-xl border border-border bg-elevated p-1.5 shadow-lg"
                    initial={{ opacity: 0, y: -6, scale: 0.97, filter: 'blur(8px)', x: '-50%' }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', x: '-50%' }}
                    exit={{ opacity: 0, y: -4, scale: 0.985, filter: 'blur(4px)', x: '-50%' }}
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
                        <span className="shrink-0 text-[12.5px] font-medium text-foreground">
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
                      <span className="text-[12.5px]">Add project…</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
            </div>

            <Composer
              running={false}
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
              onCommand={onCommand}
            />
          </div>
        )}
      </div>
    </div>
  )
}
