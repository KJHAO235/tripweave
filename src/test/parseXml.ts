import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import { parseTrackFile, type ParseXml } from '../core/parse/trackFile'
import type { Track } from '../core/track'

// xmldom 遇到格式錯誤時會丟出 ParseError，行為與瀏覽器端注入的函式一致
export const parseXmlForTest: ParseXml = (text) =>
  new DOMParser({ onError: () => {} }).parseFromString(text, 'text/xml') as unknown as Document

export function loadTestTrack(fileName: string): Track {
  const text = readFileSync(join(import.meta.dirname, '../../test-data', fileName), 'utf8')
  const result = parseTrackFile(fileName, text, parseXmlForTest)
  if (!result.ok) throw new Error(`無法載入測試資料 ${fileName}：${result.message}`)
  return result.track
}

/**
 * El Nido 船程挖掉中段（第 1501–4999 點，直線約 32 km）模擬沒錄到的渡輪航段：
 * 起點離 OSM 航線約 0.17 km；終點離「El Nido – Coron」約 2.4 km、離幾乎重疊的「Sibaltan - Coron」約 0.4 km
 */
export function carvedElNidoTrack(): Track {
  const track = loadTestTrack('relive-elnido-2025-01-26.gpx')
  const points = track.segments[0].points
  return { ...track, segments: [{ ...track.segments[0], points: [...points.slice(0, 1501), ...points.slice(5000)] }] }
}
