import { useEffect, useRef, useState } from 'react'
import type { Gap } from './core/gaps'
import { fillGapAlongRail, tilesForGap, type RailFill } from './core/rail/fill'
import { RailGraph } from './core/rail/graph'
import { RailTileLoader } from './core/rail/loader'
import { tileId } from './core/rail/tile'
import type { Track } from './core/track'
import { fetchRailJson } from './railFetch'

const loader = new RailTileLoader(fetchRailJson)

/** 鐵路網圖最多容納的網格數；超過時以目前缺口需要的網格重建，記憶體不會隨旅程長度累加 */
const MAX_GRAPH_TILES = 96
/** 補好的結果累積到這麼久才更新一次畫面，避免每補一個缺口就重繪 */
const FLUSH_INTERVAL_MS = 300
/** 預先下載接下來幾個缺口的網格 */
const PREFETCH_GAPS = 4

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
  // 每份軌跡的鐵路網圖與已處理過的缺口；調整門檻時只補新的缺口
  const session = useRef<{ track: Track; graph: RailGraph; graphTiles: Set<string>; attempted: Set<string> } | null>(null)

  useEffect(() => {
    if (!track) return
    if (session.current?.track !== track) {
      session.current = { track, graph: new RailGraph(), graphTiles: new Set(), attempted: new Set() }
      setFills(new Map())
    }
    const current = session.current
    // 沿旅程先後處理：相鄰的缺口用到同一批網格，鐵路網圖很少需要重建
    const todo = gaps
      .filter((gap) => !current.attempted.has(gap.id))
      .sort((a, b) => a.from.segment - b.from.segment || a.from.index - b.from.index)
    let cancelled = false
    setProgress({ pending: todo.length, total: gaps.length })

    ;(async () => {
      const tilesOf = todo.map((gap) => tilesForGap(gap))
      let batch: RailFill[] = []
      let lastFlush = performance.now()
      const flush = (done: number) => {
        if (batch.length > 0) {
          const ready = batch
          setFills((prev) => {
            const next = new Map(prev)
            for (const fill of ready) next.set(fill.gapId, fill)
            return next
          })
          batch = []
        }
        setProgress({ pending: todo.length - done, total: gaps.length })
        lastFlush = performance.now()
      }
      for (const [i, gap] of todo.entries()) {
        if (cancelled) return
        // 計算這個缺口的同時，先下載接下來幾個缺口要用的網格
        for (const next of tilesOf.slice(i + 1, i + 1 + PREFETCH_GAPS)) if (next) void loader.prefetch(next)
        const keys = tilesOf[i]
        try {
          let fill = null
          if (keys) {
            const missing = keys.filter((key) => !current.graphTiles.has(tileId(key)))
            if (current.graphTiles.size + missing.length > MAX_GRAPH_TILES) {
              current.graph = new RailGraph()
              current.graphTiles = new Set()
            }
            const toLoad = keys.filter((key) => !current.graphTiles.has(tileId(key)))
            current.graph.addEdges(await loader.loadTiles(toLoad))
            for (const key of toLoad) current.graphTiles.add(tileId(key))
            if (cancelled) return
            fill = fillGapAlongRail(current.graph, track, gap)
          }
          current.attempted.add(gap.id)
          if (fill) batch.push(fill)
        } catch {
          // 網路錯誤時這個缺口維持原樣，下次重新匯入或調整門檻時再試
        }
        if (performance.now() - lastFlush > FLUSH_INTERVAL_MS) flush(i + 1)
      }
      flush(todo.length)
    })()

    return () => {
      cancelled = true
    }
  }, [track, gaps])

  return { fills: track ? fills : new Map(), pending: track ? progress.pending : 0, total: progress.total }
}
