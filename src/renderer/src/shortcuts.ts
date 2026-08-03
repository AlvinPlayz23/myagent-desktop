// Global keyboard shortcuts for Myagent Desktop.
//
// Two concerns live here:
//   1. A declarative registry of shortcuts (id, combo, description, category)
//      used both to match keydown events and to render the read-only
//      "Keyboard shortcuts" settings page.
//   2. Ref singletons the Composer publishes focus / open-model-picker
//      callbacks into, so the app-level key handler can drive the composer
//      without prop-drilling an imperative handle.

export type ShortcutId =
  | 'newTask'
  | 'toggleSidebar'
  | 'openSettings'
  | 'focusComposer'
  | 'stop'
  | 'compact'
  | 'modelPicker'
  | 'toggleDebug'
  | 'commands'
  // Composer-local shortcuts below are documented here but handled inside
  // Composer; the global listener ignores them.
  | 'send'
  | 'newline'
  | 'queueFollowUp'

export interface Shortcut {
  id: ShortcutId
  description: string
  /** Lowercase combo string: modifiers joined with '+', then the key. */
  combo: string
  category: string
  /** Resolved by the app-level keydown listener. False = display only. */
  global: boolean
}

const isMac = /Mac|iPhone|iPad|iPod/i.test(
  (typeof navigator !== 'undefined' && navigator.platform) || ''
)

export const isMacPlatform = isMac

// "mod" resolves to Cmd on macOS and Ctrl everywhere else. Matching accepts
// either metaKey or ctrlKey so the same combo works under both hosts.
export const shortcuts: Shortcut[] = [
  { id: 'newTask', description: 'Start a new task', combo: 'mod+n', category: 'Navigation', global: true },
  { id: 'toggleSidebar', description: 'Toggle the sidebar', combo: 'mod+b', category: 'Navigation', global: true },
  { id: 'focusComposer', description: 'Focus the composer', combo: 'mod+l', category: 'Navigation', global: true },
  { id: 'openSettings', description: 'Open settings', combo: 'mod+,', category: 'Navigation', global: true },
  { id: 'stop', description: 'Stop the active run', combo: 'mod+.', category: 'Agent', global: true },
  { id: 'compact', description: 'Compact context', combo: 'mod+shift+c', category: 'Agent', global: true },
  { id: 'modelPicker', description: 'Open the model picker', combo: 'mod+m', category: 'Agent', global: true },
  { id: 'toggleDebug', description: 'Toggle the LLM debug panel', combo: 'mod+j', category: 'Panels', global: true },
  { id: 'commands', description: 'Open the commands reference', combo: 'mod+/', category: 'Panels', global: true },
  { id: 'send', description: 'Send the message', combo: 'enter', category: 'Composer', global: false },
  { id: 'newline', description: 'Insert a new line', combo: 'shift+enter', category: 'Composer', global: false },
  { id: 'queueFollowUp', description: 'Queue a follow-up while the agent is busy', combo: 'mod+enter', category: 'Composer', global: false }
]

/** Ordered category list for grouping in the settings page. */
export const shortcutCategories: string[] = ['Navigation', 'Agent', 'Panels', 'Composer']

/** Normalize a KeyboardEvent into the same combo vocabulary used above. */
function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('mod')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

/** Return the global shortcut id matching an event, or null. */
export function matchShortcut(e: KeyboardEvent): ShortcutId | null {
  const combo = eventCombo(e)
  const hit = shortcuts.find((s) => s.global && s.combo === combo)
  return hit ? hit.id : null
}

/** Human-readable, platform-aware label for a combo string. */
export function formatCombo(combo: string): string {
  const modLabel = isMac ? '⌘' : 'Ctrl'
  const shiftLabel = isMac ? '⇧' : 'Shift'
  const altLabel = isMac ? '⌥' : 'Alt'
  const sep = isMac ? '' : '+'
  return combo
    .split('+')
    .map((token) => {
      switch (token) {
        case 'mod':
          return modLabel
        case 'shift':
          return shiftLabel
        case 'alt':
          return altLabel
        default:
          // Single chars (letters, ",", "/", ".") are uppercased for display;
          // named keys like "enter" get a capitalized first letter.
          return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1)
      }
    })
    .join(sep)
}

// Imperative hooks the Composer registers into so the app-level listener can
// drive it without prop drilling. Only the mounted Composer publishes; the
// other stays null. Plain objects (not useRef) so they're importable anywhere.
export const composerFocus: { current: (() => void) | null } = { current: null }
export const composerModelPicker: { current: (() => void) | null } = { current: null }
