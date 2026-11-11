import { fillGapAlongFerry, type FerryFill } from './ferry'
import { flightAfterRail, flightBySpeed, type FlightFill } from './flight'
import type { Gap } from './gaps'
import { fillGapAlongRail, type RailFill } from './rail/fill'
import type { RailGraph } from './rail/graph'
import type { Track } from './track'

/** 缺口的補齊結果，依交通方式分為鐵路、渡輪與飛機 */
export type GapFill = RailFill | FerryFill | FlightFill

/**
 * 依序判斷補齊方式：時速高到不可能是鐵路的飛機 → 鐵路 → 渡輪 → 起降前後或長距離的飛機。
 * 鐵路與渡輪網只在需要時才取得（大部分缺口鐵路就能補齊，不必下載渡輪網格）；
 * 取得網格失敗時整個判斷中止並拋出錯誤，以免離線時把火車或渡輪判斷成飛機
 */
export async function decideFill(
  track: Track,
  gap: Gap,
  railGraph: () => Promise<RailGraph>,
  ferryGraph: () => Promise<RailGraph>,
): Promise<GapFill | null> {
  return (
    flightBySpeed(gap) ??
    fillGapAlongRail(await railGraph(), track, gap) ??
    fillGapAlongFerry(await ferryGraph(), gap) ??
    flightAfterRail(track, gap)
  )
}
