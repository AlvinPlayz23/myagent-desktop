import { execFile } from 'child_process'
import type {
  GitBranch,
  GitCommit,
  GitFileChange,
  GitFileStatus,
  GitStatus
} from '../shared/protocol'

const MAX_BUFFER = 16 * 1024 * 1024

export interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

/**
 * Invoke git with an explicit `-C <cwd>` and an argv array — never a shell
 * string, so paths and branch names coming from the renderer can't inject
 * commands. A non-zero exit is returned rather than thrown; callers decide
 * which failures matter (`git diff` exits 1 merely to signal "has changes").
 */
export function run(cwd: string, args: string[]): Promise<GitRunResult> {
  return new Promise((resolvePromise) => {
    execFile(
      'git',
      ['-C', cwd, '--no-optional-locks', ...args],
      // LC_ALL pins git's messages to English: status() matches on stderr text
      // to tell "not a repository" apart from a real failure, and a localized
      // git would otherwise break that check.
      {
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C' }
      },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === 'number'
          ? ((err as { code: number }).code)
          : err
            ? 1
            : 0
        resolvePromise({ code, stdout: stdout ?? '', stderr: stderr ?? '' })
      }
    )
  })
}

async function ok(cwd: string, args: string[]): Promise<GitRunResult> {
  const res = await run(cwd, args)
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || res.stdout.trim() || `git ${args[0]} failed`)
  }
  return res
}

/** Map a porcelain v2 XY pair to the single status we surface per file. */
function classify(xy: string, untracked: boolean): GitFileStatus {
  if (untracked) return 'untracked'
  const [x, y] = [xy[0] ?? ' ', xy[1] ?? ' ']
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return 'conflicted'
  }
  if (x === 'R' || y === 'R') return 'renamed'
  if (x === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  return 'modified'
}

/** Index differs from HEAD (first porcelain v2 status char). */
function isStaged(xy: string): boolean {
  const x = xy[0] ?? ' '
  return x !== '.' && x !== ' '
}

/** Staged, but with further unstaged edits on top — porcelain XY like `MM`. */
function isPartial(xy: string): boolean {
  const y = xy[1] ?? ' '
  return isStaged(xy) && y !== '.' && y !== ' '
}

function parseAheadBehind(value: string): { ahead: number; behind: number } {
  const m = value.match(/^\+(\d+)\s+-(\d+)$/)
  if (!m) return { ahead: 0, behind: 0 }
  return { ahead: Number(m[1] ?? 0), behind: Number(m[2] ?? 0) }
}

/** `git diff --numstat -z` → per-path line counts. Binary files report as 0/0. */
function parseNumstat(stdout: string): Map<string, { insertions: number; deletions: number }> {
  const out = new Map<string, { insertions: number; deletions: number }>()
  const records = stdout.split('\0')
  for (let i = 0; i < records.length; i++) {
    const record = records[i] ?? ''
    if (!record) continue
    const firstTab = record.indexOf('\t')
    const secondTab = firstTab < 0 ? -1 : record.indexOf('\t', firstTab + 1)
    if (firstTab < 0 || secondTab < 0) continue
    let path = record.slice(secondTab + 1)
    // Renames emit an empty path here, followed by two extra NUL records.
    if (!path) {
      i += 2
      path = records[i] ?? ''
    }
    if (!path) continue
    const insertions = Number.parseInt(record.slice(0, firstTab), 10)
    const deletions = Number.parseInt(record.slice(firstTab + 1, secondTab), 10)
    out.set(path, {
      insertions: Number.isFinite(insertions) ? insertions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0
    })
  }
  return out
}

/**
 * Full working-tree status in three calls: porcelain v2 for the file list and
 * branch context, plus staged/unstaged numstat for line counts. Files appear
 * once, with `staged` reflecting whether the index copy differs from HEAD.
 */
