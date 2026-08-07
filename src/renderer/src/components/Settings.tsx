import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Archive01, ArchiveRestore, Check, ComputerTerminal, Globe02, Keyboard01, Message01, Search01, Settings01 } from './ui/icons'
import type { ConnState } from '../state'
import { normalizeAppName, type Preferences, type ThemePreference, type MessageSize, type ToolActivityDisplay } from '../preferences'
import type { ProviderInput, ProvidersInfo, SessionMeta } from '../../../shared/protocol'
import { cn } from '../util'
import { shortcuts, shortcutCategories, formatCombo } from '../shortcuts'
import ProviderManager from './ProviderManager'

function CloseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  preferences: Preferences
  onChange(patch: Partial<Preferences>): void
  conn: ConnState
  detail?: string
  serverVersion?: string
  onReconnect(): void
  archivedSessions: SessionMeta[]
  onOpenArchived(id: string): void
  onRestore(id: string): void
  providers: ProvidersInfo
  onSaveProvider(input: ProviderInput): Promise<void>
  onDeleteProvider(name: string): Promise<void>
  onDefaultProvider(name: string, model: string): Promise<void>
  onDiscoverProvider(name: string, apiKey: string): Promise<string[]>
  onClose?(): void
}

const themes: Array<{ value: ThemePreference; title: string; detail: string }> = [
  { value: 'system', title: 'System', detail: 'Follow your operating system theme' },
  { value: 'dark', title: 'Dark', detail: 'Near-black high contrast dark mode' },
  { value: 'light', title: 'Light', detail: 'Clean neutral light mode' }
]

const sizes: Array<{ value: MessageSize; title: string; detail: string }> = [
  { value: 'compact', title: 'Compact', detail: 'Tighter line spacing, more in view' },
  { value: 'default', title: 'Default', detail: 'Balanced reading scale' },
  { value: 'large', title: 'Large', detail: 'Comfortable presentation' }
]

const toolDisplays: Array<{ value: ToolActivityDisplay; title: string; detail: string }> = [
  { value: 'expanded', title: 'Expanded', detail: 'Every tool execution as its own card' },
  { value: 'compact', title: 'Compact', detail: 'Tools inline while running; fold when done' },
  { value: 'hidden', title: 'Hidden', detail: 'Quiet chat stream; only show failures' }
]

function SettingsSection({
  title,
  children,
  headerAction,
  className
}: {
  title: string
  children: React.ReactNode
  headerAction?: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <section className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          <span className="inline-block h-px w-3 bg-border" aria-hidden />
          {title}
        </h2>
        {headerAction && <div className="flex h-5 items-center justify-end">{headerAction}</div>}
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xs">
        {children}
      </div>
    </section>
  )
}

function SettingsRow({
  title,
  description,
  control,
  children,
  className
}: {
  title: React.ReactNode
  description?: React.ReactNode
  control?: React.ReactNode
  children?: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'border-t border-border/60 px-4 py-3.5 first:border-t-0 sm:px-5',
        children ? 'pb-4 pt-3.5' : 'py-3.5',
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          {description && <p className="text-xs leading-relaxed text-muted-foreground/80">{description}</p>}
        </div>
        {control && <div className="flex shrink-0 items-center gap-2 sm:justify-end">{control}</div>}
      </div>
      {children}
    </div>
  )
}

function ChoiceCard<T extends string>({
  value,
  current,
  title,
  detail,
  onSelect
}: {
  value: T
  current: T
  title: string
  detail: string
  onSelect(value: T): void
}): JSX.Element {
  const selected = value === current
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'relative flex flex-1 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left outline-none transition-all duration-150',
        selected
          ? 'border-foreground/30 bg-muted/60 shadow-xs ring-1 ring-border'
          : 'border-border/80 bg-background/50 hover:border-foreground/20 hover:bg-muted/30'
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-transparent'
        )}
      >
        {selected && <Check size={10} strokeWidth={2.5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground/80">{detail}</span>
      </span>
    </button>
  )
}

function ToggleRow({
  checked,
  title,
  detail,
  onChange
}: {
  checked: boolean
  title: string
  detail: string
  onChange(value: boolean): void
}): JSX.Element {
  return (
    <SettingsRow
      title={title}
      description={detail}
      control={
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring',
            checked ? 'bg-primary' : 'bg-input'
          )}
        >
          <span
            className={cn(
              'absolute left-0 top-0.5 size-4 rounded-full shadow-sm transition-transform duration-200',
              checked ? 'translate-x-[18px] bg-primary-foreground' : 'translate-x-0.5 bg-white'
            )}
          />
        </button>
      }
    />
  )
}

type SectionId = 'appearance' | 'chat' | 'providers' | 'archive' | 'shortcuts' | 'about'

