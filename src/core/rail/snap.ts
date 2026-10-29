import { distanceKm } from '../geo.ts'
import { toLatLon, type RailGraph } from './graph.ts'

export interface RailSnap {
  edgeId: number
  /** 貼合點距離邊起點的長度（公里） */
  positionKm: number
  /** 貼合點座標 [經度, 緯度] */
  point: [number, number]
  /** 原始點到貼合點的距離（公里） */
  distanceKm: number
}

/**
 * 把點投影到 maxKm 內最近的鐵路邊上；範圍內沒有鐵路時回傳 null。
 * 指定 allowedEdges 時只考慮這些邊（例如限定在某個相連的鐵路網內）
 */
export function snapToRail(
  graph: RailGraph,
  lat: number,
  lon: number,
  maxKm: number,
  allowedEdges?: ReadonlySet<number>,
): RailSnap | null {
  return snapCandidates(graph, lat, lon, maxKm, allowedEdges, 0)[0] ?? null
}

/**
 * 最近的貼合點，以及距離只比最近的多 toleranceKm 以內的其他邊上的貼合點
 * （例如複線的另一條軌道），依距離排序，每條邊最多一個
 */
export function snapCandidates(
  graph: RailGraph,
  lat: number,
  lon: number,
  maxKm: number,
  allowedEdges: ReadonlySet<number> | undefined,
  toleranceKm: number,
): RailSnap[] {
  const bestByEdge = new Map<number, RailSnap>()
  const cosLat = Math.cos((lat * Math.PI) / 180)
  for (const [edgeId, i] of graph.segmentsNear(lat, lon, maxKm)) {
    if (allowedEdges && !allowedEdges.has(edgeId)) continue
    const edge = graph.edges.get(edgeId)!
    const [lon1, lat1] = edge.coords[i]
    const [lon2, lat2] = edge.coords[i + 1]
    // 在小範圍內用等距投影計算投影位置，距離再以大圓公式精算
    const dx = (lon2 - lon1) * cosLat
    const dy = lat2 - lat1
    const lengthSq = dx * dx + dy * dy
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (((lon - lon1) * cosLat) * dx + (lat - lat1) * dy) / lengthSq))
    const point: [number, number] = [lon1 + t * (lon2 - lon1), lat1 + t * (lat2 - lat1)]
    const d = distanceKm({ lat, lon }, toLatLon(point))
    const current = bestByEdge.get(edgeId)
    if (d <= maxKm && (!current || d < current.distanceKm)) {
      const segmentKm = edge.cumulativeKm[i + 1] - edge.cumulativeKm[i]
      bestByEdge.set(edgeId, { edgeId, positionKm: edge.cumulativeKm[i] + t * segmentKm, point, distanceKm: d })
    }
  }
  const sorted = [...bestByEdge.values()].sort((a, b) => a.distanceKm - b.distanceKm)
  return sorted.filter((snap) => snap.distanceKm <= sorted[0].distanceKm + toleranceKm)
}
