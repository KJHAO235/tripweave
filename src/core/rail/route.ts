import { distanceKm } from '../geo.ts'
import { toLatLon, type GraphEdge, type RailGraph } from './graph.ts'
import type { RailSnap } from './snap.ts'

/** 依 service 類別放大成本，讓路徑優先走主線 */
const SERVICE_COST = [1, 3, 10] as const

export interface RailRoute {
  coords: [number, number][]
  lengthKm: number
  /** 依經過順序列出的路線名稱（不重複） */
  routeNames: string[]
}

/** 兩個貼合點之間沿鐵路的最低成本路徑；不相連時回傳 null */
export function shortestRailRoute(graph: RailGraph, from: RailSnap, to: RailSnap): RailRoute | null {
  const startEdge = graph.edges.get(from.edgeId)!
  const endEdge = graph.edges.get(to.edgeId)!
  const cost = (edge: GraphEdge, km: number) => km * SERVICE_COST[edge.service]

  // 起點沿所在的邊走到兩端節點
  const dist = new Map<number, number>()
  const prev = new Map<number, { edgeId: number; fromNode: number } | null>()
  const heap = new MinHeap()
  const seed = (node: number, km: number) => {
    const c = cost(startEdge, km)
    if (c < (dist.get(node) ?? Infinity)) {
      dist.set(node, c)
      prev.set(node, null)
      heap.push(c, node)
    }
  }
  seed(startEdge.a, from.positionKm)
  seed(startEdge.b, startEdge.lengthKm - from.positionKm)

  // 兩點在同一條邊上時，可以直接沿這條邊走
  let bestCost = Infinity
  let bestVia: { node: number; viaA: boolean } | null = null
  let direct = false
  if (from.edgeId === to.edgeId) {
    bestCost = cost(startEdge, Math.abs(to.positionKm - from.positionKm))
    direct = true
  }

  while (heap.size > 0) {
    const [c, node] = heap.pop()!
    if (c > (dist.get(node) ?? Infinity) || c >= bestCost) continue
    // 抵達終點所在邊的任一端，就可以沿邊走到終點
    if (node === endEdge.a || node === endEdge.b) {
      const tail = node === endEdge.a ? to.positionKm : endEdge.lengthKm - to.positionKm
      const total = c + cost(endEdge, tail)
      if (total < bestCost) {
        bestCost = total
        bestVia = { node, viaA: node === endEdge.a }
        direct = false
      }
    }
    for (const edgeId of graph.adjacency.get(node) ?? []) {
      const edge = graph.edges.get(edgeId)!
      const next = edge.a === node ? edge.b : edge.a
      const nc = c + cost(edge, edge.lengthKm)
      if (nc < (dist.get(next) ?? Infinity)) {
        dist.set(next, nc)
        prev.set(next, { edgeId, fromNode: node })
        heap.push(nc, next)
      }
    }
  }

  if (direct) return buildRoute([sliceEdge(startEdge, from.positionKm, to.positionKm)], [startEdge])
  if (!bestVia) return null

  // 由終點往回組出經過的邊
  const middle: { edge: GraphEdge; forward: boolean }[] = []
  let node = bestVia.node
  for (let step = prev.get(node); step; step = prev.get(node)) {
    const edge = graph.edges.get(step.edgeId)!
    middle.unshift({ edge, forward: edge.a === step.fromNode })
    node = step.fromNode
  }
  const firstNode = node
  const pieces: [number, number][][] = []
  const used: GraphEdge[] = [startEdge]
  pieces.push(sliceEdge(startEdge, from.positionKm, firstNode === startEdge.a ? 0 : startEdge.lengthKm))
  for (const { edge, forward } of middle) {
    pieces.push(forward ? edge.coords : [...edge.coords].reverse())
    used.push(edge)
  }
  pieces.push(sliceEdge(endEdge, bestVia.viaA ? 0 : endEdge.lengthKm, to.positionKm))
  used.push(endEdge)
  return buildRoute(pieces, used)
}

/** 取出邊上兩個位置之間的座標，方向依 fromKm 到 toKm */
export function sliceEdge(edge: GraphEdge, fromKm: number, toKm: number): [number, number][] {
  const lo = Math.min(fromKm, toKm)
  const hi = Math.max(fromKm, toKm)
  const coords: [number, number][] = [pointAt(edge, lo)]
  for (let i = 0; i < edge.coords.length; i++) {
    if (edge.cumulativeKm[i] > lo && edge.cumulativeKm[i] < hi) coords.push(edge.coords[i])
  }
  coords.push(pointAt(edge, hi))
  return fromKm <= toKm ? coords : coords.reverse()
}

function pointAt(edge: GraphEdge, km: number): [number, number] {
  const { coords, cumulativeKm } = edge
  if (km <= 0) return coords[0]
  for (let i = 1; i < coords.length; i++) {
    if (cumulativeKm[i] >= km) {
      const span = cumulativeKm[i] - cumulativeKm[i - 1]
      const t = span === 0 ? 0 : (km - cumulativeKm[i - 1]) / span
      return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])]
    }
  }
  return coords[coords.length - 1]
}

function buildRoute(pieces: [number, number][][], edges: GraphEdge[]): RailRoute {
  const coords: [number, number][] = []
  for (const piece of pieces) {
    for (const point of piece) {
      const last = coords[coords.length - 1]
      if (!last || last[0] !== point[0] || last[1] !== point[1]) coords.push(point)
    }
  }
  let lengthKm = 0
  for (let i = 1; i < coords.length; i++) lengthKm += distanceKm(toLatLon(coords[i - 1]), toLatLon(coords[i]))
  const routeNames: string[] = []
  for (const edge of edges) {
    if (edge.name && !routeNames.includes(edge.name)) routeNames.push(edge.name)
  }
  return { coords, lengthKm, routeNames }
}

class MinHeap {
  private items: [number, number][] = []
  get size() {
    return this.items.length
  }
  push(priority: number, value: number) {
    const items = this.items
    items.push([priority, value])
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent][0] <= items[i][0]) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }
  pop(): [number, number] | undefined {
    const items = this.items
    if (items.length === 0) return undefined
    const top = items[0]
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let smallest = i
        if (l < items.length && items[l][0] < items[smallest][0]) smallest = l
        if (r < items.length && items[r][0] < items[smallest][0]) smallest = r
        if (smallest === i) break
        ;[items[smallest], items[i]] = [items[i], items[smallest]]
        i = smallest
      }
    }
    return top
  }
}
