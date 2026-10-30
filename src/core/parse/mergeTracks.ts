import type { Track } from '../track'
import { parseTrackFile, type ImportResult, type ParseXml } from './trackFile'

export interface ImportFailure {
  name: string
  message: string
}

export interface MultiImportResult {
  /** 沒有任何檔案成功時為 null */
  track: Track | null
  failures: ImportFailure[]
}

const byFileName = new Intl.Collator('zh-Hant', { numeric: true }).compare

/** 合併多個檔案各自的解析結果；成功的檔案依時間（或檔名）排序後串接成一趟旅程 */
export function combineImports(results: { name: string; result: ImportResult }[]): MultiImportResult {
  const failures: ImportFailure[] = []
  const tracks: Track[] = []
  for (const { name, result } of results) {
    if (result.ok) tracks.push(result.track)
    else failures.push({ name, message: result.message })
  }
  return { track: tracks.length > 0 ? mergeTracks(tracks) : null, failures }
}

export function parseTrackFiles(files: { name: string; text: string }[], parseXml: ParseXml): MultiImportResult {
  return combineImports(files.map(({ name, text }) => ({ name, result: parseTrackFile(name, text, parseXml) })))
}

/**
 * 所有檔案都有時間時依第一個點的時間排序，否則依檔名的自然順序（Day2 在 Day10 前）；
 * 不依賴使用者在選擇器裡的點選順序
 */
export function mergeTracks(tracks: Track[]): Track {
  if (tracks.length === 1) return tracks[0]
  const allTimed = tracks.every((t) => t.hasTime)
  const sorted = [...tracks].sort((a, b) =>
    allTimed ? startTime(a) - startTime(b) : byFileName(a.name ?? '', b.name ?? ''),
  )
  return {
    name: `${tracks.length} 個檔案`,
    segments: sorted.flatMap((t) => t.segments),
    hasTime: allTimed,
  }
}

function startTime(track: Track): number {
  return track.segments[0]?.points[0]?.time ?? Infinity
}
