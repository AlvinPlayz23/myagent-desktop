export type ThemePreference = 'system' | 'dark' | 'light'
export type AccentPreference = 'cobalt' | 'violet' | 'jade' | 'amber'
export type MessageSize = 'compact' | 'default' | 'large'
export type ToolActivityDisplay = 'expanded' | 'compact' | 'hidden'
export type ModelSelectorVariant = 'compact' | 'gallery'
export type EffortSelectorVariant = 'slider' | 'chips'
export type SidebarVariant = 'inbox' | 'grouped'

export interface Preferences {
  theme: ThemePreference
  accent: AccentPreference
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

function normalizeAccent(value: unknown): AccentPreference {
  return value === 'violet' || value === 'jade' || value === 'amber' ? value : 'cobalt'
}

export const defaults: Preferences = {
  theme: 'system',
  accent: 'cobalt',
  messageSize: 'default',
  reducedMotion: false,
  autoScroll: true,
  sendOnEnter: true,
  toolActivityDisplay: 'compact',
  modelSelectorVariant: 'compact',
  effortSelectorVariant: 'slider',
  sidebarVariant: 'inbox',
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

export function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preferences>
    return {
      ...defaults,
      ...stored,
      accent: normalizeAccent(stored.accent),
      toolActivityDisplay: stored.toolActivityDisplay === 'expanded' || stored.toolActivityDisplay === 'hidden' ? stored.toolActivityDisplay : 'compact',
      modelSelectorVariant: stored.modelSelectorVariant === 'gallery' ? 'gallery' : 'compact',
      effortSelectorVariant: stored.effortSelectorVariant === 'chips' ? 'chips' : 'slider',
      sidebarVariant: stored.sidebarVariant === 'grouped' ? 'grouped' : 'inbox',
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

export function applyTheme(theme: ThemePreference): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  document.documentElement.classList.toggle('dark', dark)
  void window.myagent.setTheme(dark ? 'dark' : 'light')
}

export function applyAccent(accent: AccentPreference): void {
  document.documentElement.dataset.accent = normalizeAccent(accent)
}

/**
 * Apply the interface font size. Only --ui-font-size moves — never the root
 * html font size — so the text-ui-* scale grows while layout geometry holds.
 */
export function applyFontSize(size: number): void {
  document.documentElement.style.setProperty('--ui-font-size', `${normalizeFontSize(size)}px`)
}
