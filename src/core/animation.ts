import type { GapFill } from './fill'
import type { Gap } from './gaps'
import { distanceKm } from './geo'
import type { Track } from './track'

/** 動畫中一段路線的畫法：實際記錄、推算（依交通方式）、未補齊的缺口；jump 是不同段行程之間，不畫 */
export type PieceMode = 'recorded' | GapFill['mode'] | 'gap' | 'jump'

export interface Piece {
  mode: PieceMode
  /** [經度, 緯度] */
  coords: [number, number][]
  /** 與 coords 對應的時間（epoch 毫秒），沒有時間資料時為 undefined */
  times: (number | undefined)[]
  /** 每個點從片段起點算起的累積距離（公里） */
  cumKm: number[]
  /** 在時間軸上占的份量（距離換算，長距離的推算段落會壓縮） */
  weight: number
}

export interface AnimationRoute {
  pieces: Piece[]
  /** 每個片段在時間軸上的起點（累積份量） */
  starts: number[]
  totalWeight: number
  durationSec: number
}

export interface AnimationFrame {
  pieceIndex: number
  position: [number, number]
  time?: number
  /** 目前片段已畫出的部分（含目前位置） */
  partial: [number, number][]
}

/** 動畫用的實際記錄最多保留這麼多點，iPhone 才能流暢重繪 */
const MAX_RECORDED_POINTS = 6000
/** 推算與缺口超過這個距離的部分壓縮成 1/10 的時間，長途飛機不會占掉大半動畫 */
const FULL_SPEED_KM = 30
const SECONDS_PER_DAY = 20
const MIN_SECONDS = 20
const MAX_SECONDS = 60

type Point = { lon: number; lat: number; time?: number }

function makePiece(mode: PieceMode, points: Point[]): Piece {
  const coords = points.map((p): [number, number] => [p.lon, p.lat])
  const cumKm = [0]
  for (let i = 1; i < points.length; i++) cumKm.push(cumKm[i - 1] + distanceKm(points[i - 1], points[i]))
  const km = cumKm[cumKm.length - 1]
  const weight =
    mode === 'jump' ? 0 : mode === 'recorded' ? km : Math.min(km, FULL_SPEED_KM) + Math.max(0, km - FULL_SPEED_KM) * 0.1
  return { mode, coords, times: points.map((p) => p.time), cumKm, weight }
}

/** 推算路段的座標沒有時間，依距離比例在缺口兩端的時間之間內插 */
function withTimes(coords: [number, number][], fromTime?: number, toTime?: number): Point[] {
  const points = coords.map(([lon, lat]) => ({ lon, lat }))
  if (fromTime === undefined || toTime === undefined) return points
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distanceKm(points[i - 1], points[i]))
  const total = cum[cum.length - 1] || 1
  return points.map((p, i) => ({ ...p, time: fromTime + ((toTime - fromTime) * cum[i]) / total }))
}

const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]

