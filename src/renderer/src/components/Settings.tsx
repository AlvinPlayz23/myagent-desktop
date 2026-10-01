import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { Archive01, ArchiveRestore, ComputerTerminal, Globe02, Keyboard01, Message01, Search01, Settings01, Tick01 } from './ui/icons'
import type { ConnState } from '../state'
import { THEMES, normalizeAppName, normalizeFontSize, type ThemeId, type Preferences, type ThemePreference, type MessageSize, type ToolActivityDisplay, type ModelSelectorVariant, type EffortSelectorVariant, type SidebarVariant } from '../preferences'
import type { ProviderInput, ProvidersInfo, SessionMeta } from '../../../shared/protocol'
import { cn } from '../util'
import { shortcuts, shortcutCategories, formatCombo } from '../shortcuts'
import ProviderManager from './ProviderManager'

function CloseIcon(): JSX.Element {
  return <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} aria-hidden />
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
  { value: 'dark', title: 'Dark', detail: 'Dark surfaces, easier on the eyes at night' },
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

const modelSelectorVariants: Array<{ value: ModelSelectorVariant; title: string; detail: string }> = [
  { value: 'compact', title: 'Compact', detail: 'Classic dropdown with search and provider cycler' },
  { value: 'gallery', title: 'Gallery', detail: 'Provider rail with Quick Search and radio rows' }
]

const effortSelectorVariants: Array<{ value: EffortSelectorVariant; title: string; detail: string }> = [
  { value: 'slider', title: 'Slider', detail: 'Single rail — drag or step through every reasoning level' },
  { value: 'chips', title: 'Chips', detail: 'Click the control to cycle levels; right-click opens the JellyRadio row with every level visible' }
]

const sidebarVariants: Array<{ value: SidebarVariant; title: string; detail: string }> = [
  { value: 'inbox', title: 'Inbox', detail: 'Flat filtered list with project picker and live-run pinning' },
  { value: 'grouped', title: 'Grouped', detail: 'All folders in one place with expandable project sections' }
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
        <h2 className="text-ui-caption font-medium text-muted-foreground">{title}</h2>
        {headerAction && <div className="flex h-5 items-center justify-end">{headerAction}</div>}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-panel text-card-foreground">
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
          <h3 className="text-ui-caption font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          {description && <p className="text-ui-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {control && <div className="flex shrink-0 items-center gap-2 sm:justify-end">{control}</div>}
      </div>
      {children}
    </div>
  )
}

