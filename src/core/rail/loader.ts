import { decodeTile, tileId, tilePath, TILE_FORMAT_VERSION, type RailEdge, type RailIndex, type RailTile, type TileKey } from './tile.ts'

/** 由呼叫端注入：取得 rail/ 底下的 JSON；檔案不存在時應回傳 null */
export type FetchRailJson = (path: string) => Promise<unknown>

const MAX_CONCURRENT = 4

export class RailTileLoader {
  private index: Promise<Set<string> | null> | undefined
  private readonly tiles = new Map<string, Promise<RailEdge[]>>()
  private active = 0
  private readonly queue: (() => void)[] = []
  private readonly fetchJson: FetchRailJson

  constructor(fetchJson: FetchRailJson) {
    this.fetchJson = fetchJson
  }

  /** 有資料的網格；網站上沒有鐵路資料時回傳 null */
  loadIndex(): Promise<Set<string> | null> {
    this.index ??= this.fetchJson(`v${TILE_FORMAT_VERSION}/index.json`).then((data) =>
      data ? new Set((data as RailIndex).tiles) : null,
    )
    return this.index
  }

  /** 下載指定網格的鐵路邊；不在 index 內的網格不發請求 */
  async loadTiles(keys: TileKey[]): Promise<RailEdge[]> {
    const index = await this.loadIndex()
    if (!index) return []
    const covered = keys.filter((key) => index.has(tileId(key)))
    const results = await Promise.all(covered.map((key) => this.loadTile(key)))
    return results.flat()
  }

  private loadTile(key: TileKey): Promise<RailEdge[]> {
    const id = tileId(key)
    let promise = this.tiles.get(id)
    if (!promise) {
      promise = this.limit(async () => {
        const data = await this.fetchJson(tilePath(key))
        return data ? decodeTile(data as RailTile) : []
      })
      // 失敗時移除，下次需要時可以重試
      promise.catch(() => this.tiles.delete(id))
      this.tiles.set(id, promise)
    }
    return promise
  }

  private async limit<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENT) await new Promise<void>((resolve) => this.queue.push(resolve))
    this.active++
    try {
      return await task()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}
