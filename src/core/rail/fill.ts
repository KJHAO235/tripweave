import type { Gap, PointRef } from '../gaps.ts'
import { distanceKm } from '../geo.ts'
import type { Track } from '../track.ts'
import { toLatLon, type RailGraph } from './graph.ts'
import { shortestRailRoute, type RailRoute } from './route.ts'
import { snapCandidates, snapToRail, type RailSnap } from './snap.ts'
import { tilesForBounds, type TileKey } from './tile.ts'

/** 補路判斷的門檻；數值依苫小牧到札幌的實測與一般 GPS 誤差訂定 */
export const RAIL_FILL = {
  /** 端點離鐵路多近算「在鐵路上」 */
  onRailKm: 0.3,
  /** 另一端（例如下車後才恢復 GPS）最遠可離鐵路多遠 */
  offRailMaxKm: 3,
  /** 複線等平行軌道：比最近的軌道遠不到這個距離的也一併考慮 */
  parallelTrackKm: 0.05,
  /** 搭乘證據：檢查端點往外多長的實際記錄 */
  evidenceSpanKm: 2,
  /** 搭乘證據：記錄點離鐵路多近算貼著鐵路 */
  evidenceNearKm: 0.08,
  /** 搭乘證據：貼著鐵路的記錄點比例 */
  evidenceRatio: 0.7,
  /** 沿鐵路長度最多為直線距離的幾倍 */
  maxDetourRatio: 2.5,
  minSpeedKmh: 10,
  maxSpeedKmh: 400,
  /** 超過這個直線距離的缺口不補（多半是飛機） */
  maxGapKm: 300,
  bufferMinKm: 5,
  bufferRatio: 0.3,
} as const

export interface RailFill {
  gapId: string
  mode: 'rail'
  /** 沿鐵路的推算路段 [經度, 緯度] */
  path: [number, number][]
  lengthKm: number
  routeNames: string[]
  /** 沒有補到、仍以缺口樣式顯示的部分（離鐵路較遠的一端，例如下車後才恢復 GPS） */
  remainders: [[number, number], [number, number]][]
}

/** 補這個缺口需要的網格；缺口太長時回傳 null */
export function tilesForGap(gap: Gap): TileKey[] | null {
  if (gap.distanceKm > RAIL_FILL.maxGapKm) return null
  const bufferKm = Math.max(RAIL_FILL.bufferMinKm, gap.distanceKm * RAIL_FILL.bufferRatio)
  const midLat = (gap.from.lat + gap.to.lat) / 2
  const dLat = bufferKm / 111
  const dLon = bufferKm / (111 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)))
  return tilesForBounds(
    Math.min(gap.from.lat, gap.to.lat) - dLat,
    Math.min(gap.from.lon, gap.to.lon) - dLon,
    Math.max(gap.from.lat, gap.to.lat) + dLat,
    Math.max(gap.from.lon, gap.to.lon) + dLon,
  )
}

/**
 * 從缺口一端往外（direction -1 往前、1 往後）取約 2 km 的實際記錄點，
 * 判斷是否大多貼著鐵路
 */
export function hasRidingEvidence(graph: RailGraph, track: Track, ref: PointRef, direction: -1 | 1): boolean {
  const points = track.segments[ref.segment].points
  let near = 0
  let total = 0
  let travelled = 0
  for (let i = ref.index; i >= 0 && i < points.length; i += direction) {
    if (i !== ref.index) travelled += distanceKm(points[i - direction], points[i])
    if (travelled > RAIL_FILL.evidenceSpanKm) break
    total++
    if (snapToRail(graph, points[i].lat, points[i].lon, RAIL_FILL.evidenceNearKm)) near++
  }
  return total >= 2 && near / total >= RAIL_FILL.evidenceRatio
}

/** 判斷缺口是否為搭乘鐵路，若是就沿鐵路補齊；不符合任何條件時回傳 null */
export function fillGapAlongRail(graph: RailGraph, track: Track, gap: Gap): RailFill | null {
  const ridingSnap = (ref: PointRef, direction: -1 | 1) => {
    const snap = snapToRail(graph, ref.lat, ref.lon, RAIL_FILL.onRailKm)
    return snap && hasRidingEvidence(graph, track, ref, direction) ? snap : null
  }
  const anchor = ridingSnap(gap.from, -1) ?? ridingSnap(gap.to, 1)
  if (!anchor) return null

  // 兩端都只貼到與搭乘端相連的鐵路網，避免貼到旁邊不相連的線（例如地下鐵）
  const network = graph.connectedEdges(anchor.edgeId)
  const candidates = (ref: PointRef) =>
    snapCandidates(graph, ref.lat, ref.lon, RAIL_FILL.offRailMaxKm, network, RAIL_FILL.parallelTrackKm)

  // 複線的上下行是兩條軌道，挑兩端組合中最短的路徑，避免繞到渡線再折返
  let best: { route: RailRoute; fromSnap: RailSnap; toSnap: RailSnap } | null = null
  for (const fromSnap of candidates(gap.from)) {
    for (const toSnap of candidates(gap.to)) {
      const route = shortestRailRoute(graph, fromSnap, toSnap)
      if (route && (!best || route.lengthKm < best.route.lengthKm)) best = { route, fromSnap, toSnap }
    }
  }
  if (!best) return null
  const { route, fromSnap, toSnap } = best

  const straightKm = distanceKm(toLatLon(fromSnap.point), toLatLon(toSnap.point))
  if (route.lengthKm > Math.max(straightKm * RAIL_FILL.maxDetourRatio, 1)) return null

  if (gap.durationSec !== undefined && gap.durationSec > 0) {
    const speed = route.lengthKm / (gap.durationSec / 3600)
    if (speed < RAIL_FILL.minSpeedKmh || speed > RAIL_FILL.maxSpeedKmh) return null
  }

  // 端點在鐵路上時，與鐵路之間的差距視為 GPS 誤差，併入推算路段；
  // 離鐵路較遠的一端（下車後才恢復 GPS）不知道怎麼移動的，維持缺口
  const fromEnd: [number, number] = [gap.from.lon, gap.from.lat]
  const toEnd: [number, number] = [gap.to.lon, gap.to.lat]
  const fromOnRail = fromSnap.distanceKm <= RAIL_FILL.onRailKm
  const toOnRail = toSnap.distanceKm <= RAIL_FILL.onRailKm
  const path = [...(fromOnRail ? [fromEnd] : []), ...route.coords, ...(toOnRail ? [toEnd] : [])]
  const remainders: RailFill['remainders'] = []
  if (!fromOnRail) remainders.push([fromEnd, fromSnap.point])
  if (!toOnRail) remainders.push([toSnap.point, toEnd])

  return { gapId: gap.id, mode: 'rail', path, lengthKm: route.lengthKm, routeNames: route.routeNames, remainders }
}
