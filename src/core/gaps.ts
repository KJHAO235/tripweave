import { distanceKm } from './geo'
import type { Track, TrackPoint } from './track'

export const DEFAULT_GAP_THRESHOLD_KM = 1

export interface PointRef {
  segment: number
  index: number
  lat: number
  lon: number
}

export interface Gap {
  /** 以缺口起點位置組成，在同一份軌跡內唯一 */
  id: string
  from: PointRef
  to: PointRef
  distanceKm: number
  /** 只有軌跡有時間資料時才提供 */
  durationSec?: number
  speedKmh?: number
  /** 缺口位於兩個段落的交界 */
  isSegmentBoundary: boolean
}

/** 找出相鄰點直線距離超過門檻的缺口，依距離由大到小排序 */
export function detectGaps(track: Track, thresholdKm = DEFAULT_GAP_THRESHOLD_KM): Gap[] {
  const gaps: Gap[] = []
  let previous: { ref: PointRef; point: TrackPoint } | undefined

  track.segments.forEach((segment, segmentIndex) => {
    segment.points.forEach((point, index) => {
      const ref: PointRef = { segment: segmentIndex, index, lat: point.lat, lon: point.lon }
      if (previous) {
        const distance = distanceKm(previous.point, point)
        if (distance > thresholdKm) {
          gaps.push(buildGap(previous, { ref, point }, distance, track.hasTime))
        }
      }
      previous = { ref, point }
    })
  })

  return gaps.sort((a, b) => b.distanceKm - a.distanceKm)
}

function buildGap(
  from: { ref: PointRef; point: TrackPoint },
  to: { ref: PointRef; point: TrackPoint },
  distance: number,
  hasTime: boolean,
): Gap {
  const gap: Gap = {
    id: `${from.ref.segment}:${from.ref.index}`,
    from: from.ref,
    to: to.ref,
    distanceKm: distance,
    isSegmentBoundary: from.ref.segment !== to.ref.segment,
  }
  if (hasTime && from.point.time !== undefined && to.point.time !== undefined) {
    gap.durationSec = (to.point.time - from.point.time) / 1000
    if (gap.durationSec > 0) gap.speedKmh = distance / (gap.durationSec / 3600)
  }
  return gap
}
