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
