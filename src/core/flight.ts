import type { Gap, PointRef } from './gaps'
import { nearestAirport, type Airport } from './airports'
import { distanceKm, type LatLon } from './geo'
import type { Track } from './track'

/** 飛機判斷的門檻；依 Coron 航程與新幹線缺口的實測訂定 */
export const FLIGHT = {
  /** 高於所有營運中高鐵的平均時速，可直接判斷為飛機 */
  certainSpeedKmh: 350,
  /** 短缺口的平均時速受 GPS 誤差影響很大（新幹線上 1.5 km、14 秒就有 382 km/h），太短的不直接判斷 */
  certainMinKm: 10,
  /** 起降前後較慢的缺口：缺口本身至少這個時速 */
  minSpeedKmh: 150,
  /** 起降前後較慢的缺口：前或後的實際記錄至少這個時速 */
  nearbySpeedKmh: 200,
  /** 前後實際記錄往外取多少秒 */
  nearbySpanSec: 60,
  /** 鐵路補不了、超過這個直線距離的缺口視為飛機 */
  minDistanceKm: 300,
  /** 沒有時間資料、兩端都在機場附近時，這個距離以上視為飛機 */
  minAirportDistanceKm: 100,
  /** 大圓航線的點距 */
  pathStepKm: 50,
  maxPathPoints: 200,
} as const

export type FlightBasis =
  | { kind: 'speed'; speedKmh: number }
  | { kind: 'distance'; distanceKm: number }
  /** 沒有時間資料、兩端都在機場附近 */
  | { kind: 'airports'; distanceKm: number }

export interface FlightFill {
  gapId: string
  mode: 'flight'
  /** 大圓航線 [經度, 緯度]；經度依前一點展開，跨換日線時可能超出 ±180 */
  path: [number, number][]
  lengthKm: number
  /** 飛機缺口整段都是推算，沒有殘留的缺口 */
  remainders: []
  basis: FlightBasis
  /** 缺口兩端 10 km 內的機場；航線經過這些機場 */
  airports?: { from?: Airport; to?: Airport }
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

/** 兩點之間的大圓航線，以球面線性插值每約 50 km 取一點 */
export function greatCirclePath(from: LatLon, to: LatLon): [number, number][] {
  const totalKm = distanceKm(from, to)
  const steps = Math.min(FLIGHT.maxPathPoints - 1, Math.max(1, Math.ceil(totalKm / FLIGHT.pathStepKm)))
  const toVector = ({ lat, lon }: LatLon) => [
    Math.cos(toRadians(lat)) * Math.cos(toRadians(lon)),
    Math.cos(toRadians(lat)) * Math.sin(toRadians(lon)),
    Math.sin(toRadians(lat)),
  ]
  const a = toVector(from)
  const b = toVector(to)
  const angle = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))

  const path: [number, number][] = [[from.lon, from.lat]]
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const wa = Math.sin((1 - t) * angle) / Math.sin(angle)
    const wb = Math.sin(t * angle) / Math.sin(angle)
    const [x, y, z] = [0, 1, 2].map((k) => wa * a[k] + wb * b[k])
    path.push([toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.hypot(x, y)))])
  }
  path.push([to.lon, to.lat])

  // 經度依前一點展開，MapLibre 才會走換日線那一側而不是繞過整個地球
  for (let i = 1; i < path.length; i++) {
    let lon = path[i][0]
    while (lon - path[i - 1][0] > 180) lon -= 360
    while (lon - path[i - 1][0] < -180) lon += 360
    path[i][0] = lon
  }
  return path
}

/** 從缺口一端往外（direction -1 往前、1 往後）約 60 秒實際記錄的平均時速；沒有時間資料時為 undefined */
export function recordedSpeedNear(track: Track, ref: PointRef, direction: -1 | 1): number | undefined {
  const points = track.segments[ref.segment].points
  const start = points[ref.index]
  if (start.time === undefined) return undefined
  let travelled = 0
  let elapsedSec = 0
  for (let i = ref.index + direction; i >= 0 && i < points.length; i += direction) {
    const time = points[i].time
    if (time === undefined) break
    const sec = Math.abs(time - start.time) / 1000
    if (sec > FLIGHT.nearbySpanSec) break
    travelled += distanceKm(points[i - direction], points[i])
    elapsedSec = sec
  }
  return elapsedSec > 0 ? travelled / (elapsedSec / 3600) : undefined
}

