export type ThemePreference = 'system' | 'dark' | 'light'

/** Named palettes. Each ships a light and a dark variant (see styles.css). */
export type ThemeId = 'default' | 'nord' | 'catppuccin' | 'gruvbox' | 'solarized' | 'dracula'

export interface ThemeMeta {
  id: ThemeId
  name: string
  detail: string
  /** Swatch preview only — the real tokens live in styles.css. [canvas, ink, brand] per mode. */
  light: [string, string, string]
  dark: [string, string, string]
}

export const THEMES: readonly ThemeMeta[] = [
  { id: 'default', name: 'Neutral', detail: 'Quiet greys with a blue accent', light: ['#ffffff', '#232323', '#2563eb'], dark: ['#1b1b1b', '#ececec', '#6aa3ff'] },
  { id: 'nord', name: 'Nord', detail: 'Cool, muted arctic blues', light: ['#eceff4', '#2e3440', '#4c6f9b'], dark: ['#2e3440', '#e5e9f0', '#88c0d0'] },
  { id: 'catppuccin', name: 'Catppuccin', detail: 'Soft pastel — Latte and Mocha', light: ['#eff1f5', '#4c4f69', '#1e66f5'], dark: ['#1e1e2e', '#cdd6f4', '#89b4fa'] },
  { id: 'gruvbox', name: 'Gruvbox', detail: 'Warm retro earth tones', light: ['#fbf1c7', '#3c3836', '#9d5f0b'], dark: ['#282828', '#ebdbb2', '#fabd2f'] },
  { id: 'solarized', name: 'Solarized', detail: 'Balanced low-glare contrast', light: ['#fdf6e3', '#3d535b', '#1f78b4'], dark: ['#002b36', '#a4b1b1', '#3aa0e0'] },
  { id: 'dracula', name: 'Dracula', detail: 'High-contrast purple on charcoal', light: ['#fbfaf7', '#2b2a33', '#6f4fd0'], dark: ['#282a36', '#f2f2ee', '#bd93f9'] }
]
export type MessageSize = 'compact' | 'default' | 'large'
export type ToolActivityDisplay = 'expanded' | 'compact' | 'hidden'
export type ModelSelectorVariant = 'compact' | 'gallery'
export type EffortSelectorVariant = 'slider' | 'chips'
export type SidebarVariant = 'inbox' | 'grouped'
/** Dot-matrix animation patterns; see Orb.tsx for how each one moves. */
export type OrbVariant = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
export const ORB_VARIANTS: readonly { id: OrbVariant; name: string; detail: string }[] = [
  { id: 'S1', name: 'Radiate', detail: 'A round wave spreading from the centre' },
  { id: 'S2', name: 'Sweep', detail: 'A broad band crossing the grid on the diagonal' },
  { id: 'S3', name: 'Orbit', detail: 'One comet with a fading tail around the edge' },
  { id: 'S4', name: 'Scan', detail: 'A soft column travelling left to right' },
  { id: 'S5', name: 'Scatter', detail: 'The edge pulse jumping in scrambled order' }
]
/** Tabs and sidebar rows: an orb pattern, or a plain busy-coloured dot. */
export type RunIndicatorStyle = OrbVariant | 'color'
export type SidebarRunColor = 'yellow' | 'blue' | 'green' | 'red' | 'neutral'

/** Resolve the shared sidebar-and-tab running indicator color. */
export function runIndicatorColorValue(color: SidebarRunColor): string {
  switch (color) {
    case 'blue': return '#60a5fa'
    case 'green': return '#4ade80'
    case 'red': return '#f87171'
    case 'neutral': return 'var(--muted-foreground)'
    default: return 'var(--busy)'
  }
}

export interface Preferences {
  theme: ThemePreference
  /** Named palette; light/dark is chosen separately by `theme`. */
  themeId: ThemeId
  messageSize: MessageSize
  reducedMotion: boolean
  autoScroll: boolean
  sendOnEnter: boolean
  toolActivityDisplay: ToolActivityDisplay
  modelSelectorVariant: ModelSelectorVariant
  /**
   * Effort picker presentation: the slider rail, or the original row of level
   * chips. The chips variant also restores click-to-cycle on the trigger.
   */
  effortSelectorVariant: EffortSelectorVariant
  /**
   * Sidebar presentation: the inbox-style flat filtered list, or the original
   * grouped view with every project folder expanded in one place.
   */
  sidebarVariant: SidebarVariant
  /** How a running session is marked on tabs and sidebar rows. */
  runIndicator: RunIndicatorStyle
  /** Color for a running session glyph in the sidebar; tabs retain busy yellow. */
  sidebarRunColor: SidebarRunColor
  /** Orb pattern beside "Working" in the chat. */
  workingOrb: OrbVariant
  /** Experimental: +N −M uncommitted-change counts on tabs. */
  tabDiffCounts: boolean
  /** Experimental: folded turn reads "N tool calls · M messages". */
  compactTurnSummary: boolean
  /** Experimental: "Subagents N" chip above the composer. */
  subagentsChip: boolean
  /** Whether the desktop material should be visible through the app shell. */
  transparencyEnabled: boolean
  /** 0 is more opaque; 100 lets more of the desktop material show through. */
  transparency: number
  /**
   * Interface font size in px. Drives --ui-font-size, so every text-ui-* token
   * scales while spacing, radii and icons stay fixed. See DESIGN.md.
   */
  interfaceFontSize: number
  /** Display name shown in the window's titlebar strip. */
  appName: string
}

