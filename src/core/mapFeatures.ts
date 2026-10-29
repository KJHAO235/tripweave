import type { FeatureCollection, LineString, MultiLineString, Position } from 'geojson'
import type { Gap } from './gaps'
import type { RailFill } from './rail/fill'
import type { Track, TrackPoint } from './track'

export interface GapProperties {
  id: string
  distanceKm: number
  durationSec?: number
  speedKmh?: number
}

export interface InferredProperties {
  gapId: string
  lengthKm: number
}

export interface MapFeatures {
  /** 實際記錄的路段，已在缺口處切開 */
  recorded: FeatureCollection<MultiLineString>
  /** 尚未補齊的缺口（整段直線），以及已補齊缺口中沒補到的部分 */
  gaps: FeatureCollection<LineString, GapProperties>
  /** 推算路段 */
  inferred: FeatureCollection<LineString, InferredProperties>
}

export function toMapFeatures(track: Track, gaps: Gap[], fills: ReadonlyMap<string, RailFill> = new Map()): MapFeatures {
  // 段落內的缺口：在 from.index 與 from.index + 1 之間切開
  const cutsBySegment = new Map<number, Set<number>>()
  for (const gap of gaps) {
    if (gap.isSegmentBoundary) continue
    const cuts = cutsBySegment.get(gap.from.segment) ?? new Set<number>()
    cuts.add(gap.from.index)
    cutsBySegment.set(gap.from.segment, cuts)
  }

  const lines: Position[][] = []
  track.segments.forEach((segment, segmentIndex) => {
    const cuts = cutsBySegment.get(segmentIndex)
    let current: Position[] = []
    segment.points.forEach((point, index) => {
      current.push(toPosition(point))
      if (cuts?.has(index)) {
        lines.push(current)
        current = []
      }
    })
    lines.push(current)
  })

  return {
    recorded: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          // 只有一個點的片段畫不成線；它仍是相鄰缺口的端點，會出現在缺口線上
          geometry: { type: 'MultiLineString', coordinates: lines.filter((line) => line.length >= 2) },
        },
      ],
    },
    gaps: {
      type: 'FeatureCollection',
      features: gaps.flatMap((gap) => {
        const fill = fills.get(gap.id)
        const lines: Position[][] = fill
          ? fill.remainders
          : [
              [
                [gap.from.lon, gap.from.lat],
                [gap.to.lon, gap.to.lat],
              ],
            ]
        return lines.map((coordinates) => ({
          type: 'Feature' as const,
          properties: gapProperties(gap),
          geometry: { type: 'LineString' as const, coordinates },
        }))
      }),
    },
    inferred: {
      type: 'FeatureCollection',
      features: gaps.flatMap((gap) => {
        const fill = fills.get(gap.id)
        if (!fill) return []
        return [
          {
            type: 'Feature' as const,
            properties: { gapId: gap.id, lengthKm: fill.lengthKm },
            geometry: { type: 'LineString' as const, coordinates: fill.path },
          },
        ]
      }),
    },
  }
}

function toPosition(point: TrackPoint): Position {
  return [point.lon, point.lat]
}

// MapLibre 的 feature properties 不接受 undefined，沒有的欄位直接省略
function gapProperties(gap: Gap): GapProperties {
  const properties: GapProperties = { id: gap.id, distanceKm: gap.distanceKm }
  if (gap.durationSec !== undefined) properties.durationSec = gap.durationSec
  if (gap.speedKmh !== undefined) properties.speedKmh = gap.speedKmh
  return properties
}
