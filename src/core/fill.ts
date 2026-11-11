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
 * 鐵路與渡輪網只需包含這個缺口附近的網格；網格下載失敗時呼叫端不應呼叫此函式，
 * 以免離線時把火車或渡輪判斷成飛機
 */
export function decideFill(track: Track, gap: Gap, railGraph: RailGraph, ferryGraph: RailGraph): GapFill | null {
  return (
    flightBySpeed(gap) ??
    fillGapAlongRail(railGraph, track, gap) ??
    fillGapAlongFerry(ferryGraph, gap) ??
    flightAfterRail(track, gap)
  )
}
