import fs from 'fs'
import { homedir } from 'os'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import { shell } from 'electron'
import type {
  DirListing,
  WorkspaceDirEntry,
  WorkspaceFile,
  WorkspaceFileContent,
  WorkspacePlaces
} from '../shared/protocol'

// The @ picker only needs enough of the tree to feel instant while typing, so
// the walk is bounded and the result is cached for a few seconds: a burst of
// keystrokes then costs one readdir pass over the project, not one per key.
const MAX_ENTRIES = 20000
const CACHE_TTL_MS = 5000
const LIMIT = 40
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

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

function projectRoot(cwd: unknown): string {
  if (typeof cwd !== 'string' || cwd.length === 0) throw new Error('No project folder')
  return resolve(cwd)
}

function escapesRoot(rel: string): boolean {
  return rel !== '' && (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
}

/** Resolve a project-relative (or absolute) path, refusing to leave the root. */
function resolveInside(cwd: string, requested: string): string {
  const root = projectRoot(cwd)
  if (typeof requested !== 'string' || requested.length === 0) throw new Error('No file path')
  const target = isAbsolute(requested) ? resolve(requested) : resolve(root, requested)
  if (escapesRoot(relative(root, target))) throw new Error('Path is outside the project')
  return target
}

/** The lexical check above, plus symlink resolution for read/list/reveal. */
async function resolveRealInside(cwd: string, requested: string): Promise<string> {
  const root = projectRoot(cwd)
  const target = resolveInside(root, requested)
  const realRoot = await fs.promises.realpath(root).catch(() => root)
  const realTarget = await fs.promises.realpath(target).catch(() => target)
  if (escapesRoot(relative(realRoot, realTarget))) throw new Error('Path is outside the project')
  return target
}

function toPosix(value: string): string {
  return value.split(sep).join('/')
}

/** One lazy directory level for the file panel's tree. */
export async function listDir(cwd: unknown, requested?: unknown): Promise<WorkspaceDirEntry[]> {
  const root = projectRoot(cwd)
  const rel = typeof requested === 'string' ? requested : ''
  const target = await resolveRealInside(root, rel || '.')
  const stat = await fs.promises.stat(target)
  if (!stat.isDirectory()) throw new Error('Not a folder')
  const entries = await fs.promises.readdir(target, { withFileTypes: true })
  return entries
    .filter((entry) => !IGNORED.has(entry.name))
    .map((entry) => ({
      path: toPosix(rel ? join(rel, entry.name) : entry.name),
      name: entry.name,
      kind: entry.isDirectory() ? ('dir' as const) : ('file' as const)
    }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

/** Text, image data URL, or a reason the panel cannot preview the file. */
export async function readFileContent(cwd: unknown, requested: unknown): Promise<WorkspaceFileContent> {
  const root = projectRoot(cwd)
  if (typeof requested !== 'string' || requested.length === 0) throw new Error('No file path')
  const target = await resolveRealInside(root, requested)
  const stat = await fs.promises.stat(target)
  if (!stat.isFile()) throw new Error('Not a file')
  const mimeType = IMAGE_MIME[extname(target).toLowerCase()]
  if (mimeType) {
    if (stat.size > MAX_IMAGE_BYTES) return { kind: 'too-large', size: stat.size }
    const buffer = await fs.promises.readFile(target)
    return {
      kind: 'image',
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mimeType,
      size: stat.size
    }
  }
  if (stat.size > MAX_TEXT_BYTES) return { kind: 'too-large', size: stat.size }
  const buffer = await fs.promises.readFile(target)
  if (buffer.subarray(0, 8192).includes(0)) return { kind: 'binary', size: stat.size }
  return { kind: 'text', content: buffer.toString('utf8'), size: stat.size }
}

/** Select the file in the OS file manager. */
export async function revealFile(cwd: unknown, requested: unknown): Promise<void> {
  const root = projectRoot(cwd)
  if (typeof requested !== 'string' || requested.length === 0) throw new Error('No file path')
  const target = await resolveRealInside(root, requested)
  await fs.promises.stat(target)
  shell.showItemInFolder(target)
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

/** Starting points for the in-app folder picker: home, plus every drive root. */
export async function places(): Promise<WorkspacePlaces> {
  const roots: string[] = []
  if (process.platform === 'win32') {
    // No Win32 API for the drive list worth the FFI; probing the 26 letters is
    // one stat each and the OS caches them.
    for (let code = 65; code <= 90; code++) {
      const drive = `${String.fromCharCode(code)}:\\`
      if (fs.existsSync(drive)) roots.push(drive)
    }
  } else {
    roots.push('/')
  }
  return { home: homedir(), roots }
}

/**
 * One level of child folders at an absolute path, for the folder picker.
 *
 * Unlike the calls above this is not confined to a project root — choosing a
 * project is exactly the act of naming a new one — so it reads only directory
 * names and never a file.
 */
export async function listDirs(requested: unknown): Promise<DirListing> {
  if (typeof requested !== 'string' || requested.length === 0) throw new Error('No folder path')
  const target = resolve(requested)
  const stat = await fs.promises.stat(target)
  if (!stat.isDirectory()) throw new Error('Not a folder')
  const entries = await fs.promises.readdir(target, { withFileTypes: true })
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ path: join(target, entry.name), name: entry.name, kind: 'dir' as const }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const parent = dirname(target)
  return { path: target, parent: parent === target ? null : parent, dirs }
}
