import type {
  PullLabel,
  PullRequestComment,
  PullRequestCommit,
  PullRequestDetail,
  PullRequestFileChange,
  PullRequestSummary,
  PullState
} from '../../../shared/protocol'

// Fixture data for the source-control window, shown whenever `gh` cannot
// answer: not installed, not logged in, or a project with no GitHub remote.
// It exists so the window is never an empty shell on a machine without gh —
// the banner above the list always says which case it is, so nothing here
// pretends to be real.

const HOUR = 3600e3
const DAY = 24 * HOUR

const ago = (ms: number): string => new Date(Date.now() - ms).toISOString()

/** The login the fixtures pretend to be, for the Authored/Reviewing buckets. */
export const DEMO_VIEWER = 'jsgrchrg'

interface Seed {
  number: number
  title: string
  author: string
  /** Defaults to OPEN; the merged and closed fixtures set it explicitly. */
  state?: PullState
  additions: number
  deletions: number
  changedFiles: number
  age: number
  checks: PullRequestSummary['checks']
  checksDetail?: string
  conflicts?: boolean
  draft?: boolean
  labels?: PullLabel[]
  reviewRequested?: boolean
  reviewDecision?: PullRequestSummary['reviewDecision']
  commentCount?: number
}

const SEEDS: Seed[] = [
  {
    number: 884,
    title: 'Providers: add any ACP agent (ACP registry + custom command)',
    author: 'wingleio',
    additions: 3400,
    deletions: 78,
    changedFiles: 41,
    age: 19 * HOUR,
    checks: 'failing',
    checksDetail: '7260369',
    labels: [{ name: 'providers', color: '0e8a16' }],
    commentCount: 4
  },
  {
    number: 878,
    title: 'Zeron MCP: async delegation with background turn-end events',
    author: 'wingleio',
    additions: 2306,
    deletions: 130,
    changedFiles: 31,
    age: 22 * HOUR,
    checks: 'failing',
    checksDetail: 'f329d66',
    labels: [{ name: 'mcp', color: '1d76db' }],
    commentCount: 2
  },
  {
    number: 822,
    title: 'Add sidebar music player',
    author: 'MasterOfFate',
    additions: 3400,
    deletions: 3,
    changedFiles: 12,
    age: 2 * DAY,
    checks: 'none',
    checksDetail: 'd0c8ca4',
    conflicts: true,
    labels: [{ name: 'ui', color: 'fbca04' }]
  },
  {
    number: 868,
    title: 'Desktop: reconnect to the engine daemon after it restarts',
    author: 'katulevskiy',
    additions: 310,
    deletions: 59,
    changedFiles: 9,
    age: 2 * DAY,
    checks: 'failing',
    checksDetail: '7a92541',
    reviewRequested: true
  },
  {
    number: 460,
    title: 'Add Arc-style hover reveal for the collapsed sidebar',
    author: 'jsgrchrg',
    additions: 915,
    deletions: 18,
    changedFiles: 7,
    age: 2 * DAY,
    checks: 'failing',
    checksDetail: '923d0c7',
    labels: [{ name: 'ui', color: 'fbca04' }]
  },
  {
    number: 865,
    title: 'PR board: provider seam + GitLab adapter',
    author: 'nomomon',
    additions: 4600,
    deletions: 624,
    changedFiles: 52,
    age: 2 * DAY,
    checks: 'none',
    checksDetail: '4a15f0d',
    conflicts: true
  },
  {
    number: 854,
    title: 'Open the terminal folder as a project with zeron',
    author: 'MasterOfFate',
    additions: 957,
    deletions: 61,
    changedFiles: 18,
    age: 3 * DAY,
    checks: 'passing',
    checksDetail: '70d8728',
    conflicts: true
  },
  {
    number: 115,
    title: 'Transcript: end-of-turn edit summary card with click-through to a turn-diff',
    author: 'SinaKhalili',
    additions: 1040,
    deletions: 17,
    changedFiles: 11,
    age: 3 * DAY,
    checks: 'skipped',
    checksDetail: '240e5fa',
    conflicts: true,
    reviewRequested: true,
    reviewDecision: 'CHANGES_REQUESTED',
    commentCount: 6
  },
  {
    number: 1000,
    title: 'Appearance: add opt-in ambient chat wallpapers',
    author: 'katulevskiy',
    additions: 480,
    deletions: 32,
    changedFiles: 14,
    age: 5 * DAY,
    checks: 'passing',
    checksDetail: 'b71ce40',
    labels: [{ name: 'design', color: 'd4c5f9' }]
  },
  {
    number: 993,
    title: 'Harness: keep the tool registry warm between turns',
    author: 'nomomon',
    additions: 214,
    deletions: 88,
    changedFiles: 6,
    age: 6 * DAY,
    checks: 'passing',
    checksDetail: 'a19f0cc'
  },
  {
    number: 900,
    title: 'Chore: bump the Rust toolchain to 1.92',
    author: 'MasterOfFate',
    additions: 24,
    deletions: 19,
    changedFiles: 5,
    age: 6 * HOUR,
    // Still running: the row must show no CI chip at all for this one.
    checks: 'pending',
    checksDetail: 'eb0d514'
  },
  {
    number: 861,
    title: 'Release: bump the engine to 0.9.2',
    author: 'jsgrchrg',
    additions: 42,
    deletions: 42,
    changedFiles: 4,
    age: 4 * HOUR,
    checks: 'passing',
    checksDetail: '2f9c81b',
    state: 'MERGED',
    commentCount: 3
  },
  {
    number: 840,
    title: 'Fix the flaky workspace_sync test',
    author: 'wingleio',
    additions: 88,
    deletions: 21,
    changedFiles: 3,
    age: 3 * DAY,
    checks: 'passing',
    checksDetail: 'c40aa17',
    state: 'MERGED',
    labels: [{ name: 'ci', color: '0e8a16' }]
  },
  {
    number: 820,
    title: 'Docs: rewrite the plugin authoring guide',
    author: 'nomomon',
    additions: 1200,
    deletions: 940,
    changedFiles: 26,
    age: 6 * DAY,
    checks: 'none',
    checksDetail: '77b1e30',
    state: 'CLOSED'
  },
  {
    number: 812,
    title: 'Experiment: virtualize the transcript list',
    author: 'SinaKhalili',
    additions: 2200,
    deletions: 180,
    changedFiles: 19,
    age: 9 * DAY,
    checks: 'failing',
    checksDetail: '5ad9b02',
    state: 'CLOSED',
    conflicts: true
  }
]

