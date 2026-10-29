import type { RailEdge, ServiceClass } from '../../src/core/rail/tile.ts'
import type { OplWay } from './opl.ts'

export function serviceClass(service: string | undefined): ServiceClass {
  if (!service) return 0
  return service === 'siding' || service === 'crossover' ? 1 : 2
}

/** 在路口（被多條 way 共用，或在同一條 way 中重複出現的節點）把 way 切成邊 */
export function splitIntoEdges(ways: OplWay[]): RailEdge[] {
  const usage = new Map<number, number>()
  for (const way of ways) {
    for (const node of way.nodes) usage.set(node.id, (usage.get(node.id) ?? 0) + 1)
  }

  const edges: RailEdge[] = []
  for (const way of ways) {
    if (way.nodes.length < 2) continue
    const base = {
      service: serviceClass(way.tags.service),
      tunnel: way.tags.tunnel !== undefined && way.tags.tunnel !== 'no',
      name: way.tags.name,
    }
    let start = 0
    let part = 0
    for (let i = 1; i < way.nodes.length; i++) {
      const isLast = i === way.nodes.length - 1
      if (!isLast && (usage.get(way.nodes[i].id) ?? 0) < 2) continue
      const slice = way.nodes.slice(start, i + 1)
      const edge: RailEdge = {
        id: way.id * 4096 + part,
        a: slice[0].id,
        b: slice[slice.length - 1].id,
        service: base.service,
        tunnel: base.tunnel,
        coords: slice.map((n) => [n.lon, n.lat]),
      }
      if (base.name) edge.name = base.name
      edges.push(edge)
      start = i
      part++
    }
  }
  return edges
}
