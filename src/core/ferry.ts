import type { Gap } from './gaps'
import { distanceKm } from './geo'
import { toLatLon, type RailGraph } from './rail/graph'
import { shortestRailRoute, type RailRoute } from './rail/route'
import { snapCandidates, type RailSnap } from './rail/snap'
import { tilesForBounds, type TileKey } from './rail/tile'

/** 渡輪判斷的門檻；渡輪航線網沿用鐵路的網格、建圖與最短路徑程式 */
export const FERRY = {
  /** 缺口兩端離航線多近才考慮（港口、碼頭通常離航線端點有一段距離） */
  snapKm: 3,
  /** 端點離航線超過這個距離時，該端以缺口樣式連到航線 */
  onRouteKm: 0.3,
  /** 沿航線長度最多為直線距離的幾倍 */
  maxDetourRatio: 2.5,
  minSpeedKmh: 5,
  maxSpeedKmh: 80,
  /** 過夜的長程渡輪也要涵蓋（鹿兒島—那霸約 700 km） */
  maxGapKm: 1500,
  bufferMinKm: 5,
  bufferRatio: 0.1,
} as const

export interface FerryFill {
  gapId: string
  mode: 'ferry'
  /** 沿航線的推算路段 [經度, 緯度] */
  path: [number, number][]
  lengthKm: number
  routeNames: string[]
  /** 離航線較遠的一端（例如碼頭）到航線之間，仍以缺口樣式顯示 */
  remainders: [[number, number], [number, number]][]
}

/** 判斷這個缺口需要的渡輪網格；缺口太長時回傳 null */
export function tilesForFerryGap(gap: Gap): TileKey[] | null {
  if (gap.distanceKm > FERRY.maxGapKm) return null
  const bufferKm = Math.max(FERRY.bufferMinKm, gap.distanceKm * FERRY.bufferRatio)
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
 * 缺口兩端都在同一個相連的渡輪航線網附近、沿航線距離與速度都合理時，沿航線補齊；
 * 否則回傳 null
 */
export function fillGapAlongFerry(graph: RailGraph, gap: Gap): FerryFill | null {
  const candidates = (lat: number, lon: number, network?: ReadonlySet<number>) =>
    snapCandidates(graph, lat, lon, FERRY.snapKm, network, FERRY.snapKm)

  // 港口常有多條航線交會，逐一嘗試兩端的組合，取「沿航線長度 + 兩端離航線距離」最短者
  let best: { route: RailRoute; fromSnap: RailSnap; toSnap: RailSnap; cost: number } | null = null
  for (const fromSnap of candidates(gap.from.lat, gap.from.lon)) {
    const network = graph.connectedEdges(fromSnap.edgeId)
    for (const toSnap of candidates(gap.to.lat, gap.to.lon, network)) {
      const route = shortestRailRoute(graph, fromSnap, toSnap)
      if (!route) continue
      const cost = route.lengthKm + fromSnap.distanceKm + toSnap.distanceKm
      if (!best || cost < best.cost) best = { route, fromSnap, toSnap, cost }
    }
  }
  if (!best) return null
  const { route, fromSnap, toSnap } = best

  const straightKm = distanceKm(toLatLon(fromSnap.point), toLatLon(toSnap.point))
  if (route.lengthKm > Math.max(straightKm * FERRY.maxDetourRatio, 1)) return null

  if (gap.durationSec !== undefined && gap.durationSec > 0) {
    const speed = route.lengthKm / (gap.durationSec / 3600)
    if (speed < FERRY.minSpeedKmh || speed > FERRY.maxSpeedKmh) return null
  }

  // 與鐵路相同：貼著航線的一端併入推算路段，較遠的一端（碼頭等）維持缺口
  const fromEnd: [number, number] = [gap.from.lon, gap.from.lat]
  const toEnd: [number, number] = [gap.to.lon, gap.to.lat]
  const fromOnRoute = fromSnap.distanceKm <= FERRY.onRouteKm
  const toOnRoute = toSnap.distanceKm <= FERRY.onRouteKm
  const path = [...(fromOnRoute ? [fromEnd] : []), ...route.coords, ...(toOnRoute ? [toEnd] : [])]
  const remainders: FerryFill['remainders'] = []
  if (!fromOnRoute) remainders.push([fromEnd, fromSnap.point])
  if (!toOnRoute) remainders.push([toSnap.point, toEnd])

  return { gapId: gap.id, mode: 'ferry', path, lengthKm: route.lengthKm, routeNames: route.routeNames, remainders }
}
