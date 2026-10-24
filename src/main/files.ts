import fs from 'fs'
import { join, relative, sep } from 'path'
import type { WorkspaceFile } from '../shared/protocol'

// The @ picker only needs enough of the tree to feel instant while typing, so
// the walk is bounded and the result is cached for a few seconds: a burst of
// keystrokes then costs one readdir pass over the project, not one per key.
const MAX_ENTRIES = 20000
const CACHE_TTL_MS = 5000
const LIMIT = 40

// Heavy or generated folders that would drown real source files in the list.
const IGNORED = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.venv',
  '.idea',
  '__pycache__',
  'node_modules',
  'out',
  'dist',
  'build',
  'coverage',
  'target',
  'vendor'
])

interface Cache {
  root: string
  at: number
  files: WorkspaceFile[]
}

let cache: Cache | null = null
let building: { root: string; promise: Promise<WorkspaceFile[]> } | null = null

async function walk(root: string): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = []
  const pending = [root]
  while (pending.length > 0 && files.length < MAX_ENTRIES) {
    const dir = pending.pop() as string
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (files.length >= MAX_ENTRIES) break
      if (IGNORED.has(entry.name)) continue
      const abs = join(dir, entry.name)
      // Symlinks are skipped: a link cycle would make the walk unbounded.
      if (entry.isDirectory()) pending.push(abs)
      else if (entry.isFile()) files.push({ path: relative(root, abs).split(sep).join('/'), name: entry.name })
    }
  }
  return files
}

async function list(root: string): Promise<WorkspaceFile[]> {
  if (cache && cache.root === root && Date.now() - cache.at < CACHE_TTL_MS) return cache.files
  if (building && building.root === root) return building.promise
  const promise = walk(root).then(
    (files) => {
      cache = { root, at: Date.now(), files }
      building = null
      return files
    },
    (err) => {
      building = null
      throw err
    }
  )
  building = { root, promise }
  return promise
}

/** Lower is better; null means the file does not match at all. */
function score(path: string, name: string, query: string): number | null {
  const lowerName = name.toLowerCase()
  const lowerPath = path.toLowerCase()
  if (lowerName === query) return 0
  if (lowerName.startsWith(query)) return 10 + lowerName.length - query.length
  const inName = lowerName.indexOf(query)
  if (inName >= 0) return 40 + inName
  const inPath = lowerPath.indexOf(query)
  if (inPath >= 0) return 80 + inPath
  // Subsequence over the full path, so "scmp" still finds src/components.
  let from = 0
  let gaps = 0
  for (const char of query) {
    const at = lowerPath.indexOf(char, from)
    if (at < 0) return null
    gaps += at - from
    from = at + 1
  }
  return 160 + gaps + lowerPath.length
}

export async function search(cwd: unknown, query: unknown): Promise<WorkspaceFile[]> {
  if (typeof cwd !== 'string' || cwd.length === 0) return []
  const stat = await fs.promises.stat(cwd).catch(() => null)
  if (!stat?.isDirectory()) return []
  const files = await list(cwd)
  const q = typeof query === 'string' ? query.trim().toLowerCase() : ''
  if (!q) {
    return [...files].sort((a, b) => a.path.localeCompare(b.path)).slice(0, LIMIT)
  }
  const scored: { file: WorkspaceFile; score: number }[] = []
  for (const file of files) {
    const value = score(file.path, file.name, q)
    if (value !== null) scored.push({ file, score: value })
  }
  scored.sort((a, b) => a.score - b.score || a.file.path.localeCompare(b.file.path))
  return scored.slice(0, LIMIT).map((entry) => entry.file)
}
