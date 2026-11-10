import type { FlightFill } from './flight'
import type { RailFill } from './rail/fill'

/** 缺口的補齊結果，依交通方式分為鐵路與飛機 */
export type GapFill = RailFill | FlightFill
