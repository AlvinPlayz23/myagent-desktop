import { execFile } from 'child_process'
import type {
  ChecksStatus,
  GithubStatus,
  PullFilter,
  PullStateFilter,
  PullLabel,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  PullRequestFileChange,
  PullRequestSummary,
  PullState,
  ReviewDecision
} from '../shared/protocol'

// GitHub access goes through the `gh` CLI rather than a stored token: gh owns
// the login, the host selection and the credential refresh, so this app never
// holds a secret and a user who already works in a terminal works here too.
// Every call runs with `cwd` set to the project, so gh picks the repository
// from its own remote — the same project the session is running in.
//
// Nothing here falls back to demo data on failure: a missing gh, a logged-out
// gh and a repository without a GitHub remote are three different situations
// the UI explains, so errors are returned as errors and the renderer decides.

const MAX_BUFFER = 32 * 1024 * 1024
const LIST_LIMIT = 60

/** `gh pr list`/`pr view` fields, kept to ones every supported gh accepts. */
const LIST_FIELDS = [
  'number',
  'title',
  'author',
  'headRefName',
  'baseRefName',
  'headRefOid',
  'isDraft',
  'state',
  'additions',
  'deletions',
  'changedFiles',
  'createdAt',
  'updatedAt',
  'url',
  'labels',
  'reviewDecision',
  'reviewRequests',
  'mergeable',
  'mergeStateStatus',
  'statusCheckRollup',
  'comments'
].join(',')

const VIEW_FIELDS = `${LIST_FIELDS},body,commits,files,headRepository`

/**
 * Invoke gh with an argv array and no shell, so branch names and PR bodies
 * coming from the renderer cannot inject commands. Non-zero exits are returned
 * rather than thrown; each caller decides which failures are worth surfacing.
 * `input` is written to stdin, which is how `gh pr comment --body-file -`
 * receives a comment without it ever appearing in the process table.
 */
function run(
  cwd: string,
  args: string[],
  input?: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = execFile(
      'gh',
      args,
      {
        cwd,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        encoding: 'utf8',
        env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' }
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0
        resolvePromise({ code, stdout: stdout ?? '', stderr: stderr ?? '' })
      }
    )
    if (input !== undefined) {
      child.stdin?.end(input)
    } else {
      child.stdin?.end()
    }
  })
}

/** Run gh and reject with its stderr, which is already a readable sentence. */
async function ok(cwd: string, args: string[], input?: string): Promise<string> {
  const res = await run(cwd, args, input)
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || res.stdout.trim() || `gh ${args[0]} failed`)
  }
  return res.stdout
}

async function json<T>(cwd: string, args: string[]): Promise<T> {
  const stdout = await ok(cwd, args)
  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new Error('Unexpected response from gh — is it up to date?')
  }
}

// ---------------------------------------------------------------------------
// Raw gh payloads (only the fields the queries above ask for)
// ---------------------------------------------------------------------------

interface RawActor {
  login?: string
  name?: string | null
}

interface RawCheck {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string | null
  state?: string
}

interface RawComment {
  id?: string
  body?: string
  createdAt?: string
  author?: RawActor
  authorAssociation?: string
  state?: string
}

interface RawReview {
  id?: string
  body?: string
  submittedAt?: string
  author?: RawActor
  state?: string
}

interface RawCommit {
  oid?: string
  messageHeadline?: string
  messageBody?: string
  committedDate?: string
  authors?: RawActor[]
}

interface RawFile {
  path?: string
  previousFilename?: string | null
  additions?: number
  deletions?: number
}

interface RawLabel {
  name?: string
  color?: string
}

