export interface TrackPoint {
  lat: number
  lon: number
  ele?: number
  /** epoch 毫秒 */
  time?: number
}

export interface Segment {
  points: TrackPoint[]
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
