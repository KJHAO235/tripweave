import { useEffect, useRef, useState } from 'react'
import { tilesForFerryGap } from './core/ferry'
import { decideFill, type GapFill } from './core/fill'
import { flightBySpeed } from './core/flight'
import type { Gap } from './core/gaps'
import { tilesForGap } from './core/rail/fill'
import { RailGraph } from './core/rail/graph'
import { RailTileLoader } from './core/rail/loader'
import { tileId, type TileKey } from './core/rail/tile'
import type { Track } from './core/track'
import { fetchFerryJson, fetchRailJson } from './railFetch'

const railLoader = new RailTileLoader(fetchRailJson)
const ferryLoader = new RailTileLoader(fetchFerryJson)

/** 路線網圖最多容納的網格數；超過時以目前缺口需要的網格重建，記憶體不會隨旅程長度累加 */
const MAX_GRAPH_TILES = 96

/** 一種路線網（鐵路或渡輪）目前載入的網圖；鐵路與渡輪分開，避免鐵路的最短路徑走到航線上 */
class NetworkCache {
  private graph = new RailGraph()
  private tiles = new Set<string>()
  private readonly loader: RailTileLoader

  constructor(loader: RailTileLoader) {
    this.loader = loader
  }

  /** 包含這些網格的網圖；keys 為 null（缺口太長，不考慮這種交通方式）時回傳空網圖 */
  async graphFor(keys: TileKey[] | null): Promise<RailGraph> {
    if (!keys) return new RailGraph()
    const missing = keys.filter((key) => !this.tiles.has(tileId(key)))
    if (this.tiles.size + missing.length > MAX_GRAPH_TILES) {
      this.graph = new RailGraph()
      this.tiles = new Set()
    }
    const toLoad = keys.filter((key) => !this.tiles.has(tileId(key)))
    this.graph.addEdges(await this.loader.loadTiles(toLoad))
    for (const key of toLoad) this.tiles.add(tileId(key))
    return this.graph
  }
}
/** 補好的結果累積到這麼久才更新一次畫面，避免每補一個缺口就重繪 */
const FLUSH_INTERVAL_MS = 300
/** 預先下載接下來幾個缺口的網格 */
const PREFETCH_GAPS = 4

export interface GapFillState {
  fills: ReadonlyMap<string, GapFill>
  /** 還在處理中的缺口數；0 代表沒有進行中的補路 */
  pending: number
  total: number
}

/**
 * 匯入後在背景補齊缺口：時速高到不可能是鐵路的直接判斷為飛機，
 * 其餘先試鐵路，鐵路補不了再看是否為飛機
 */
export function useGapFills(track: Track | null, gaps: Gap[]): GapFillState {
  const [fills, setFills] = useState<ReadonlyMap<string, GapFill>>(new Map())
  const [progress, setProgress] = useState({ pending: 0, total: 0 })
  // 每份軌跡的鐵路網圖與已處理過的缺口；調整門檻時只補新的缺口
  const session = useRef<{ track: Track; rail: NetworkCache; ferry: NetworkCache; attempted: Set<string> } | null>(null)

  useEffect(() => {
    if (!track) return
    if (session.current?.track !== track) {
      session.current = { track, rail: new NetworkCache(railLoader), ferry: new NetworkCache(ferryLoader), attempted: new Set() }
      setFills(new Map())
    }
    const current = session.current
    // 沿旅程先後處理：相鄰的缺口用到同一批網格，路線網圖很少需要重建
    const todo = gaps
      .filter((gap) => !current.attempted.has(gap.id))
      .sort((a, b) => a.from.segment - b.from.segment || a.from.index - b.from.index)
    let cancelled = false
    setProgress({ pending: todo.length, total: gaps.length })

    ;(async () => {
      // 直接判斷為飛機的缺口不需要鐵路網格
      const byFlight = todo.map((gap) => flightBySpeed(gap))
      const tilesOf = todo.map((gap, i) => (byFlight[i] ? null : tilesForGap(gap)))
      let batch: GapFill[] = []
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
        // 計算這個缺口的同時，先下載接下來幾個缺口要用的鐵路網格（渡輪只在鐵路補不了時才需要）
        for (const next of tilesOf.slice(i + 1, i + 1 + PREFETCH_GAPS)) if (next) void railLoader.prefetch(next)
        try {
          const fill = await decideFill(
            track,
            gap,
            () => current.rail.graphFor(tilesOf[i]),
            () => current.ferry.graphFor(tilesForFerryGap(gap)),
          )
          if (cancelled) return
          // 網格下載失敗時會跳到 catch，不會退而判斷為飛機
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
