import type {
  GithubApi,
  GithubStatus,
  PullFilter,
  PullRequestDetail,
  PullRequestSummary,
  PullStateFilter
} from '../../../shared/protocol'
import { DEMO_PULLS, DEMO_REPO, DEMO_VIEWER, demoDetail, demoDiff } from './demo'

// Read layer for the source-control window.
//
// `gh` answers when it can. When it cannot — not installed, not logged in, no
// GitHub remote, or a run without the preload bridge at all (the renderer
// preview harness) — the bundled fixtures answer instead and every payload
// carries `demo: true` so the window can say so out loud. Nothing here fails
// silently: `reason` always holds the sentence the banner shows.

export interface Probe {
  status: GithubStatus
  demo: boolean
  reason: string | null
}

export interface Loaded<T> {
  data: T
  demo: boolean
  reason: string | null
}

/** The preload bridge, or undefined where the renderer runs without Electron. */
function bridge(): GithubApi | undefined {
  return typeof window === 'undefined' ? undefined : window.myagent?.github
}

function demoProbe(reason: string, status?: Partial<GithubStatus>): Probe {
  return {
    demo: true,
    reason,
    status: {
      available: false,
      authenticated: false,
      user: DEMO_VIEWER,
      repo: DEMO_REPO,
      error: reason,
      ...status
    }
  }
}

/**
 * Ask gh whether it can serve this project. Anything short of "installed, logged
 * in, and pointed at a GitHub remote" flips the window to demo data rather than
 * showing an error page — a git window that cannot show a PR list is worth
 * nothing, and the banner keeps it honest.
 */
export async function probe(cwd: string): Promise<Probe> {
  const api = bridge()
  if (!api) return demoProbe('The GitHub CLI bridge is unavailable here, so this window is showing demo data.')
  try {
    const res = await api.status(cwd)
    if (!res.ok) return demoProbe(res.error.message)
    const status = res.result
    const usable = status.available && status.authenticated && !!status.repo
    return usable
      ? { status, demo: false, reason: null }
      : demoProbe(status.error ?? 'GitHub is unavailable for this project.', status)
  } catch (err) {
    return demoProbe(err instanceof Error ? err.message : String(err))
  }
}

/** Demo buckets are filtered locally so every tab and state has something to show. */
function demoPulls(filter: PullFilter, state: PullStateFilter): PullRequestSummary[] {
  const bucket =
    filter === 'authored'
      ? DEMO_PULLS.filter((pull) => pull.author === DEMO_VIEWER)
      : filter === 'reviewing'
        ? DEMO_PULLS.filter((pull) => pull.reviewRequested)
        : DEMO_PULLS
  if (state === 'all') return bucket
  const wanted = state.toUpperCase()
  return bucket.filter((pull) => pull.state === wanted)
}

export async function listPulls(
  cwd: string,
  filter: PullFilter,
  state: PullStateFilter,
  probeResult: Probe
): Promise<Loaded<PullRequestSummary[]>> {
  const api = bridge()
  if (probeResult.demo || !api) {
    return { data: demoPulls(filter, state), demo: true, reason: probeResult.reason }
  }
  const res = await api.pulls(cwd, filter, state)
  if (!res.ok) {
    return { data: demoPulls(filter, state), demo: true, reason: res.error.message }
  }
  return { data: res.result, demo: false, reason: null }
}

export async function loadPull(cwd: string, number: number, probeResult: Probe): Promise<Loaded<PullRequestDetail | null>> {
  const api = bridge()
  if (probeResult.demo || !api) {
    return { data: demoDetail(number), demo: true, reason: probeResult.reason }
  }
  const res = await api.pull(cwd, number)
  if (res.ok) return { data: res.result, demo: false, reason: null }
  // A real gh that fails on one PR (rate limit, deleted branch) still gets the
  // fixture only if we have one; otherwise the screen shows the error.
  const fallback = demoDetail(number)
  return { data: fallback, demo: fallback !== null, reason: res.error.message }
}

export async function loadPullDiff(cwd: string, number: number, probeResult: Probe): Promise<Loaded<string | null>> {
  const api = bridge()
  if (probeResult.demo || !api) {
    return { data: demoDiff(number), demo: true, reason: null }
  }
  const res = await api.diff(cwd, number)
  if (res.ok) return { data: res.result, demo: false, reason: null }
  return { data: demoDiff(number), demo: true, reason: res.error.message }
}

/** Commenting needs a real gh; the composer explains instead of failing. */
export async function postComment(cwd: string, number: number, body: string): Promise<void> {
  const api = bridge()
  if (!api) throw new Error('The GitHub CLI bridge is unavailable here.')
  const res = await api.comment(cwd, number, body)
  if (!res.ok) throw new Error(res.error.message)
}