const KEY = 'myagent.desktop.preferences'
const DEFAULT_APP_NAME = 'myagent'
const APP_NAME_MAX = 32
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 18

export const defaults: Preferences = {
  theme: 'system',
  themeId: 'default',
  messageSize: 'default',
  reducedMotion: false,
  autoScroll: true,
  sendOnEnter: true,
  toolActivityDisplay: 'compact',
  modelSelectorVariant: 'compact',
  effortSelectorVariant: 'slider',
  sidebarVariant: 'inbox',
  runIndicator: 'S1',
  sidebarRunColor: 'yellow',
  workingOrb: 'S1',
  tabDiffCounts: true,
  compactTurnSummary: true,
  subagentsChip: true,
  transparencyEnabled: true,
  transparency: 50,
  interfaceFontSize: 13.5,
  appName: DEFAULT_APP_NAME
}

/** Keep the visual preference safe when localStorage contains old or invalid data. */
export function normalizeTransparency(value: number | undefined | null): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value as number))) : defaults.transparency
}

/** Clamp the interface font size to a readable band; invalid input falls back. */
export function normalizeFontSize(value: number | undefined | null): number {
  return Number.isFinite(value)
    ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round((value as number) * 2) / 2))
    : defaults.interfaceFontSize
}

/** Normalize the app title; empty/whitespace falls back to default. */
export function normalizeAppName(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim().slice(0, APP_NAME_MAX)
  return trimmed || DEFAULT_APP_NAME
}

function isOrbVariant(value: unknown): value is OrbVariant {
  return ORB_VARIANTS.some((variant) => variant.id === value)
}

export function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preferences>
    return {
      ...defaults,
      ...stored,
      themeId: THEMES.some((t) => t.id === stored.themeId) ? (stored.themeId as ThemeId) : 'default',
      toolActivityDisplay: stored.toolActivityDisplay === 'expanded' || stored.toolActivityDisplay === 'hidden' ? stored.toolActivityDisplay : 'compact',
      modelSelectorVariant: stored.modelSelectorVariant === 'gallery' ? 'gallery' : 'compact',
      effortSelectorVariant: stored.effortSelectorVariant === 'chips' ? 'chips' : 'slider',
      sidebarVariant: stored.sidebarVariant === 'grouped' ? 'grouped' : 'inbox',
      // 'dotmatrix' was the pre-variant name for the radiating pattern.
      runIndicator:
        stored.runIndicator === 'color' ? 'color' : isOrbVariant(stored.runIndicator) ? stored.runIndicator : 'S1',
      sidebarRunColor: ['yellow', 'blue', 'green', 'red', 'neutral'].includes(stored.sidebarRunColor as string)
        ? stored.sidebarRunColor as SidebarRunColor
        : 'yellow',
      workingOrb: isOrbVariant(stored.workingOrb) ? stored.workingOrb : 'S1',
      tabDiffCounts: stored.tabDiffCounts !== false,
      compactTurnSummary: stored.compactTurnSummary !== false,
      subagentsChip: stored.subagentsChip !== false,
      transparencyEnabled: stored.transparencyEnabled !== false,
      transparency: normalizeTransparency(stored.transparency),
      interfaceFontSize: normalizeFontSize(stored.interfaceFontSize),
      appName: normalizeAppName(stored.appName ?? defaults.appName)
    }
  } catch {
    return defaults
  }
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...preferences, appName: normalizeAppName(preferences.appName) })
  )
}

export function applyTheme(theme: ThemePreference, themeId: ThemeId = 'default'): void {
  const root = document.documentElement
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  if (root.classList.contains('dark') !== dark || root.dataset.theme !== themeId) {
    // A theme flip repaints colour, background, border and shadow on nearly
    // every element; without this the per-element transitions smear the swap.
    const freeze = document.createElement('style')
    freeze.textContent = '*,*::before,*::after{transition:none !important}'
    document.head.appendChild(freeze)
    root.classList.toggle('dark', dark)
    root.dataset.theme = themeId
    void root.offsetHeight
    requestAnimationFrame(() => freeze.remove())
  }
  void window.myagent.setTheme(dark ? 'dark' : 'light')
}

/**
 * Apply the interface font size. Only --ui-font-size moves — never the root
 * html font size — so the text-ui-* scale grows while layout geometry holds.
 */
export function applyFontSize(size: number): void {
  document.documentElement.style.setProperty('--ui-font-size', `${normalizeFontSize(size)}px`)
}