function toSummary(seed: Seed): PullRequestSummary {
  return {
    number: seed.number,
    title: seed.title,
    url: `https://github.com/zeronsh/zeron/pull/${seed.number}`,
    author: seed.author,
    headRefName: `pr/${seed.number}-${seed.title.split(':')[0]?.toLowerCase()}`,
    baseRefName: 'main',
    isDraft: !!seed.draft,
    state: seed.state ?? 'OPEN',
    additions: seed.additions,
    deletions: seed.deletions,
    changedFiles: seed.changedFiles,
    createdAt: ago(seed.age + 3 * DAY),
    updatedAt: ago(seed.age),
    commentCount: seed.commentCount ?? 0,
    reviewDecision: seed.reviewDecision ?? '',
    reviewRequested: !!seed.reviewRequested,
    checks: seed.checks,
    checksDetail: seed.checksDetail,
    conflicts: !!seed.conflicts,
    labels: seed.labels ?? []
  }
}

export const DEMO_PULLS: PullRequestSummary[] = SEEDS.map(toSummary)

export const DEMO_REPO = 'zeronsh/zeron'

const FILES_878: PullRequestFileChange[] = [
  { path: 'crates/client/src/demo/fixtures.rs', additions: 1, deletions: 0 },
  { path: 'crates/client/src/demo/mod.rs', additions: 1, deletions: 0 },
  { path: 'crates/doc/src/registry.rs', additions: 2, deletions: 0 },
  { path: 'crates/doc/src/workspace.rs', additions: 5, deletions: 0 },
  { path: 'crates/doc/src/registry/tests.rs', additions: 1, deletions: 0 },
  { path: 'crates/engine/Cargo.toml', additions: 1, deletions: 1 },
  { path: 'crates/engine/src/doc_host.rs', additions: 72, deletions: 0 },
  { path: 'crates/engine/src/lib.rs', additions: 32, deletions: 1 },
  { path: 'crates/engine/src/rpcs.rs', additions: 74, deletions: 0 },
  { path: 'crates/engine/src/sessions.rs', additions: 116, deletions: 15 },
  { path: 'crates/engine/src/workspace_host.rs', additions: 6, deletions: 1 },
  { path: 'crates/engine/tests/device_routing.rs', additions: 102, deletions: 0 },
  { path: 'crates/engine/tests/workspace_sync.rs', additions: 1, deletions: 0 },
  { path: 'crates/harness/src/lib.rs', additions: 18, deletions: 2 },
  { path: 'crates/mcp/src/zeron.rs', additions: 671, deletions: 96 },
  { path: 'crates/mcp/src/tools.rs', additions: 132, deletions: 12 },
  { path: 'crates/mcp/tests/delegation.rs', additions: 208, deletions: 0 }
]

