import { decodeTile, tileId, tilePath, TILE_FORMAT_VERSION, type RailEdge, type RailIndex, type RailTile, type TileKey } from './tile.ts'

/** 由呼叫端注入：取得 rail/ 底下的 JSON；檔案不存在時應回傳 null */
export type FetchRailJson = (path: string) => Promise<unknown>

const MAX_CONCURRENT = 4
/**
 * 只保留最近使用的這麼多個網格；快取存未解碼的原始資料（解碼後的座標會膨脹數倍），
 * 移出的網格再需要時由 service worker 快取重新取得
 */
export const MAX_CACHED_TILES = 64

export class RailTileLoader {
  private index: Promise<Set<string> | null> | undefined
  private readonly tiles = new Map<string, Promise<RailTile | null>>()
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

  /** 先在背景下載網格放進快取（不解碼），讓下載和補路計算同時進行 */
  async prefetch(keys: TileKey[]): Promise<void> {
    const index = await this.loadIndex()
    if (!index) return
    for (const key of keys) if (index.has(tileId(key))) this.loadTile(key).catch(() => {})
  }

  /** 下載指定網格的鐵路邊；不在 index 內的網格不發請求 */
  async loadTiles(keys: TileKey[]): Promise<RailEdge[]> {
    const index = await this.loadIndex()
    if (!index) return []
    const covered = keys.filter((key) => index.has(tileId(key)))
    const tiles = await Promise.all(covered.map((key) => this.loadTile(key)))
    return tiles.flatMap((tile) => (tile ? decodeTile(tile) : []))
  }

  private loadTile(key: TileKey): Promise<RailTile | null> {
    const id = tileId(key)
    let promise = this.tiles.get(id)
    if (promise) {
      // 移到最後，代表最近使用
      this.tiles.delete(id)
      this.tiles.set(id, promise)
    } else {
      promise = this.limit(async () => ((await this.fetchJson(tilePath(key))) as RailTile | null) ?? null)
      // 失敗時移除，下次需要時可以重試
      promise.catch(() => this.tiles.delete(id))
      this.tiles.set(id, promise)
      if (this.tiles.size > MAX_CACHED_TILES) this.tiles.delete(this.tiles.keys().next().value!)
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