interface RawPull {
  number?: number
  title?: string
  body?: string
  url?: string
  author?: RawActor
  headRefName?: string
  baseRefName?: string
  headRefOid?: string
  isDraft?: boolean
  state?: string
  additions?: number
  deletions?: number
  changedFiles?: number
  createdAt?: string
  updatedAt?: string
  reviewDecision?: string
  reviewRequests?: (RawActor | { name?: string })[]
  mergeable?: string
  mergeStateStatus?: string
  statusCheckRollup?: RawCheck[] | null
  comments?: RawComment[]
  commits?: RawCommit[]
  files?: RawFile[]
  labels?: RawLabel[]
  headRepository?: { nameWithOwner?: string } | null
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

/**
 * Fold the check runs and commit statuses GitHub reports into the one state a
 * list row can show. Failure outranks pending on purpose: a PR whose CI has
 * already failed is the one that needs attention, even while a retry runs.
 */
function rollUpChecks(checks: RawCheck[] | null | undefined): ChecksStatus {
  if (!checks || checks.length === 0) return 'none'
  let failing = false
  let pending = false
  let passed = false
  let skipped = false
  for (const check of checks) {
    // StatusContext uses `state`; CheckRun uses `status` + `conclusion`.
    const state = (check.state ?? '').toUpperCase()
    const status = (check.status ?? '').toUpperCase()
    const conclusion = (check.conclusion ?? '').toUpperCase()
    if (!check.__typename && state) {
      if (state === 'FAILURE' || state === 'ERROR') failing = true
      else if (state === 'PENDING' || state === 'EXPECTED') pending = true
      else passed = true
      continue
    }
    if (status && status !== 'COMPLETED' && status !== 'SKIPPED') {
      pending = true
      continue
    }
    if (conclusion === 'SUCCESS') passed = true
    else if (conclusion === 'NEUTRAL' || conclusion === 'SKIPPED' || conclusion === 'CANCELLED') skipped = true
    else if (conclusion) failing = true
    else pending = true
  }
  if (failing) return 'failing'
  if (pending) return 'pending'
  if (passed) return 'passing'
  if (skipped) return 'skipped'
  return 'none'
}

function normalizeDecision(value: string | undefined): ReviewDecision {
  const upper = (value ?? '').toUpperCase()
  if (upper === 'APPROVED' || upper === 'CHANGES_REQUESTED' || upper === 'REVIEW_REQUIRED') return upper
  return ''
}

function normalizeLabels(labels: RawLabel[] | undefined): PullLabel[] {
  return (labels ?? [])
    .filter((label): label is RawLabel & { name: string } => !!label?.name)
    .map((label) => ({ name: label.name, color: label.color ?? '' }))
}

function conflictsOf(pull: RawPull): boolean {
  return pull.mergeable === 'CONFLICTING' || pull.mergeStateStatus === 'DIRTY'
}

/** Whether the viewer is one of the people this PR is waiting on. */
function requestedFromViewer(pull: RawPull, viewer: string | null): boolean {
  if (!viewer) return false
  return (pull.reviewRequests ?? []).some(
    (entry) => 'login' in entry && (entry as RawActor).login === viewer
  )
}

function toSummary(pull: RawPull, viewer: string | null): PullRequestSummary {
  const sha = pull.headRefOid ?? ''
  return {
    number: pull.number ?? 0,
    title: pull.title ?? '',
    url: pull.url ?? '',
    author: pull.author?.login ?? 'ghost',
    headRefName: pull.headRefName ?? '',
    baseRefName: pull.baseRefName ?? '',
    isDraft: !!pull.isDraft,
    state: (pull.state as PullState | undefined) ?? 'OPEN',
    additions: pull.additions ?? 0,
    deletions: pull.deletions ?? 0,
    changedFiles: pull.changedFiles ?? 0,
    createdAt: pull.createdAt ?? '',
    updatedAt: pull.updatedAt ?? '',
    commentCount: pull.comments?.length ?? 0,
    reviewDecision: normalizeDecision(pull.reviewDecision),
    reviewRequested: requestedFromViewer(pull, viewer),
    checks: rollUpChecks(pull.statusCheckRollup),
    checksDetail: sha ? sha.slice(0, 7) : undefined,
    conflicts: conflictsOf(pull),
    labels: normalizeLabels(pull.labels)
  }
}

function toDetail(pull: RawPull, viewer: string | null): PullRequestDetail {
  const comments: PullRequestComment[] = (pull.comments ?? []).map((comment, index) => ({
    id: comment.id ?? `comment-${index}`,
    kind: 'comment' as const,
    author: comment.author?.login ?? 'ghost',
    body: comment.body ?? '',
    createdAt: comment.createdAt ?? ''
  }))
  const commits: PullRequestCommit[] = (pull.commits ?? []).map((commit) => {
    const oid = commit.oid ?? ''
    return {
      oid,
      shortOid: oid.slice(0, 7),
      messageHeadline: commit.messageHeadline ?? '',
      messageBody: commit.messageBody ?? '',
      author: commit.authors?.[0]?.login ?? commit.authors?.[0]?.name ?? 'unknown',
      date: commit.committedDate ?? ''
    }
  })
  const files: PullRequestFileChange[] = (pull.files ?? [])
    .filter((file): file is RawFile & { path: string } => !!file?.path)
    .map((file) => ({
      path: file.path,
      oldPath: file.previousFilename ?? undefined,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0
    }))

  return {
    ...toSummary(pull, viewer),
    body: pull.body ?? '',
    headRepo: pull.headRepository?.nameWithOwner ?? null,
    baseRepo: null,
    additions: pull.additions ?? 0,
    deletions: pull.deletions ?? 0,
    changedFiles: pull.changedFiles ?? files.length,
    commits,
    files,
    comments
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The authenticated login, cached per repository. `status()` fills it during
 * the probe the window runs anyway, so listing PRs costs no extra subprocess;
 * a list fetched before that probe has to ask gh directly.
 */
const viewerCache = new Map<string, string | null>()

async function viewerOf(cwd: string): Promise<string | null> {
  if (viewerCache.has(cwd)) return viewerCache.get(cwd) ?? null
  const login = await run(cwd, ['api', 'user', '--jq', '.login'])
  const user = login.code === 0 ? login.stdout.trim() || null : null
  viewerCache.set(cwd, user)
  return user
}

/**
 * Probe gh once per repository: installed, logged in, and pointing at a GitHub
 * remote. Each answer is a separate field because the UI says something
 * different for each — "install gh" reads nothing like "no GitHub remote".
 */
export async function status(cwd: string): Promise<GithubStatus> {
  const version = await run(cwd, ['--version'])
  if (version.code !== 0) {
    return { available: false, authenticated: false, user: null, repo: null, error: 'GitHub CLI (gh) not found on PATH.' }
  }

  const auth = await run(cwd, ['auth', 'status'])
  if (auth.code !== 0) {
    const detail = (auth.stderr || auth.stdout).trim().split('\n').pop()?.trim()
    return {
      available: true,
      authenticated: false,
      user: null,
      repo: null,
      error: detail || 'Not logged in to GitHub. Run `gh auth login`.'
    }
  }

  const user = await viewerOf(cwd)

  const repo = await run(cwd, ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
  const name = repo.code === 0 ? repo.stdout.trim() : ''
  if (!name) {
    return {
      available: true,
      authenticated: true,
      user,
      repo: null,
      error: 'This project has no GitHub remote.'
    }
  }

  return { available: true, authenticated: true, user, repo: name, error: null }
}

/**
 * The three list buckets. `authored` and `reviewing` are server-side searches
 * so a page of results is never a thin slice of someone else's fifty.
 */
export async function pulls(
  cwd: string,
  filter: PullFilter,
  state: PullStateFilter
): Promise<PullRequestSummary[]> {
  const args = ['pr', 'list', '--state', state, '--limit', String(LIST_LIMIT), '--json', LIST_FIELDS]
  if (filter === 'authored') args.push('--author', '@me')
  else if (filter === 'reviewing') args.push('--search', 'review-requested:@me')
  else args.push('--search', 'sort:updated-desc')

  const [list, viewer] = await Promise.all([json<RawPull[]>(cwd, args), viewerOf(cwd)])
  return list.map((entry) => toSummary(entry, viewer))
}

export async function pull(cwd: string, number: number): Promise<PullRequestDetail> {
  const [data, viewer] = await Promise.all([
    json<RawPull>(cwd, ['pr', 'view', String(number), '--json', VIEW_FIELDS]),
    viewerOf(cwd)
  ])
  return toDetail(data, viewer)
}

/** Unified patch for the whole PR; the renderer splits it per file. */
export async function diff(cwd: string, number: number): Promise<string> {
  // A PR that touches only binary files has no textual diff, and gh exits 1
  // for an empty patch on some versions. An empty result is not an error.
  const res = await run(cwd, ['pr', 'diff', String(number)])
  if (res.code !== 0 && !res.stdout.trim()) {
    throw new Error(res.stderr.trim() || `Could not load the diff for #${number}.`)
  }
  return res.stdout
}

export async function comment(cwd: string, number: number, body: string): Promise<void> {
  const text = body.trim()
  if (!text) throw new Error('Comment body is required.')
  await ok(cwd, ['pr', 'comment', String(number), '--body-file', '-'], text)
}