export default function Settings({
  preferences,
  onChange,
  conn,
  detail,
  serverVersion,
  onReconnect,
  archivedSessions,
  onOpenArchived,
  onRestore,
  providers,
  onSaveProvider,
  onDeleteProvider,
  onDefaultProvider,
  onDiscoverProvider,
  onClose
}: Props): JSX.Element {
  const [section, setSection] = useState<SectionId>('appearance')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && onClose) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const categories = [
    {
      group: 'PREFERENCES',
      items: [
        { id: 'appearance' as const, label: 'Appearance', icon: Settings01 },
        { id: 'chat' as const, label: 'Chat', icon: Message01 }
      ]
    },
    {
      group: 'SERVICES',
      items: [
        { id: 'providers' as const, label: 'Providers', icon: Globe02 },
        { id: 'archive' as const, label: 'Archive', icon: Archive01 }
      ]
    },
    {
      group: 'SYSTEM',
      items: [
        { id: 'shortcuts' as const, label: 'Shortcuts', icon: Keyboard01 },
        { id: 'about' as const, label: 'About', icon: ComputerTerminal }
      ]
    }
  ]

  const query = search.trim().toLowerCase()
  const filteredCategories = categories.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (item) => !query || item.label.toLowerCase().includes(query) || cat.group.toLowerCase().includes(query)
    )
  })).filter((cat) => cat.items.length > 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="no-drag fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-md p-4 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="no-drag relative flex h-[640px] max-h-[85vh] w-[900px] max-w-[95vw] overflow-hidden rounded-[22px] border border-border bg-sidebar text-card-foreground shadow-2xl p-1.5 gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Sidebar inside Popup */}
        <aside className="w-56 shrink-0 p-3.5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClose?.()
              }}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/80 hover:text-foreground transition-colors outline-none cursor-pointer"
            >
              <CloseIcon />
              <span>Settings</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <Search01 size={13} className="pointer-events-none absolute left-2.5 text-muted-foreground/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              className="h-8.5 w-full rounded-xl border border-border bg-background pl-8 pr-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-input focus:ring-1 focus:ring-ring/30"
            />
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto space-y-4 pt-1">
            {filteredCategories.map((group) => (
              <div key={group.group} className="space-y-1">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
                  {group.group}
                </div>
                {group.items.map(({ id, label, icon: Icon }) => {
                  const active = section === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSection(id)}
                      className={cn(
                        'relative flex h-8.5 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-xs font-medium transition-colors outline-none cursor-pointer',
                        active ? 'text-foreground font-semibold' : 'text-muted-foreground/80 hover:bg-hover/70 hover:text-foreground'
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="popup-settings-nav-pill"
                          className="absolute inset-0 rounded-xl bg-selected"
                          transition={{ type: 'spring', stiffness: 620, damping: 48 }}
                        />
                      )}
                      <Icon size={14} strokeWidth={1.8} className={cn('relative shrink-0', active ? 'text-foreground' : 'text-muted-foreground/60')} />
                      <span className="relative min-w-0 truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Right Curved Card Content Area matching reference image */}
        <div className="min-w-0 flex-1 rounded-[18px] border border-border/60 bg-card overflow-y-auto shadow-sm">
          {section === 'providers' ? (
            <motion.div
              key="providers"
              className="flex flex-col min-w-0 flex-1"
              initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <ProviderManager
              providers={providers}
              onSave={onSaveProvider}
              onDelete={onDeleteProvider}
              onDefault={onDefaultProvider}
              onDiscover={onDiscoverProvider}
            />
          </motion.div>
        ) : (
          <motion.div
            key={section}
            className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 sm:p-8"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {section === 'appearance' && (
              <>
                <div>
                  <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Appearance</h1>
                  <p className="mt-1 text-xs text-muted-foreground/80">Customize theme, window transparency, and desktop presentation.</p>
                </div>

                <SettingsSection title="Theme">
                  <div className="grid gap-2.5 p-4 sm:grid-cols-3">
                    {themes.map((item) => (
                      <ChoiceCard key={item.value} {...item} current={preferences.theme} onSelect={(theme) => onChange({ theme })} />
                    ))}
                  </div>
                </SettingsSection>

                <SettingsSection title="Window & Interface">
                  <SettingsRow
                    title="Window transparency"
                    description="Adjust desktop backdrop blending intensity for acrylic and mica materials."
                    control={<output className="font-mono text-xs tabular-nums text-muted-foreground">{preferences.transparency}%</output>}
                  >
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-[10.5px] font-medium text-muted-foreground/70">Solid</span>
                      <input
                        aria-label="Window transparency"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={preferences.transparency}
                        onChange={(event) => onChange({ transparency: Number(event.target.value) })}
                        className="transparency-slider min-w-0 flex-1"
                      />
                      <span className="text-[10.5px] font-medium text-muted-foreground/70">Clear</span>
                    </div>
                  </SettingsRow>

                  <ToggleRow
                    checked={preferences.reducedMotion}
                    title="Reduce motion"
                    detail="Minimize UI animations, blurs, and transitional effects."
                    onChange={(reducedMotion) => onChange({ reducedMotion })}
                  />

                  <SettingsRow
                    title="App title"
                    description="Custom label displayed in the desktop window titlebar strip."
                    control={
                      <input
                        type="text"
                        value={preferences.appName}
                        maxLength={32}
                        placeholder="myagent"
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => onChange({ appName: e.target.value })}
                        onBlur={(e) => onChange({ appName: normalizeAppName(e.target.value) })}
                        className="h-8.5 w-44 rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-input focus:ring-1 focus:ring-ring/30"
                      />
                    }
                  />
                </SettingsSection>
              </>
            )}

            {section === 'chat' && (
              <>
                <div>
                  <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Chat</h1>
                  <p className="mt-1 text-xs text-muted-foreground/80">Configure message density, tool activity visualization, and input behavior.</p>
                </div>

                <SettingsSection title="Message density">
                  <div className="grid gap-2.5 p-4 sm:grid-cols-3">
                    {sizes.map((item) => (
                      <ChoiceCard key={item.value} {...item} current={preferences.messageSize} onSelect={(messageSize) => onChange({ messageSize })} />
                    ))}
                  </div>
                </SettingsSection>

                <SettingsSection title="Tool execution cards">
                  <div className="grid gap-2.5 p-4 sm:grid-cols-3">
                    {toolDisplays.map((item) => (
                      <ChoiceCard key={item.value} {...item} current={preferences.toolActivityDisplay} onSelect={(toolActivityDisplay) => onChange({ toolActivityDisplay })} />
                    ))}
                  </div>
                </SettingsSection>

                <SettingsSection title="Behavior">
                  <ToggleRow
                    checked={preferences.autoScroll}
                    title="Auto-scroll to latest"
                    detail="Automatically scroll down as new tokens and tool outputs arrive while at the bottom."
                    onChange={(autoScroll) => onChange({ autoScroll })}
                  />
                  <ToggleRow
                    checked={preferences.sendOnEnter}
                    title="Enter sends prompt"
                    detail="Press Enter to send message, or Shift+Enter to insert a new line."
                    onChange={(sendOnEnter) => onChange({ sendOnEnter })}
                  />
                </SettingsSection>
              </>
            )}

            {section === 'archive' && (
              <>
                <div>
                  <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Archive</h1>
                  <p className="mt-1 text-xs text-muted-foreground/80">Archived threads remain stored locally and can be restored at any time.</p>
                </div>

                <SettingsSection title="Archived Threads">
                  {archivedSessions.length === 0 ? (
                    <div className="px-5 py-10 text-center text-xs text-muted-foreground/70">
                      No archived sessions found.
                    </div>
                  ) : (
                    <div>
                      {archivedSessions.map((session) => (
                        <SettingsRow
                          key={session.id}
                          title={session.title || session.preview || `${session.messageCount} messages`}
                          description={session.cwd}
                          control={
                            <button
                              type="button"
                              onClick={() => onRestore(session.id)}
                              className="flex h-7.5 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                            >
                              <ArchiveRestore size={13} strokeWidth={1.8} /> Restore
                            </button>
                          }
                        />
                      ))}
                    </div>
                  )}
                </SettingsSection>
              </>
            )}

            {section === 'shortcuts' && (
              <>
                <div>
                  <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Keyboard Shortcuts</h1>
                  <p className="mt-1 text-xs text-muted-foreground/80">Global hotkeys for fast keyboard navigation.</p>
                </div>

                {shortcutCategories.map((category) => (
                  <SettingsSection key={category} title={category}>
                    {shortcuts
                      .filter((s) => s.category === category)
                      .map((s) => (
                        <SettingsRow
                          key={s.id}
                          title={<span className="font-normal text-foreground/90">{s.description}</span>}
                          control={<kbd className="shortcut-key">{formatCombo(s.combo)}</kbd>}
                        />
                      ))}
                  </SettingsSection>
                ))}
              </>
            )}

            {section === 'about' && (
              <>
                <div>
                  <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">About</h1>
                  <p className="mt-1 text-xs text-muted-foreground/80">Desktop runtime environment and server status.</p>
                </div>

                <SettingsSection title="System Information">
                  <SettingsRow
                    title="Connection status"
                    control={
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize',
                          conn === 'connected' ? 'bg-success/15 text-success-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {conn}
                      </span>
                    }
                  />
                  <SettingsRow
                    title="Myagent server"
                    control={<code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{serverVersion ? `serve ${serverVersion}` : 'detecting...'}</code>}
                  />
                  <SettingsRow
                    title="Desktop app"
                    control={<code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">0.1.0</code>}
                  />
                </SettingsSection>

                {detail && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 font-mono text-xs text-destructive-foreground">
                    {detail}
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    onClick={onReconnect}
                    className="h-8.5 rounded-lg border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-hover"
                  >
                    Reconnect server
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
        </div>
      </motion.div>
    </motion.div>
  )
}
