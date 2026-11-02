import { gpx, kml } from '@tmcw/togeojson'
import type { Feature, Geometry, Position } from 'geojson'
import type { Segment, Track, TrackPoint } from '../track'

/** 由呼叫端注入：瀏覽器用 DOMParser，測試用 xmldom。解析失敗時應丟出錯誤 */
export type ParseXml = (text: string) => Document

export type ImportErrorCode = 'unsupported-format' | 'corrupt' | 'no-track'

export type ImportResult =
  | { ok: true; track: Track }
  | { ok: false; code: ImportErrorCode; message: string }

export const SUPPORTED_FORMATS = ['KML', 'GPX'] as const

const ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  'unsupported-format': `不支援的檔案格式。支援的格式：${SUPPORTED_FORMATS.join('、')}`,
  corrupt: '檔案內容損毀或無法辨識，無法讀取',
  'no-track': '檔案中找不到軌跡',
}

type Format = 'kml' | 'gpx'

export function parseTrackFile(fileName: string, text: string, parseXml: ParseXml): ImportResult {
  if (!detectFormat(fileName, text)) return fail('unsupported-format')

  // GPX 結構單純，直接掃描文字比建立 XML 文件快數十倍
  if (/<gpx[\s>]/.test(text)) {
    const segments = scanGpx(text)
    if (segments) return toResult(fileName, segments)
  }

  let doc: Document
  try {
    doc = parseXml(text)
  } catch {
    return fail('corrupt')
  }
  return parseTrackDocument(fileName, doc)
}

/** 以 togeojson 解析已建立的 XML 文件；KML 與無法直接掃描的 GPX 走這條路 */
export function parseTrackDocument(fileName: string, doc: Document): ImportResult {
  if (doc.getElementsByTagName('parsererror').length > 0) return fail('corrupt')

  // 以實際內容的根元素決定解析方式，副檔名只用來初步篩選
  const root = doc.documentElement?.localName
  let features: Feature[]
  if (root === 'kml') features = kml(doc).features as Feature[]
  else if (root === 'gpx') features = selectGpxFeatures(gpx(doc).features)
  else return fail('corrupt')

  const segments = features.flatMap((feature) =>
    segmentsOf(feature.geometry, feature.properties?.coordinateProperties?.times),
  )
  return toResult(fileName, segments)
}

function toResult(fileName: string, rawSegments: Segment[]): ImportResult {
  const source = baseName(fileName)
  const segments = rawSegments.filter((segment) => segment.points.length > 0).map((segment) => ({ ...segment, source }))
  if (segments.length === 0) return fail('no-track')
  const hasTime = segments.every((segment) => segment.points.every((point) => point.time !== undefined))
  return { ok: true, track: { name: source, segments, hasTime } }
}

const POINT = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g
const LAT = /\blat\s*=\s*["']([^"']*)["']/
const LON = /\blon\s*=\s*["']([^"']*)["']/
const ELE = /<ele\b[^>]*>([^<]*)<\/ele\s*>/
const TIME = /<time\b[^>]*>([^<]*)<\/time\s*>/

/**
 * 直接掃描 GPX 文字，規則與 togeojson + selectGpxFeatures 相同：有 trk 時讀每個 trkseg，否則讀 rte；
 * 少於兩點的段落略過。掃不到任何點但文字中有點（例如帶命名空間前綴）時回傳 null，改用 togeojson
 */
function scanGpx(text: string): Segment[] | null {
  const blocks = /<trk[\s>]/.test(text)
    ? [...text.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg\s*>/g)].map((m) => m[1])
    : [...text.matchAll(/<rte\b[^>]*>([\s\S]*?)<\/rte\s*>/g)].map((m) => m[1])

  const segments: Segment[] = []
  for (const block of blocks) {
    const points: TrackPoint[] = []
    for (const [, , attrs, body] of block.matchAll(POINT)) {
      const lat = Number(LAT.exec(attrs)?.[1])
      const lon = Number(LON.exec(attrs)?.[1])
      if (!isValidCoordinate(lat, lon)) continue
      const point: TrackPoint = { lat, lon }
      const eleText = body ? ELE.exec(body)?.[1] : undefined
      const ele = eleText?.trim() ? Number(eleText) : NaN
      if (Number.isFinite(ele)) point.ele = ele
      const time = Date.parse((body ? TIME.exec(body)?.[1] : undefined) ?? '')
      if (Number.isFinite(time)) point.time = time
      points.push(point)
    }
    if (points.length >= 2) segments.push({ points })
  }

  if (segments.length === 0 && /trkpt|rtept/.test(text) && !/<(trkpt|rtept)\b/.test(text)) return null
  return segments
}

function detectFormat(fileName: string, text: string): Format | null {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'kml' || ext === 'gpx') return ext
  // 沒有可辨識的副檔名時，看內容開頭是不是 KML / GPX 的 XML
  const head = text.slice(0, 2000)
  if (!head.trimStart().startsWith('<')) return null
  if (/<kml[\s>]/.test(head)) return 'kml'
  if (/<gpx[\s>]/.test(head)) return 'gpx'
  return null
}

/** GPX 以 trk 為主；沒有 trk 時才使用 rte。wpt 是單點，不算軌跡 */
function selectGpxFeatures(features: Feature[]): Feature[] {
  const tracks = features.filter((f) => f.properties?._gpxType === 'trk')
  return tracks.length > 0 ? tracks : features.filter((f) => f.properties?._gpxType === 'rte')
}

function segmentsOf(geometry: Geometry | null, times: unknown): Segment[] {
  if (!geometry) return []
  switch (geometry.type) {
    case 'LineString':
      return [toSegment(geometry.coordinates, times)]
    case 'MultiLineString':
      return geometry.coordinates.map((line, i) => toSegment(line, alignedTimes(times, geometry.coordinates.length, i)))
    case 'GeometryCollection':
      return geometry.geometries.flatMap((child, i) =>
        child.type === 'LineString'
          ? [toSegment(child.coordinates, alignedTimes(times, geometry.geometries.length, i))]
          : segmentsOf(child, undefined),
      )
    default:
      return []
  }
}

/** 多條線的時間是「每條線一組」；組數對不上時無法確定對應關係，整組捨棄 */
function alignedTimes(times: unknown, lineCount: number, index: number): unknown {
  return Array.isArray(times) && times.length === lineCount ? times[index] : undefined
}

function toSegment(coordinates: Position[], times: unknown): Segment {
  const usableTimes = Array.isArray(times) && times.length === coordinates.length ? times : undefined
  const points: TrackPoint[] = []
  coordinates.forEach(([lon, lat, ele], i) => {
    if (!isValidCoordinate(lat, lon)) return
    const point: TrackPoint = { lat, lon }
    if (Number.isFinite(ele)) point.ele = ele
    const time = typeof usableTimes?.[i] === 'string' ? Date.parse(usableTimes[i]) : NaN
    if (Number.isFinite(time)) point.time = time
    points.push(point)
  })
  return { points }
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/** 去掉副檔名的檔名 */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

function fail(code: ImportErrorCode): ImportResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] }
}
