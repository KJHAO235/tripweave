import { fillGapAlongFerry, type FerryFill } from './ferry'
import type { Airport } from './airports'
import { FLIGHT, flightAfterRail, flightByAirports, flightBySpeed, throughAirports, type FlightFill } from './flight'
import type { Gap } from './gaps'
import { fillGapAlongRail, type RailFill } from './rail/fill'
import type { RailGraph } from './rail/graph'
import type { Track } from './track'

/** 缺口的補齊結果，依交通方式分為鐵路、渡輪與飛機 */
export type GapFill = RailFill | FerryFill | FlightFill

/**
 * 依序判斷補齊方式：時速高到不可能是鐵路的飛機 → 鐵路 → 渡輪 → 起降前後或長距離的飛機
 * → 沒有時間資料、兩端都在機場附近的飛機；判斷為飛機後，兩端在機場附近時航線經過機場。
 * 鐵路與渡輪網只在需要時才取得（大部分缺口鐵路就能補齊，不必下載渡輪網格）；
 * 取得網格失敗時整個判斷中止並拋出錯誤，以免離線時把火車或渡輪判斷成飛機
 */
export async function decideFill(
  track: Track,
  gap: Gap,
  railGraph: () => Promise<RailGraph>,
  ferryGraph: () => Promise<RailGraph>,
  airports: () => Promise<readonly Airport[]> = async () => [],
): Promise<GapFill | null> {
  let flight = flightBySpeed(gap)
  if (!flight) {
    const ground = fillGapAlongRail(await railGraph(), track, gap) ?? fillGapAlongFerry(await ferryGraph(), gap)
    if (ground) return ground
    flight = flightAfterRail(track, gap)
  }
  // 機場資料只影響畫法與少數缺口的判斷，取得失敗時照原本方式補齊，不中止判斷
  const needAirports = flight || (gap.durationSec === undefined && gap.distanceKm >= FLIGHT.minAirportDistanceKm)
  if (!needAirports) return null
  const list = await airports().catch(() => [])
  flight ??= flightByAirports(gap, list)
  return flight && throughAirports(flight, gap, list)
}
