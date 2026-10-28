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

  let doc: Document
  try {
    doc = parseXml(text)
  } catch {
    return fail('corrupt')
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return fail('corrupt')

  // 以實際內容的根元素決定解析方式，副檔名只用來初步篩選
  const root = doc.documentElement?.localName
  let features: Feature[]
  if (root === 'kml') features = kml(doc).features as Feature[]
  else if (root === 'gpx') features = selectGpxFeatures(gpx(doc).features)
  else return fail('corrupt')

  const segments = features
    .flatMap((feature) => segmentsOf(feature.geometry, feature.properties?.coordinateProperties?.times))
    .filter((segment) => segment.points.length > 0)
  if (segments.length === 0) return fail('no-track')

  const hasTime = segments.every((segment) => segment.points.every((point) => point.time !== undefined))
  return { ok: true, track: { name: baseName(fileName), segments, hasTime } }
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

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

function fail(code: ImportErrorCode): ImportResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] }
}