function flightFill(gap: Gap, basis: FlightBasis): FlightFill {
  return {
    gapId: gap.id,
    mode: 'flight',
    path: greatCirclePath(gap.from, gap.to),
    lengthKm: gap.distanceKm,
    remainders: [],
    basis,
  }
}

/** 時速高到不可能是鐵路時直接判斷為飛機，不必嘗試鐵路 */
export function flightBySpeed(gap: Gap): FlightFill | null {
  if (gap.speedKmh === undefined || gap.speedKmh < FLIGHT.certainSpeedKmh || gap.distanceKm < FLIGHT.certainMinKm) return null
  return flightFill(gap, { kind: 'speed', speedKmh: gap.speedKmh })
}

/**
 * 鐵路補不了時再判斷：起降前後（缺口本身夠快、前後記錄也在高速移動），
 * 或鐵路補不了的長距離缺口（例如落在兩天檔案之間的航段）
 */
export function flightAfterRail(track: Track, gap: Gap): FlightFill | null {
  if (gap.speedKmh !== undefined && gap.speedKmh >= FLIGHT.minSpeedKmh) {
    const nearby = Math.max(recordedSpeedNear(track, gap.from, -1) ?? 0, recordedSpeedNear(track, gap.to, 1) ?? 0)
    if (nearby >= FLIGHT.nearbySpeedKmh) return flightFill(gap, { kind: 'speed', speedKmh: gap.speedKmh })
  }
  if (gap.distanceKm >= FLIGHT.minDistanceKm) return flightFill(gap, { kind: 'distance', distanceKm: gap.distanceKm })
  return null
}

/**
 * 鐵路、渡輪都補不了、也不符合其他飛機規則時：沒有時間資料、距離 ≥ 100 km，
 * 且兩端都在機場附近，判斷為飛機（例如 Google 我的地圖匯出的短程航班）
 */
export function flightByAirports(gap: Gap, airports: readonly Airport[]): FlightFill | null {
  if (gap.durationSec !== undefined || gap.distanceKm < FLIGHT.minAirportDistanceKm) return null
  if (!nearestAirport(airports, gap.from) || !nearestAirport(airports, gap.to)) return null
  return flightFill(gap, { kind: 'airports', distanceKm: gap.distanceKm })
}

/**
 * 兩端在機場 10 km 內時，航線改為經過機場：缺口起點 → 起點機場 → 大圓航線 → 終點機場 → 缺口終點；
 * 沒有對到機場的一端照舊從端點畫起
 */
export function throughAirports(fill: FlightFill, gap: Gap, airports: readonly Airport[]): FlightFill {
  const from = nearestAirport(airports, gap.from) ?? undefined
  const to = nearestAirport(airports, gap.to) ?? undefined
  if (!from && !to) return fill
  const path: [number, number][] = [
    [gap.from.lon, gap.from.lat],
    ...greatCirclePath(from ?? gap.from, to ?? gap.to),
    [gap.to.lon, gap.to.lat],
  ]
  // 經度依前一點展開，並去掉相鄰重複點（端點沒對到機場時，起點會重複）
  const unwrapped: [number, number][] = []
  for (const [lon, lat] of path) {
    const prev = unwrapped.at(-1)
    let x = lon
    if (prev) {
      while (x - prev[0] > 180) x -= 360
      while (x - prev[0] < -180) x += 360
      if (Math.abs(x - prev[0]) < 1e-9 && Math.abs(lat - prev[1]) < 1e-9) continue
    }
    unwrapped.push([x, lat])
  }
  let lengthKm = 0
  for (let i = 1; i < unwrapped.length; i++) {
    lengthKm += distanceKm({ lon: unwrapped[i - 1][0], lat: unwrapped[i - 1][1] }, { lon: unwrapped[i][0], lat: unwrapped[i][1] })
  }
  return { ...fill, path: unwrapped, lengthKm, airports: { from, to } }
}