export async function status(cwd: string): Promise<GitStatus> {
  // `git status` already fails with exit 128 outside a work tree, so it doubles
  // as the repo probe. A separate `rev-parse` here would mean one extra process
  // spawn on every poll -- on Windows each spawn also flashes a conhost.exe.
  const porcelain = await run(cwd, [
    'status',
    '--porcelain=v2',
    '--branch',
    '-z',
    '--untracked-files=all'
  ])
  // Exit 128 covers every fatal, not just a missing repo: a held index.lock,
  // dubious-ownership, or a permission error land here too. Only the genuine
  // "not a repository" case may report isRepo:false, since that drives an
  // "Initialize repository" button -- offering that inside a real repo whose
  // lock was briefly contended would be destructive. Everything else throws
  // and surfaces as an error banner, leaving the last known status on screen.
  if (porcelain.code !== 0) {
    if (!/not a git repository/i.test(porcelain.stderr)) {
      throw new Error(porcelain.stderr.trim() || porcelain.stdout.trim() || 'git status failed')
    }
    return {
      isRepo: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      insertions: 0,
      deletions: 0
    }
  }

  const records = porcelain.stdout.split('\0')

  // Line counts need two more `git diff` calls, but only tracked entries (the
  // 1/2/u record types) can report any -- a clean tree, or one holding nothing
  // but untracked files, skips them and costs a single process per refresh.
  const hasTracked = records.some((record) => /^[12u] /.test(record))
  const [unstaged, staged] = hasTracked
    ? await Promise.all([
        run(cwd, ['diff', '--numstat', '-z']),
        run(cwd, ['diff', '--numstat', '-z', '--cached'])
      ])
    : [null, null]

  const unstagedStats = parseNumstat(unstaged?.stdout ?? '')
  const stagedStats = parseNumstat(staged?.stdout ?? '')

  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const files: GitFileChange[] = []

  for (let i = 0; i < records.length; i++) {
    const line = records[i] ?? ''
    if (!line) continue

    if (line.startsWith('# branch.head ')) {
      const value = line.slice('# branch.head '.length).trim()
      branch = value === '(detached)' ? null : value
      continue
    }
    if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim() || null
      continue
    }
    if (line.startsWith('# branch.ab ')) {
      const parsed = parseAheadBehind(line.slice('# branch.ab '.length).trim())
      ahead = parsed.ahead
      behind = parsed.behind
      continue
    }
    if (line.startsWith('#')) continue

    // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
    if (line.startsWith('1 ')) {
      const parts = line.split(' ')
      const xy = parts[1] ?? '  '
      const path = parts.slice(8).join(' ')
      if (!path) continue
      files.push({
        path,
        status: classify(xy, false),
        staged: isStaged(xy),
        partial: isPartial(xy),
        insertions: (unstagedStats.get(path)?.insertions ?? 0) + (stagedStats.get(path)?.insertions ?? 0),
        deletions: (unstagedStats.get(path)?.deletions ?? 0) + (stagedStats.get(path)?.deletions ?? 0)
      })
      continue
    }

    // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\0<origPath>
    if (line.startsWith('2 ')) {
      const parts = line.split(' ')
      const xy = parts[1] ?? '  '
      const path = parts.slice(9).join(' ')
      const origPath = records[++i] ?? ''
      if (!path) continue
      files.push({
        path,
        origPath: origPath || undefined,
        status: classify(xy, false),
        staged: isStaged(xy),
        partial: isPartial(xy),
        insertions: (unstagedStats.get(path)?.insertions ?? 0) + (stagedStats.get(path)?.insertions ?? 0),
        deletions: (unstagedStats.get(path)?.deletions ?? 0) + (stagedStats.get(path)?.deletions ?? 0)
      })
      continue
    }

    // u <XY> ... <path>  (unmerged)
    if (line.startsWith('u ')) {
      const parts = line.split(' ')
      const path = parts.slice(10).join(' ')
      if (!path) continue
      files.push({ path, status: 'conflicted', staged: false, insertions: 0, deletions: 0 })
      continue
    }

    // ? <path>  (untracked)
    if (line.startsWith('? ')) {
      const path = line.slice(2)
      if (!path) continue
      files.push({ path, status: 'untracked', staged: false, insertions: 0, deletions: 0 })
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path))

  return {
    isRepo: true,
    branch,
    upstream,
    ahead,
    behind,
    files,
    insertions: files.reduce((sum, f) => sum + f.insertions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0)
  }
}

