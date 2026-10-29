import { describe, expect, test } from 'vitest'
import { RailGraph } from './graph.ts'
import { shortestRailRoute } from './route.ts'
import { snapToRail } from './snap.ts'
import type { RailEdge } from './tile.ts'

// 赤道附近經度 0.01 度約 1.112 km
const KM_PER_001 = 1.112

function edge(id: number, a: number, b: number, coords: [number, number][], extra: Partial<RailEdge> = {}): RailEdge {
  return { id, a, b, service: 0, tunnel: false, coords, ...extra }
}

function graphOf(...edges: RailEdge[]) {
  const graph = new RailGraph()
  graph.addEdges(edges)
  return graph
}

describe('鐵路網圖', () => {
  test('同一條邊出現在兩個網格時只算一次', () => {
    const e = edge(1, 10, 11, [[0, 0], [0.01, 0]])
    const graph = new RailGraph()
    graph.addEdges([e])
    graph.addEdges([{ ...e, coords: [...e.coords] }])
    expect(graph.edges.size).toBe(1)
    expect(graph.adjacency.get(10)).toEqual([1])
  })

  test('邊的長度依座標累計', () => {
    const graph = graphOf(edge(1, 10, 11, [[0, 0], [0.01, 0], [0.02, 0]]))
    expect(graph.edges.get(1)!.lengthKm).toBeCloseTo(2 * KM_PER_001, 2)
  })
})

describe('貼合', () => {
  const graph = graphOf(edge(1, 10, 11, [[0, 0], [0.02, 0]]))

  test('貼合點可以在邊的中間，距離為點到線段的垂直距離', () => {
    // 緯度 0.0009 度約 100 m
    const snap = snapToRail(graph, 0.0009, 0.01, 0.3)!
    expect(snap.edgeId).toBe(1)
    expect(snap.positionKm).toBeCloseTo(KM_PER_001, 2)
    expect(snap.distanceKm).toBeCloseTo(0.1, 2)
    expect(snap.point[0]).toBeCloseTo(0.01, 6)
  })

  test('超出範圍時回傳 null', () => {
    expect(snapToRail(graph, 0.01, 0.01, 0.3)).toBeNull()
  })

  test('選最近的邊', () => {
    const two = graphOf(edge(1, 10, 11, [[0, 0], [0.02, 0]]), edge(2, 20, 21, [[0, 0.002], [0.02, 0.002]]))
    expect(snapToRail(two, 0.0015, 0.01, 1)!.edgeId).toBe(2)
  })
})

describe('最短路徑', () => {
  test('主線與側線並存時走主線，回傳實際長度與路線名稱', () => {
    // 主線稍微繞路（約 2.27 km），側線是直線（約 2.22 km），側線成本 ×3
    const graph = graphOf(
      edge(1, 1, 4, [[0, 0], [0.01, 0.002]], { name: '本線' }),
      edge(2, 4, 2, [[0.01, 0.002], [0.02, 0]], { name: '本線' }),
      edge(3, 1, 2, [[0, 0], [0.02, 0]], { name: '側線', service: 1 }),
      edge(4, 2, 5, [[0.02, 0], [0.03, 0]], { name: '本線' }),
    )
    const from = snapToRail(graph, 0, 0, 0.1)!
    const to = snapToRail(graph, 0, 0.03, 0.1)!
    const route = shortestRailRoute(graph, from, to)!
    expect(route.routeNames).toEqual(['本線'])
    expect(route.coords).toContainEqual([0.01, 0.002])
    expect(route.lengthKm).toBeGreaterThan(3 * KM_PER_001)
  })

  test('從一條邊的中間出發，抵達另一條邊的中間', () => {
    const graph = graphOf(edge(1, 1, 2, [[0, 0], [0.02, 0]]), edge(2, 2, 3, [[0.02, 0], [0.04, 0]]))
    const from = snapToRail(graph, 0.0005, 0.01, 0.3)!
    const to = snapToRail(graph, -0.0005, 0.03, 0.3)!
    const route = shortestRailRoute(graph, from, to)!
    expect(route.lengthKm).toBeCloseTo(2 * KM_PER_001, 2)
    expect(route.coords[0][0]).toBeCloseTo(0.01, 6)
    expect(route.coords[route.coords.length - 1][0]).toBeCloseTo(0.03, 6)
    expect(route.coords).toContainEqual([0.02, 0])
  })

  test('兩點在同一條邊上時直接沿邊走，方向正確', () => {
    const graph = graphOf(edge(1, 1, 2, [[0, 0], [0.01, 0], [0.04, 0]]))
    const route = shortestRailRoute(graph, snapToRail(graph, 0, 0.03, 0.1)!, snapToRail(graph, 0, 0.005, 0.1)!)!
    expect(route.coords.map(([lon]) => Number(lon.toFixed(4)))).toEqual([0.03, 0.01, 0.005])
    expect(route.lengthKm).toBeCloseTo(2.5 * KM_PER_001, 2)
  })

  test('不相連時回傳 null', () => {
    const graph = graphOf(edge(1, 1, 2, [[0, 0], [0.01, 0]]), edge(2, 3, 4, [[0.05, 0], [0.06, 0]]))
    expect(shortestRailRoute(graph, snapToRail(graph, 0, 0.005, 0.1)!, snapToRail(graph, 0, 0.055, 0.1)!)).toBeNull()
  })
})

describe('相連的鐵路網', () => {
  test('只回傳彼此相連的邊', () => {
    const graph = graphOf(
      edge(1, 1, 2, [[0, 0], [0.01, 0]]),
      edge(2, 2, 3, [[0.01, 0], [0.02, 0]]),
      edge(3, 7, 8, [[0.05, 0], [0.06, 0]]),
    )
    expect([...graph.connectedEdges(1)].sort()).toEqual([1, 2])
    expect([...graph.connectedEdges(3)]).toEqual([3])
  })
})