/** 依旅程順序把實際記錄、推算路段與缺口串成動畫路線；原始軌跡不會被修改 */
export function buildAnimationRoute(track: Track, gaps: Gap[], fills: ReadonlyMap<string, GapFill>): AnimationRoute {
  const gapAt = new Map(gaps.map((g) => [`${g.from.segment}:${g.from.index}`, g]))
  const totalPoints = track.segments.reduce((n, s) => n + s.points.length, 0)
  const recordedKm = estimateRecordedKm(track)
  // 點數太多時以最小點距抽稀（每段的起訖點一定保留）
  const minSpacingKm = totalPoints > MAX_RECORDED_POINTS ? recordedKm / MAX_RECORDED_POINTS : 0

  const pieces: Piece[] = []
  let run: Point[] = []
  const flush = () => {
    if (run.length >= 2) pieces.push(makePiece('recorded', run))
    run = []
  }

  track.segments.forEach((segment, s) => {
    segment.points.forEach((point, i) => {
      const last = run[run.length - 1]
      const isEnd = i === segment.points.length - 1
      if (!last || isEnd || distanceKm(last, point) >= minSpacingKm || gapAt.has(`${s}:${i}`)) run.push(point)

      const gap = gapAt.get(`${s}:${i}`)
      if (!gap) return
      flush()
      const toPoint = track.segments[gap.to.segment].points[gap.to.index]
      const fromEnd: [number, number] = [point.lon, point.lat]
      const toEnd: [number, number] = [toPoint.lon, toPoint.lat]
      const fill = fills.get(gap.id)
      if (!fill) {
        pieces.push(makePiece('gap', [point, toPoint]))
      } else {
        // 離路線較遠的一端（例如下車後才恢復 GPS）維持缺口樣式，不畫成推算
        const before = fill.remainders.find((r) => same(r[0], fromEnd))
        const after = fill.remainders.find((r) => same(r[1], toEnd))
        if (before) pieces.push(makePiece('gap', withTimes(before, point.time, point.time)))
        pieces.push(makePiece(fill.mode, withTimes(fill.path, point.time, toPoint.time)))
        if (after) pieces.push(makePiece('gap', withTimes(after, toPoint.time, toPoint.time)))
      }
      run = []
    })
    // 段落之間沒有缺口（銜接很近，或相隔太久的不同段行程）：直接跳到下一段，不畫連線
    const next = track.segments[s + 1]?.points[0]
    const end = segment.points[segment.points.length - 1]
    if (next && !gapAt.has(`${s}:${segment.points.length - 1}`)) {
      flush()
      pieces.push(makePiece('jump', [end, next]))
    }
  })
  flush()

  const starts: number[] = []
  let totalWeight = 0
  for (const piece of pieces) {
    starts.push(totalWeight)
    totalWeight += piece.weight
  }
  return { pieces, starts, totalWeight, durationSec: animationSeconds(track) }
}

function estimateRecordedKm(track: Track): number {
  let km = 0
  for (const segment of track.segments) {
    for (let i = 1; i < segment.points.length; i++) km += distanceKm(segment.points[i - 1], segment.points[i])
  }
  return km
}

/** 一天約 20 秒、最少 20 秒、最多 60 秒；沒有時間資料時以檔案數代替天數 */
export function animationSeconds(track: Track): number {
  const days = new Set<string>()
  for (const segment of track.segments) {
    for (const { time } of segment.points) {
      if (time !== undefined) days.add(new Date(time).toDateString())
    }
  }
  const count = days.size || new Set(track.segments.map((s) => s.fileId ?? s.source)).size
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, count * SECONDS_PER_DAY))
}

/** 進度（0–1）對應的位置、時間與目前片段已畫出的部分 */
export function frameAt(route: AnimationRoute, progress: number): AnimationFrame | null {
  const { pieces, starts, totalWeight } = route
  if (pieces.length === 0) return null
  const target = Math.min(1, Math.max(0, progress)) * totalWeight
  // 找到目前所在的片段（跳過份量為 0 的 jump）
  let k = pieces.length - 1
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].weight > 0 && target <= starts[i] + pieces[i].weight) {
      k = i
      break
    }
  }
  const piece = pieces[k]
  const fraction = piece.weight > 0 ? Math.min(1, Math.max(0, (target - starts[k]) / piece.weight)) : 1
  const km = fraction * piece.cumKm[piece.cumKm.length - 1]
  let j = 1
  while (j < piece.cumKm.length - 1 && piece.cumKm[j] < km) j++
  const segKm = piece.cumKm[j] - piece.cumKm[j - 1]
  const t = segKm > 0 ? (km - piece.cumKm[j - 1]) / segKm : 1
  const [lon1, lat1] = piece.coords[j - 1]
  const [lon2, lat2] = piece.coords[j]
  const position: [number, number] = [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t]
  const t1 = piece.times[j - 1]
  const t2 = piece.times[j]
  const time = t1 !== undefined && t2 !== undefined ? t1 + (t2 - t1) * t : (t1 ?? t2)
  return { pieceIndex: k, position, time, partial: [...piece.coords.slice(0, j), position] }
}

/** 從某個進度往後 seconds 秒會經過的範圍，用來決定鏡頭縮放 */
export function boundsAhead(route: AnimationRoute, progress: number, seconds: number): [[number, number], [number, number]] | null {
  const steps = 12
  const coords: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const frame = frameAt(route, progress + (seconds / route.durationSec) * (i / steps))
    if (frame) coords.push(frame.position)
  }
  if (coords.length === 0) return null
  const lons = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ]
}
