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
const SECONDS_PER_DAY = 30
const MIN_SECONDS = 25
const MAX_SECONDS = 120

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

/**
 * 一天約 30 秒、最少 25 秒、最多 120 秒。天數以時間跨度計算（每 24 小時一天，不受裝置時區影響）；
 * 沒有時間資料時以檔案數代替天數
 */
export function animationSeconds(track: Track): number {
  let first = Infinity
  let last = -Infinity
  for (const segment of track.segments) {
    for (const { time } of segment.points) {
      if (time === undefined) continue
      if (time < first) first = time
      if (time > last) last = time
    }
  }
  const days = Number.isFinite(first)
    ? Math.max(1, Math.ceil((last - first) / 86_400_000))
    : new Set(track.segments.map((s) => s.fileId ?? s.source)).size
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, days * SECONDS_PER_DAY))
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

export interface CameraPath {
  /** 取樣點的中心 [經度, 緯度]、縮放與朝向（度，北方為 0、順時針）；依進度平均分布 */
  centers: [number, number][]
  zooms: number[]
  bearings: number[]
}

/** 鏡頭每秒取樣次數 */
const CAMERA_SAMPLES_PER_SEC = 10
/** 中心取前後這麼多秒的平均，避免跟著 GPS 的小幅偏移與密集轉彎晃動 */
const CENTER_SMOOTH_SEC = 1.5
/** 縮放取前後這麼多秒的平均，避免一下拉遠一下拉近 */
const ZOOM_SMOOTH_SEC = 3
/** 前進方向取鏡頭中心前後這麼多秒的整體走向 */
const BEARING_SPAN_SEC = 10
/** 方向再取前後這麼多秒的平均：只跟著一整段路的大方向，不跟著每個轉彎轉 */
const BEARING_SMOOTH_SEC = 20
/** 畫面每秒最多轉這麼多度，避免頭暈 */
const MAX_TURN_DEG_PER_SEC = 5
/** 決定縮放時預設看「前 1 秒到後 4 秒」會經過的範圍；看得越短，鏡頭越近 */
const DEFAULT_ZOOM_WINDOW = { behindSec: 1, aheadSec: 4 }

function movingAverage(values: number[], radius: number): number[] {
  // 前綴和計算視窗平均；視窗在兩端自動縮短
  const prefix = [0]
  for (const v of values) prefix.push(prefix[prefix.length - 1] + v)
  return values.map((_, i) => {
    const a = Math.max(0, i - radius)
    const b = Math.min(values.length - 1, i + radius)
    return (prefix[b + 1] - prefix[a]) / (b - a + 1)
  })
}

/**
 * 預先算好整段動畫的鏡頭：中心是圓點位置的移動平均，縮放依附近會經過的範圍並再平滑。
 * zoomFor 由呼叫端提供（需要地圖畫面大小），回傳能完整顯示該範圍的縮放
 */
export function buildCameraPath(
  route: AnimationRoute,
  zoomFor: (bounds: [[number, number], [number, number]]) => number,
  zoomWindow: { behindSec: number; aheadSec: number } = DEFAULT_ZOOM_WINDOW,
): CameraPath {
  const count = Math.max(2, Math.round(route.durationSec * CAMERA_SAMPLES_PER_SEC) + 1)
  const positions = Array.from({ length: count }, (_, i) => frameAt(route, i / (count - 1))?.position ?? [0, 0])
  const rawZooms = positions.map((_, i) => {
    const p = i / (count - 1)
    const from = p - zoomWindow.behindSec / route.durationSec
    const bounds = boundsAhead(route, Math.max(0, from), zoomWindow.behindSec + zoomWindow.aheadSec)
    return bounds ? zoomFor(bounds) : 10
  })
  // 經度先展開再平均，跨換日線時才不會平均到地球另一側
  const lons: number[] = []
  for (const [lon] of positions) {
    let x = lon
    const prev = lons[lons.length - 1]
    if (prev !== undefined) {
      while (x - prev > 180) x -= 360
      while (x - prev < -180) x += 360
    }
    lons.push(x)
  }
  const centerRadius = Math.round(CENTER_SMOOTH_SEC * CAMERA_SAMPLES_PER_SEC)
  const smoothLons = movingAverage(lons, centerRadius)
  const smoothLats = movingAverage(
    positions.map((p) => p[1]),
    centerRadius,
  )
  const centers = smoothLons.map((lon, i): [number, number] => [lon, smoothLats[i]])
  return {
    centers,
    zooms: movingAverage(rawZooms, Math.round(ZOOM_SMOOTH_SEC * CAMERA_SAMPLES_PER_SEC)),
    bearings: smoothBearings(centers),
  }
}

/**
 * 依鏡頭中心的走向算出前進方向，再以單位向量平均（角度不能直接平均，359° 與 1° 的平均應為 0°）；
 * 停留不動時沿用前一個方向
 */
function smoothBearings(centers: [number, number][]): number[] {
  const span = Math.round(BEARING_SPAN_SEC * CAMERA_SAMPLES_PER_SEC)
  const xs: number[] = []
  const ys: number[] = []
  let last = { x: 0, y: 1 }
  centers.forEach((_, i) => {
    const [lon1, lat1] = centers[Math.max(0, i - span)]
    const [lon2, lat2] = centers[Math.min(centers.length - 1, i + span)]
    const dx = (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180)
    const dy = lat2 - lat1
    const length = Math.hypot(dx, dy)
    // 移動距離極小時（停留、或跳到下一段行程前）方向不可靠
    if (length > 1e-6) last = { x: dx / length, y: dy / length }
    xs.push(last.x)
    ys.push(last.y)
  })
  const radius = Math.round(BEARING_SMOOTH_SEC * CAMERA_SAMPLES_PER_SEC)
  const sx = movingAverage(xs, radius)
  const sy = movingAverage(ys, radius)
  const smoothed = sx.map((x, i) => (Math.atan2(x, sy[i]) * 180) / Math.PI)
  // 限制每個取樣間隔的轉動角度（走最短的方向）
  const maxStep = MAX_TURN_DEG_PER_SEC / CAMERA_SAMPLES_PER_SEC
  const limited = [smoothed[0]]
  for (let i = 1; i < smoothed.length; i++) {
    const prev = limited[i - 1]
    const diff = ((((smoothed[i] - prev) % 360) + 540) % 360) - 180
    limited.push(prev + Math.max(-maxStep, Math.min(maxStep, diff)))
  }
  return limited
}

/** 進度對應的鏡頭中心與縮放（在取樣點之間線性內插） */
export function cameraAt(path: CameraPath, progress: number): { center: [number, number]; zoom: number; bearing: number } {
  const last = path.centers.length - 1
  const x = Math.min(1, Math.max(0, progress)) * last
  const i = Math.min(last - 1, Math.floor(x))
  const t = x - i
  const [lon1, lat1] = path.centers[i]
  const [lon2, lat2] = path.centers[i + 1]
  return {
    center: [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t],
    zoom: path.zooms[i] + (path.zooms[i + 1] - path.zooms[i]) * t,
    // 角度走最短的方向內插（350° 到 10° 經過 0°）
    bearing: path.bearings[i] + ((((path.bearings[i + 1] - path.bearings[i]) % 360) + 540) % 360 - 180) * t,
  }
}