const COMMITS_878: PullRequestCommit[] = [
  {
    oid: 'f329d66c4a5e4d1b8f0a2c7d9e3b5a1f6c8d0e2b',
    shortOid: 'f329d66',
    messageHeadline: 'mcp: report completion after the tracked turn lands in the transcript',
    messageBody: 'The terminal marker is now durable: completion is only reported once the\nresponse for the tracked turn exists in the transcript.',
    author: 'wingleio',
    date: ago(23 * HOUR)
  },
  {
    oid: '1c8b7a6d5e4f30291a8b7c6d5e4f30291a8b7c6d',
    shortOid: '1c8b7a6',
    messageHeadline: 'mcp: process pending questions before the streaming completion gate',
    messageBody: 'await_message_turn skipped any message after the tracked request while it was\nstreaming, so an AwaitingInput branch never ran.',
    author: 'wingleio',
    date: ago(26 * HOUR)
  },
  {
    oid: '9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7081920',
    shortOid: '9d0e1f2',
    messageHeadline: 'sessions: carry background_tasks on the session record',
    messageBody: '',
    author: 'jsgrchrg',
    date: ago(2 * DAY)
  }
]

const COMMENTS_878: PullRequestComment[] = [
  {
    id: 'c-1',
    kind: 'comment',
    author: 'jsgrchrg',
    body: 'CI failing because of a flaky test.',
    createdAt: ago(22 * HOUR)
  },
  {
    id: 'c-2',
    kind: 'comment',
    author: 'jsgrchrg',
    body: [
      'Tested and reproduced this scenarios:',
      '',
      '1. [P1] Pending questions are not reported while their message is streaming Location: `crates/mcp/src/zeron.rs:671`',
      '',
      '`await_message_turn` skips processing whenever a message after the tracked request has Streaming status. However, an unresolved question normally remains inside a Streaming assistant message while the session is AwaitingInput. The AwaitingInput branch therefore never runs, leaving the coordinator unaware that the delegated chat needs an answer.',
      '',
      'Recommended fix: process pending questions before the streaming completion gate. Preserve `reported_input` deduplication and continue watching for the eventual result. Add a regression test with an AwaitingInput session and an unresolved question inside a Streaming message.',
      '',
      '2. [P1] Completion can be reported before the final response reaches the transcript Location: `crates/mcp/src/zeron.rs:692`',
      '',
      'Once Working has been observed, the current condition accepts Idle as completion even when the tracked request is present but its response has not reached the transcript yet. Session state and transcript updates can arrive independently, especially across devices. This returns Completed with an empty response and removes the watch. The actual response arriving later is never reported to the coordinator.',
      '',
      'Recommended fix: require a durable terminal marker for the tracked turn, such as its recorded turn id.'
    ].join('\n'),
    createdAt: ago(22 * HOUR)
  }
]

const DETAIL_878: PullRequestDetail = {
  ...toSummary(SEEDS[1] as Seed),
  body: [
    '## Why',
    '',
    'A delegated MCP chat that finishes while the client is idle had no turn-end event to hand back, so the coordinator only saw the answer if it happened to poll at the right moment.',
    '',
    '## What',
    '',
    '- Carry `background_tasks` on the session record so a delegated turn survives a client reload.',
    '- Emit a turn-end event from the engine host instead of relying on the coordinator to notice.',
    '- Skip no-op upserts so a streaming turn does not rewrite the session row on every delta.',
    '',
    '## Testing',
    '',
    '`cargo test -p zeron-mcp --test delegation` plus a manual pass with two clients attached to one workspace.'
  ].join('\n'),
  headRepo: DEMO_REPO,
  baseRepo: DEMO_REPO,
  commits: COMMITS_878,
  files: FILES_878,
  comments: COMMENTS_878
}

