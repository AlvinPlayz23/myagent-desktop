// Most-recently-picked models, so the picker can put the two or three you
// actually use above the full provider tree instead of making you walk it
// every time.
//
// Stored as fully-qualified "provider/model" refs — the same string shape the
// composer already passes to onModel and compares against `model` — so a ref
// stays meaningful even if the provider is later removed. Entries pointing at
// providers that no longer exist are filtered at render time rather than here,
// so re-adding a provider restores its history.

const KEY = 'myagent.desktop.recent-models'
const MAX = 3

export function loadRecentModels(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    // Defensive: localStorage is user-writable and survives across versions.
    return value.filter((entry): entry is string => typeof entry === 'string').slice(0, MAX)
  } catch {
    return []
  }
}

/** Move `ref` to the front, de-duplicated, and persist. Returns the new list. */
export function rememberModel(ref: string, current = loadRecentModels()): string[] {
  if (!ref.includes('/')) return current
  const next = [ref, ...current.filter((entry) => entry !== ref)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota or private-mode failures must not block picking a model.
  }
  return next
}
