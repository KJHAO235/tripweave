import { formatDateRange } from './format'
import { mergeTracks, type ImportFailure } from './parse/mergeTracks'
import { baseName, type ImportResult } from './parse/trackFile'
import { countPoints, type Track } from './track'

/** 旅程中的一個檔案：解析後的軌跡加上在旅程中的 id */
export interface TripFile {
  id: string
  /** 原始檔名（含副檔名） */
  name: string
  track: Track
}

export interface FileSummary {
  pointCount: number
  firstTime?: number
  lastTime?: number
}

/** 把旅程中的檔案合併成一條軌跡；每個段落標上所屬檔案的 id。沒有檔案時回傳 null */
export function buildTrack(files: TripFile[]): Track | null {
  if (files.length === 0) return null
  return mergeTracks(
    files.map(({ id, track }) => ({ ...track, segments: track.segments.map((segment) => ({ ...segment, fileId: id })) })),
  )
}

/** 合併後的檔案順序（依段落出現的先後） */
export function fileOrder(track: Track): string[] {
  return [...new Set(track.segments.map((s) => s.fileId).filter((id) => id !== undefined))]
}

/** 點數與最早、最晚的時間；沒有任何時間時不含時間欄位 */
export function fileSummary(track: Track): FileSummary {
  let first = Infinity
  let last = -Infinity
  for (const segment of track.segments) {
    for (const { time } of segment.points) {
      if (time === undefined) continue
      if (time < first) first = time
      if (time > last) last = time
    }
  }
  const summary: FileSummary = { pointCount: countPoints(track) }
  if (Number.isFinite(first)) {
    summary.firstTime = first
    summary.lastTime = last
  }
  return summary
}

const FINGERPRINT_SAMPLES = 32

/**
 * 內容指紋：段落數、點數，加上平均取樣的點座標與時間。只看軌跡內容、不看檔名，
 * 同一個檔案改名後仍視為相同
 */
export function fileFingerprint(track: Track): string {
  const points = track.segments.flatMap((segment) => segment.points)
  const parts = [`${track.segments.length}:${points.length}`]
  const step = Math.max(1, (points.length - 1) / (FINGERPRINT_SAMPLES - 1))
  for (let i = 0; i < Math.min(points.length, FINGERPRINT_SAMPLES); i++) {
    const { lat, lon, time } = points[Math.round(i * step)]
    parts.push(`${lat.toFixed(6)},${lon.toFixed(6)},${time ?? ''}`)
  }
  return parts.join('|')
}

/**
 * 工具列與旅程列表顯示的名稱：有自訂名稱用自訂名稱；否則單檔用檔名，
 * 多檔為「N 個檔案」並在有時間資料時加上日期範圍（與 tripLabel 規則相同，但只需檔案摘要）
 */
export function tripDisplayName(customName: string | undefined, files: { name: string; summary: FileSummary }[]): string {
  const custom = customName?.trim()
  if (custom) return custom
  if (files.length === 1) return baseName(files[0].name)
  return tripMeta(files)
}

/** 「N 個檔案」，有時間資料時加上日期範圍，例如「2 個檔案 · 2024/8/14–8/15」 */
export function tripMeta(files: { summary: FileSummary }[]): string {
  const label = `${files.length} 個檔案`
  const times = files.flatMap(({ summary }) => (summary.firstTime === undefined ? [] : [summary.firstTime, summary.lastTime!]))
  return times.length > 0 ? `${label} · ${formatDateRange(Math.min(...times), Math.max(...times))}` : label
}

export interface NewFile {
  name: string
  track: Track
  fingerprint: string
}

export interface AddFilesResult {
  added: NewFile[]
  /** 與旅程中已有檔案（或同一批中較早的檔案）內容相同而略過的檔名 */
  skipped: string[]
  failures: ImportFailure[]
}

/** 把選取的檔案分成要新增、內容重複略過與無法匯入三類 */
export function classifyNewFiles(
  existingFingerprints: Iterable<string>,
  results: { name: string; result: ImportResult }[],
): AddFilesResult {
  const seen = new Set(existingFingerprints)
  const out: AddFilesResult = { added: [], skipped: [], failures: [] }
  for (const { name, result } of results) {
    if (!result.ok) {
      out.failures.push({ name, message: result.message })
      continue
    }
    const fingerprint = fileFingerprint(result.track)
    if (seen.has(fingerprint)) {
      out.skipped.push(name)
      continue
    }
    seen.add(fingerprint)
    out.added.push({ name, track: result.track, fingerprint })
  }
  return out
}

const DAY_MS = 86_400_000

/**
 * 新檔案與旅程（其他檔案）的時間範圍相隔幾天：範圍重疊時為 0；
 * 任一方沒有時間資料時無法判斷，回傳 undefined
 */
export function daysApart(trip: FileSummary[], added: FileSummary): number | undefined {
  const timed = trip.filter((s) => s.firstTime !== undefined)
  if (timed.length === 0 || added.firstTime === undefined) return undefined
  const first = Math.min(...timed.map((s) => s.firstTime!))
  const last = Math.max(...timed.map((s) => s.lastTime!))
  const gapMs = Math.max(0, added.firstTime - last, first - added.lastTime!)
  return gapMs / DAY_MS
}

/** 「12 天」「約 5 個月」「約 2 年」 */
export function formatApart(days: number): string {
  if (days < 30) return `${Math.round(days)} 天`
  if (days < 365) return `約 ${Math.round(days / 30.44)} 個月`
  return `約 ${Math.round(days / 365.25)} 年`
}
