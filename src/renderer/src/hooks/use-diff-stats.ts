import { useEffect, useMemo, useRef, useState } from 'react'

export interface DiffStat { insertions: number; deletions: number }

/**
 * Uncommitted insertions/deletions per folder. Refetched when the folder set
 * changes or `refreshKey` does (pass the running-session key so a finished
 * turn updates the counts). Folders that are not repos are omitted.
 */
export function useDiffStats(cwds: string[], enabled: boolean, refreshKey: string): ReadonlyMap<string, DiffStat> {
  const [stats, setStats] = useState<ReadonlyMap<string, DiffStat>>(new Map())
  const key = useMemo(() => [...new Set(cwds)].sort().join('\n'), [cwds])
  const seq = useRef(0)

  useEffect(() => {
    if (!enabled || !key) return
    const run = ++seq.current
    void Promise.all(
      key.split('\n').map(async (cwd): Promise<[string, DiffStat | null]> => {
        try {
          const res = await window.myagent.git.status(cwd)
          return [cwd, res.ok && res.result.isRepo ? { insertions: res.result.insertions, deletions: res.result.deletions } : null]
        } catch {
          return [cwd, null]
        }
      })
    ).then((entries) => {
      if (run !== seq.current) return
      setStats(new Map(entries.filter((e): e is [string, DiffStat] => e[1] !== null)))
    })
  }, [key, enabled, refreshKey])

  return stats
}