function ChoiceRail<T extends string>({
  id,
  label,
  options,
  current,
  onSelect
}: {
  id: string
  label: string
  options: ReadonlyArray<{ value: T; title: string }>
  current: T
  onSelect(value: T): void
}): JSX.Element {
  const items = useRef<Array<HTMLButtonElement | null>>([])

  // Roving tabindex: arrows walk the rail, Home/End jump to either end.
  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>): void => {
    let next = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = options.length - 1
    if (next < 0) return
    event.preventDefault()
    onSelect(options[next].value)
    items.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-[10px] bg-muted p-0.5"
    >
      {options.map((item, index) => {
        const selected = item.value === current
        return (
          <button
            key={item.value}
            ref={(element) => {
              items.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(item.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            className={cn(
              'relative flex h-7.5 cursor-pointer items-center justify-center rounded-lg px-3 text-ui-sm outline-none transition-colors',
              selected ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground'
            )}
          >
            {selected && (
              <motion.span
                layoutId={`settings-choice-pill-${id}`}
                className="absolute inset-0 rounded-lg bg-background shadow-xs ring-1 ring-border dark:bg-input"
                transition={{ type: 'spring', stiffness: 620, damping: 48 }}
              />
            )}
            <span className="relative whitespace-nowrap">{item.title}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A flat settings row whose control is a segmented rail, with the selected
 *  option's explanation standing in for the row description. */
function ChoiceRailRow<T extends string>({
  id,
  title,
  options,
  current,
  onSelect
}: {
  id: string
  title: string
  options: ReadonlyArray<{ value: T; title: string; detail: string }>
  current: T
  onSelect(value: T): void
}): JSX.Element {
  const active = options.find((item) => item.value === current)
  return (
    <SettingsRow
      title={title}
      description={active?.detail}
      control={<ChoiceRail id={id} label={title} options={options} current={current} onSelect={onSelect} />}
    />
  )
}

function ThemeGallery({ current, dark, onSelect }: { current: ThemeId; dark: boolean; onSelect(id: ThemeId): void }): JSX.Element {
  return (
    <div role="radiogroup" aria-label="Color theme" className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3">
      {THEMES.map((theme) => {
        const [canvas, ink, brand] = dark ? theme.dark : theme.light
        const active = theme.id === current
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(theme.id)}
            className={cn(
              'group flex min-w-0 flex-col gap-2 rounded-xl p-1.5 text-left outline-none transition-colors duration-[var(--duration-quick)] focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-selected' : 'hover:bg-hover'
            )}
          >
            <span
              aria-hidden
              className="relative flex h-14 overflow-hidden rounded-lg"
              style={{ background: canvas, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 14%, transparent)` }}
            >
              <span className="w-1/4" style={{ background: `color-mix(in srgb, ${ink} 7%, ${canvas})` }} />
              <span className="flex flex-1 flex-col justify-center gap-1.5 px-2.5">
                <span className="h-1 w-3/4 rounded-full" style={{ background: `color-mix(in srgb, ${ink} 70%, transparent)` }} />
                <span className="h-1 w-1/2 rounded-full" style={{ background: `color-mix(in srgb, ${ink} 28%, transparent)` }} />
                <span className="h-1.5 w-6 rounded-full" style={{ background: brand }} />
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5 px-1 pb-0.5">
              <span className="min-w-0 flex-1 truncate text-ui-caption font-medium text-foreground">{theme.name}</span>
              {active && <Tick01 size={13} strokeWidth={2} className="shrink-0 text-foreground" aria-hidden />}
            </span>
          </button>
        )
      })}
    </div>
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
              checked ? 'translate-x-[18px] bg-primary-foreground' : 'translate-x-0.5 bg-background'
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
      className="no-drag fixed inset-0 z-[100] flex items-center justify-center bg-overlay backdrop-blur-md p-4 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 6 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="no-drag relative flex h-[720px] max-h-[90vh] w-[900px] max-w-[95vw] overflow-hidden rounded-2xl border border-popover-border bg-popover text-popover-foreground shadow-lg p-1.5 gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Sidebar inside Popup */}
        <aside className="flex w-56 shrink-0 flex-col gap-4 p-3.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClose?.()
              }}
              className="flex items-center gap-2 text-ui-sm font-semibold text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer"
            >
              <CloseIcon />
              <span>Settings</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <Search01 size={13} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              className="h-8.5 w-full rounded-xl border border-border bg-background pl-8 pr-2.5 text-ui-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-input focus:ring-1 focus:ring-ring/30"
            />
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto space-y-4 pt-1">
            {filteredCategories.map((group) => (
              <div key={group.group} className="space-y-1">
                <div className="px-2 pb-1 text-ui-sm font-medium text-muted-foreground">
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
                        'relative flex h-8.5 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-ui-sm font-medium transition-colors outline-none cursor-pointer',
                        active ? 'text-foreground font-semibold' : 'text-muted-foreground hover:bg-hover/70 hover:text-foreground'
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="popup-settings-nav-pill"
                          className="absolute inset-0 rounded-xl bg-selected"
                          transition={{ type: 'spring', stiffness: 620, damping: 48 }}
                        />
                      )}
                      <Icon size={14} strokeWidth={1.8} className={cn('relative shrink-0', active ? 'text-foreground' : 'text-muted-foreground')} />
                      <span className="relative min-w-0 truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Right Curved Card Content Area matching reference image */}
        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card text-card-foreground">
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
                  <h1 className="m-0 text-ui-xl font-semibold tracking-tight text-foreground sm:text-ui-xl">Appearance</h1>
                  <p className="mt-1 text-ui-sm text-muted-foreground">Customize theme, window transparency, and desktop presentation.</p>
                </div>

                <SettingsSection title="Mode">
                  <ChoiceRailRow
                    id="theme"
                    title="Light or dark"
                    options={themes}
                    current={preferences.theme}
                    onSelect={(theme) => onChange({ theme })}
                  />
                </SettingsSection>

                <SettingsSection title="Color theme">
                  <ThemeGallery
                    current={preferences.themeId}
                    dark={preferences.theme === 'dark' || (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)}
                    onSelect={(themeId) => onChange({ themeId })}
                  />
                </SettingsSection>

                <SettingsSection title="Window & Interface">
                  <ToggleRow
                    checked={preferences.transparencyEnabled}
                    title="Desktop transparency"
                    detail="Show the desktop material through the app window. Turn this off for a solid, lower-compositing surface."
                    onChange={(transparencyEnabled) => onChange({ transparencyEnabled })}
                  />

                  <SettingsRow
                    title="Window transparency"
                    description="Adjust desktop backdrop blending intensity for acrylic and mica materials."
                    control={<output className="font-mono text-ui-sm tabular-nums text-muted-foreground">{preferences.transparency}%</output>}
                  >
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-ui-xs font-medium text-foreground-subtlest">Solid</span>
                      <input
                        aria-label="Window transparency"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={preferences.transparency}
                        disabled={!preferences.transparencyEnabled}
                        onChange={(event) => onChange({ transparency: Number(event.target.value) })}
                        className="transparency-slider min-w-0 flex-1"
                      />
                      <span className="text-ui-xs font-medium text-foreground-subtlest">Clear</span>
                    </div>
                  </SettingsRow>

                  <ToggleRow
                    checked={preferences.reducedMotion}
                    title="Reduce motion"
                    detail="Minimize UI animations, blurs, and transitional effects."
                    onChange={(reducedMotion) => onChange({ reducedMotion })}
                  />

                  <SettingsRow
                    title="Interface size"
                    description="Scale all interface text. Spacing, radii, and icons stay fixed."
                    control={<output className="font-mono text-ui-sm tabular-nums text-muted-foreground">{preferences.interfaceFontSize}px</output>}
                  >
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-ui-xs font-medium text-foreground-subtlest">Small</span>
                      <input
                        aria-label="Interface size"
                        type="range"
                        min="12"
                        max="18"
                        step="0.5"
                        value={preferences.interfaceFontSize}
                        onChange={(event) => onChange({ interfaceFontSize: normalizeFontSize(Number(event.target.value)) })}
                        className="transparency-slider min-w-0 flex-1"
                      />
                      <span className="text-ui-xs font-medium text-foreground-subtlest">Large</span>
                    </div>
                  </SettingsRow>

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
                        className="h-8.5 w-44 rounded-lg border border-border bg-background px-3 font-mono text-ui-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-input focus:ring-1 focus:ring-ring/30"
                      />
                    }
                  />
                </SettingsSection>
              </>
            )}

            {section === 'chat' && (
              <>
                <div>
                  <h1 className="m-0 text-ui-xl font-semibold tracking-tight text-foreground sm:text-ui-xl">Chat</h1>
                  <p className="mt-1 text-ui-sm text-muted-foreground">Configure message density, tool activity visualization, and input behavior.</p>
                </div>

                <SettingsSection title="Message density">
                  <ChoiceRailRow
                    id="message-size"
                    title="Message density"
                    options={sizes}
                    current={preferences.messageSize}
                    onSelect={(messageSize) => onChange({ messageSize })}
                  />
                </SettingsSection>

                <SettingsSection title="Tool execution cards">
                  <ChoiceRailRow
                    id="tool-activity"
                    title="Tool execution cards"
                    options={toolDisplays}
                    current={preferences.toolActivityDisplay}
                    onSelect={(toolActivityDisplay) => onChange({ toolActivityDisplay })}
                  />
                </SettingsSection>

                <SettingsSection title="Model selector">
                  <ChoiceRailRow
                    id="model-selector"
                    title="Model selector"
                    options={modelSelectorVariants}
                    current={preferences.modelSelectorVariant}
                    onSelect={(modelSelectorVariant) => onChange({ modelSelectorVariant })}
                  />
                </SettingsSection>

                <SettingsSection title="Effort selector">
                  <ChoiceRailRow
                    id="effort-selector"
                    title="Effort selector"
                    options={effortSelectorVariants}
                    current={preferences.effortSelectorVariant}
                    onSelect={(effortSelectorVariant) => onChange({ effortSelectorVariant })}
                  />
                </SettingsSection>

                <SettingsSection title="Sidebar">
                  <ChoiceRailRow
                    id="sidebar-variant"
                    title="Sidebar"
                    options={sidebarVariants}
                    current={preferences.sidebarVariant}
                    onSelect={(sidebarVariant) => onChange({ sidebarVariant })}
                  />
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
                  <h1 className="m-0 text-ui-xl font-semibold tracking-tight text-foreground sm:text-ui-xl">Archive</h1>
                  <p className="mt-1 text-ui-sm text-muted-foreground">Archived threads remain stored locally and can be restored at any time.</p>
                </div>

                <SettingsSection title="Archived Threads">
                  {archivedSessions.length === 0 ? (
                    <div className="px-5 py-10 text-center text-ui-sm text-foreground-subtlest">
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
                              className="flex h-7.5 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-ui-sm font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
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
                  <h1 className="m-0 text-ui-xl font-semibold tracking-tight text-foreground sm:text-ui-xl">Keyboard Shortcuts</h1>
                  <p className="mt-1 text-ui-sm text-muted-foreground">Global hotkeys for fast keyboard navigation.</p>
                </div>

                {shortcutCategories.map((category) => (
                  <SettingsSection key={category} title={category}>
                    {shortcuts
                      .filter((s) => s.category === category)
                      .map((s) => (
                        <SettingsRow
                          key={s.id}
                          title={<span className="font-normal text-muted-foreground">{s.description}</span>}
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
                  <h1 className="m-0 text-ui-xl font-semibold tracking-tight text-foreground sm:text-ui-xl">About</h1>
                  <p className="mt-1 text-ui-sm text-muted-foreground">Desktop runtime environment and server status.</p>
                </div>

                <SettingsSection title="System Information">
                  <SettingsRow
                    title="Connection status"
                    control={
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-ui-sm font-semibold capitalize',
                          conn === 'connected' ? 'bg-success/15 text-success-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {conn}
                      </span>
                    }
                  />
                  <SettingsRow
                    title="Myagent server"
                    control={<code className="rounded bg-muted px-2 py-0.5 font-mono text-ui-sm text-muted-foreground">{serverVersion ? `serve ${serverVersion}` : 'detecting...'}</code>}
                  />
                  <SettingsRow
                    title="Desktop app"
                    control={<code className="rounded bg-muted px-2 py-0.5 font-mono text-ui-sm text-muted-foreground">0.1.0</code>}
                  />
                </SettingsSection>

                {detail && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 font-mono text-ui-sm text-destructive-foreground">
                    {detail}
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    onClick={onReconnect}
                    className="h-8.5 rounded-lg border border-border bg-background px-4 text-ui-sm font-semibold text-foreground transition-colors hover:bg-hover"
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
