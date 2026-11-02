export interface TrackPoint {
  lat: number
  lon: number
  ele?: number
  /** epoch 毫秒 */
  time?: number
}

export interface Segment {
  points: TrackPoint[]
  /** 來源檔名（不含副檔名）；多檔匯入時用來辨識檔案之間的缺口 */
  source?: string
  /** 旅程中檔案的 id；同名的不同檔案也能區分 */
  fileId?: string
}

/** 段落屬於哪個檔案：優先用檔案 id，沒有時用檔名 */
export function fileKey(segment: Segment): string | undefined {
  return segment.fileId ?? segment.source
}

export interface Track {
  name?: string
  segments: Segment[]
  /** 只有在每個點都有時間時才為 true，避免用不完整的時間計算速度 */
  hasTime: boolean
}

export function countPoints(track: Track): number {
  return track.segments.reduce((sum, segment) => sum + segment.points.length, 0)
}

/** [[西, 南], [東, 北]]，沒有任何點時回傳 null */
export type Bounds = [[number, number], [number, number]]

export function trackBounds(track: Track): Bounds | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const segment of track.segments) {
    for (const { lat, lon } of segment.points) {
      if (lon < west) west = lon
      if (lon > east) east = lon
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }
  return Number.isFinite(west) ? [[west, south], [east, north]] : null
}

/** 工具列顯示的旅程名稱：單檔用檔名；多檔為「N 個檔案」，有任何時間資料時加上日期範圍 */
export function tripLabel(track: Track, formatRange: (startMs: number, endMs: number) => string): string {
  const sources = new Set(track.segments.map(fileKey))
  if (sources.size <= 1) return track.name ?? ''
  const label = `${sources.size} 個檔案`
  // 有些檔案可能沒有時間（例如 Google 我的地圖匯出的 KML），只用有時間的點
  let first = Infinity
  let last = -Infinity
  for (const segment of track.segments) {
    for (const { time } of segment.points) {
      if (time === undefined) continue
      if (time < first) first = time
      if (time > last) last = time
    }
  }
  return Number.isFinite(first) ? `${label} · ${formatRange(first, last)}` : label
}
