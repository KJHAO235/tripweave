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