/** Unified patch for one path, or the whole tree when `path` is omitted. */
export async function diff(cwd: string, path?: string, staged = false): Promise<string> {
  const args = ['diff', '--no-color']
  if (staged) args.push('--cached')
  if (path) args.push('--', path)
  const res = await run(cwd, args)
  if (res.stdout.trim()) return res.stdout

  // Untracked files have no diff against the index; synthesize one so the
  // viewer still shows their contents as additions.
  if (path && !staged) {
    const tracked = await run(cwd, ['ls-files', '--error-unmatch', '--', path])
    if (tracked.code !== 0) {
      const intent = await run(cwd, ['diff', '--no-color', '--no-index', '/dev/null', path])
      if (intent.stdout.trim()) return intent.stdout
    }
  }
  return res.stdout
}

export async function branches(cwd: string): Promise<GitBranch[]> {
  const res = await ok(cwd, [
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)%09%(upstream:short)%09%(HEAD)%09%(committerdate:iso8601)',
    'refs/heads'
  ])
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, upstream, head, date] = line.split('\t')
      return {
        name: name ?? '',
        upstream: upstream || null,
        current: head === '*',
        modified: date ?? ''
      }
    })
    .filter((b) => b.name)
}

export async function log(cwd: string, limit = 30): Promise<GitCommit[]> {
  const res = await run(cwd, [
    'log',
    `--max-count=${limit}`,
    '--format=%H%x09%h%x09%an%x09%aI%x09%s'
  ])
  if (res.code !== 0) return []
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, short, author, date, subject] = line.split('\t')
      return {
        hash: hash ?? '',
        shortHash: short ?? '',
        author: author ?? '',
        date: date ?? '',
        subject: subject ?? ''
      }
    })
}

export async function stage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) await ok(cwd, ['add', '--all'])
  else await ok(cwd, ['add', '--', ...paths])
}

export async function unstage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) await ok(cwd, ['reset'])
  else await ok(cwd, ['reset', '--', ...paths])
}

/**
 * Throw away working-tree changes. Tracked paths are checked out from the
 * index; untracked ones have to be removed instead, since there is no version
 * to restore. Destructive and irreversible — the renderer confirms first.
 */
export async function discard(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    await ok(cwd, ['checkout', '--', '.'])
    await ok(cwd, ['clean', '-fd'])
    return
  }
  for (const path of paths) {
    const tracked = await run(cwd, ['ls-files', '--error-unmatch', '--', path])
    if (tracked.code === 0) await ok(cwd, ['checkout', 'HEAD', '--', path])
    else await ok(cwd, ['clean', '-fd', '--', path])
  }
}

export async function commit(cwd: string, message: string, amend = false): Promise<string> {
  const text = message.trim()
  if (!text && !amend) throw new Error('Commit message is required.')
  const args = ['commit', '-m', text]
  if (amend) args.push('--amend')
  const res = await ok(cwd, args)
  return res.stdout.trim()
}

/** Push the current branch, setting upstream on first publish. */
export async function push(cwd: string): Promise<string> {
  const head = await ok(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = head.stdout.trim()
  if (!branch || branch === 'HEAD') throw new Error('Detached HEAD: checkout a branch before pushing.')
  const upstream = await run(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  const args = upstream.code === 0 ? ['push'] : ['push', '--set-upstream', 'origin', branch]
  const res = await ok(cwd, args)
  return (res.stderr || res.stdout).trim()
}

export async function pull(cwd: string): Promise<string> {
  const res = await ok(cwd, ['pull', '--ff-only'])
  return (res.stdout || res.stderr).trim()
}

export async function fetch(cwd: string): Promise<string> {
  const res = await ok(cwd, ['fetch', '--all', '--prune'])
  return (res.stderr || res.stdout).trim()
}

export async function checkout(cwd: string, branch: string): Promise<void> {
  await ok(cwd, ['checkout', branch])
}

export async function createBranch(cwd: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('Branch name is required.')
  await ok(cwd, ['checkout', '-b', clean])
}

export async function init(cwd: string): Promise<void> {
  await ok(cwd, ['init'])
}
