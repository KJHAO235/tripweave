import { distanceKm } from '../geo.ts'
import type { RailEdge } from './tile.ts'

/** 空間索引格子大小（度），約 1 km */
const BUCKET_DEG = 0.01

export interface GraphEdge extends RailEdge {
  /** 每個座標點距離起點的累積長度（公里） */
  cumulativeKm: number[]
  lengthKm: number
}

export class RailGraph {
  readonly edges = new Map<number, GraphEdge>()
  /** 節點 id -> 相接的邊 id */
  readonly adjacency = new Map<number, number[]>()
  /** 空間格子 -> [邊 id, 線段序號] */
  private readonly buckets = new Map<string, [number, number][]>()

  addEdges(edges: Iterable<RailEdge>) {
    for (const edge of edges) {
      if (this.edges.has(edge.id) || edge.coords.length < 2) continue
      const cumulativeKm = [0]
      for (let i = 1; i < edge.coords.length; i++) {
        cumulativeKm.push(cumulativeKm[i - 1] + distanceKm(toLatLon(edge.coords[i - 1]), toLatLon(edge.coords[i])))
      }
      const graphEdge: GraphEdge = { ...edge, cumulativeKm, lengthKm: cumulativeKm[cumulativeKm.length - 1] }
      this.edges.set(edge.id, graphEdge)
      for (const node of [edge.a, edge.b]) {
        const list = this.adjacency.get(node) ?? []
        list.push(edge.id)
        this.adjacency.set(node, list)
      }
      for (let i = 1; i < edge.coords.length; i++) this.indexSegment(edge.id, i - 1, edge.coords[i - 1], edge.coords[i])
    }
  }

  /** 與指定的邊相連的所有邊（同一個鐵路網） */
  connectedEdges(edgeId: number): Set<number> {
    const edges = new Set<number>([edgeId])
    const start = this.edges.get(edgeId)!
    const stack = [start.a, start.b]
    const visited = new Set<number>(stack)
    while (stack.length > 0) {
      for (const next of this.adjacency.get(stack.pop()!) ?? []) {
        if (edges.has(next)) continue
        edges.add(next)
        const edge = this.edges.get(next)!
        for (const node of [edge.a, edge.b]) {
          if (!visited.has(node)) {
            visited.add(node)
            stack.push(node)
          }
        }
      }
    }
    return edges
  }

  /** 範圍內可能相關的線段（依格子粗篩，呼叫端再計算精確距離） */
  segmentsNear(lat: number, lon: number, radiusKm: number): [number, number][] {
    const latSpan = Math.ceil(radiusKm / 111 / BUCKET_DEG)
    const lonSpan = Math.ceil(radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))) / BUCKET_DEG)
    const bLat = Math.floor(lat / BUCKET_DEG)
    const bLon = Math.floor(lon / BUCKET_DEG)
    const seen = new Set<string>()
    const result: [number, number][] = []
    for (let y = bLat - latSpan; y <= bLat + latSpan; y++) {
      for (let x = bLon - lonSpan; x <= bLon + lonSpan; x++) {
        for (const segment of this.buckets.get(`${y}/${x}`) ?? []) {
          const key = `${segment[0]}:${segment[1]}`
          if (seen.has(key)) continue
          seen.add(key)
          result.push(segment)
        }
      }
    }
    return result
  }

  private indexSegment(edgeId: number, index: number, [lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
    const minLat = Math.floor(Math.min(lat1, lat2) / BUCKET_DEG)
    const maxLat = Math.floor(Math.max(lat1, lat2) / BUCKET_DEG)
    const minLon = Math.floor(Math.min(lon1, lon2) / BUCKET_DEG)
    const maxLon = Math.floor(Math.max(lon1, lon2) / BUCKET_DEG)
    for (let y = minLat; y <= maxLat; y++) {
      for (let x = minLon; x <= maxLon; x++) {
        const key = `${y}/${x}`
        const list = this.buckets.get(key) ?? []
        list.push([edgeId, index])
        this.buckets.set(key, list)
      }
    }
  }
}

export function toLatLon([lon, lat]: [number, number]) {
  return { lat, lon }
}