/** Every demo PR resolves to a detail; the ones without a bespoke fixture get a generic body. */
export function demoDetail(number: number): PullRequestDetail | null {
  const seed = SEEDS.find((entry) => entry.number === number)
  if (!seed) return null
  if (number === 878) return DETAIL_878
  return {
    ...toSummary(seed),
    body: `_Demo data._ The ${seed.changedFiles} files in this pull request are not part of the bundled fixtures, so only #878 has a full diff, conversation and file list.`,
    headRepo: DEMO_REPO,
    baseRepo: DEMO_REPO,
    commits: [
      {
        oid: 'f329d66c4a5e4d1b8f0a2c7d9e3b5a1f6c8d0e2b',
        shortOid: 'f329d66',
        messageHeadline: seed.title,
        messageBody: '',
        author: seed.author,
        date: ago(seed.age)
      }
    ],
    files: [],
    comments: []
  }
}

/** Unified patch backing the demo diff viewer, split per file by the caller. */
const PATCH_878 = [
  'diff --git a/crates/client/src/demo/fixtures.rs b/crates/client/src/demo/fixtures.rs',
  'index 1a2b3c4..5d6e7f8 100644',
  '--- a/crates/client/src/demo/fixtures.rs',
  '+++ b/crates/client/src/demo/fixtures.rs',
  '@@ -436,6 +436,7 @@ pub(crate) fn send(',
  '     doc.upsert_session(&Session {',
  '         last_completed_turn: None,',
  '         running_subagents: 0,',
  '+        background_tasks: 0,',
  '         chat_id: demo.id.into(),',
  '         device_id: demo.device.into(),',
  '         status,',
  '',
  'diff --git a/crates/client/src/demo/mod.rs b/crates/client/src/demo/mod.rs',
  'index 2b3c4d5..6e7f8a9 100644',
  '--- a/crates/client/src/demo/mod.rs',
  '+++ b/crates/client/src/demo/mod.rs',
  '@@ -448,6 +448,7 @@ impl DemoHost {',
  '     doc.upsert_session(&Session {',
  '         last_completed_turn: completed.map(str::to_owned),',
  '         running_subagents: 0,',
  '+        background_tasks: 0,',
  '         chat_id: chat.id.to_owned(),',
  '         device_id: host,',
  '         status,',
  '',
  'diff --git a/crates/doc/src/registry.rs b/crates/doc/src/registry.rs',
  'index 3c4d5e6..7f8a9b0 100644',
  '--- a/crates/doc/src/registry.rs',
  '+++ b/crates/doc/src/registry.rs',
  '@@ -1509,6 +1509,7 @@ impl RegistryDoc {',
  '             ("startedAt", opt_ms(session.started_at)),',
  '             ("updatedAt", json!(session.updated_at.timestamp_millis())),',
  '             ("runningSubagents", json!(session.running_subagents)),',
  '+            ("backgroundTasks", json!(session.background_tasks)),',
  '         ];',
  '     },',
  '     self.write(KIND_SESSIONS, &session.chat_id.clone(), OpKind::Upsert, set);',
  '     Ok(())',
  '',
  'diff --git a/crates/engine/src/sessions.rs b/crates/engine/src/sessions.rs',
  'index 4d5e6f7..8a9b0c1 100644',
  '--- a/crates/engine/src/sessions.rs',
  '+++ b/crates/engine/src/sessions.rs',
  '@@ -212,9 +212,18 @@ impl Sessions {',
  '     pub fn upsert(&self, session: &Session) -> Result<()> {',
  '-        self.write(KIND_SESSIONS, &session.id, OpKind::Upsert, session)?;',
  '-        Ok(())',
  '+        // Skip a no-op write: a streaming turn would otherwise rewrite the',
  '+        // session row on every delta and wake every attached client.',
  '+        if self.last_written(&session.id) == Some(session.revision) {',
  '+            return Ok(());',
  '+        }',
  '+        self.write(KIND_SESSIONS, &session.id, OpKind::Upsert, session)?;',
  '+        self.mark_written(&session.id, session.revision);',
  '+        Ok(())',
  '     }',
  '',
  '@@ -340,7 +349,12 @@ impl Sessions {',
  '     fn background_tasks(&self, chat: &str) -> usize {',
  '-        self.watches.values().filter(|w| w.chat == chat).count()',
  '+        self.watches',
  '+            .values()',
  '+            .filter(|w| w.chat == chat && w.state != WatchState::Settled)',
  '+            .count()',
  '     }',
  ''
].join('\n')

export function demoDiff(number: number): string | null {
  return number === 878 ? PATCH_878 : null
}
