import { useEffect, useRef, useState } from 'react'
import type { Gap } from './core/gaps'
import { fillGapAlongRail, tilesForGap, type RailFill } from './core/rail/fill'
import { RailGraph } from './core/rail/graph'
import { RailTileLoader } from './core/rail/loader'
import type { Track } from './core/track'
import { fetchRailJson } from './railFetch'

const loader = new RailTileLoader(fetchRailJson)

export interface RailFillState {
  fills: ReadonlyMap<string, RailFill>
  /** 還在處理中的缺口數；0 代表沒有進行中的補路 */
  pending: number
  total: number
}

/** 匯入後在背景沿鐵路補齊缺口，每補好一個就更新 */
export function useRailFills(track: Track | null, gaps: Gap[]): RailFillState {
  const [fills, setFills] = useState<ReadonlyMap<string, RailFill>>(new Map())
  const [progress, setProgress] = useState({ pending: 0, total: 0 })
  // 每份軌跡各自的鐵路網與已處理過的缺口；調整門檻時只補新的缺口
  const session = useRef<{ track: Track; graph: RailGraph; attempted: Set<string> } | null>(null)

  useEffect(() => {
    if (!track) return
    if (session.current?.track !== track) {
      session.current = { track, graph: new RailGraph(), attempted: new Set() }
      setFills(new Map())
    }
    const { graph, attempted } = session.current
    const todo = gaps.filter((gap) => !attempted.has(gap.id))
    let cancelled = false
    setProgress({ pending: todo.length, total: gaps.length })

    ;(async () => {
      for (const [i, gap] of todo.entries()) {
        if (cancelled) return
        const keys = tilesForGap(gap)
        try {
          if (keys) graph.addEdges(await loader.loadTiles(keys))
          if (cancelled) return
          const fill = keys ? fillGapAlongRail(graph, track, gap) : null
          attempted.add(gap.id)
          if (fill) setFills((prev) => new Map(prev).set(gap.id, fill))
        } catch {
          // 網路錯誤時這個缺口維持原樣，下次重新匯入或調整門檻時再試
        }
        setProgress({ pending: todo.length - i - 1, total: gaps.length })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [track, gaps])

  return { fills: track ? fills : new Map(), pending: track ? progress.pending : 0, total: progress.total }
}
