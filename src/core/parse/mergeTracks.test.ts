import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseXmlForTest } from '../../test/parseXml'
import { formatDateRange } from '../format'
import { tripLabel } from '../track'
import { parseTrackFiles } from './mergeTracks'

const read = (name: string) => ({ name, text: readFileSync(`test-data/${name}`, 'utf8') })
const kml = (coords: string) =>
  `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><LineString><coordinates>${coords}</coordinates></LineString></Placemark></kml>`

describe('依時間排序合併', () => {
  test('8/15 先、8/14 後傳入時，合併結果 8/14 在前，共 2 段', () => {
    const { track, failures } = parseTrackFiles([read('relive-2024-08-15.gpx'), read('relive-2024-08-14.gpx')], parseXmlForTest)
    expect(failures).toEqual([])
    expect(track!.segments.map((s) => s.source)).toEqual(['relive-2024-08-14', 'relive-2024-08-15'])
    expect(track!.hasTime).toBe(true)
    expect(track!.name).toBe('2 個檔案')
  })

  test('只有一個檔案時維持原本的名稱', () => {
    const { track } = parseTrackFiles([read('relive-2024-08-14.gpx')], parseXmlForTest)
    expect(track!.name).toBe('relive-2024-08-14')
  })
})

describe('沒有時間資料時依檔名', () => {
  test('Day10 與 Day2 合併後 Day2 在前', () => {
    const { track } = parseTrackFiles(
      [
        { name: 'Day10.kml', text: kml('2,1 2,1.1') },
        { name: 'Day2.kml', text: kml('3,1 3,1.1') },
      ],
      parseXmlForTest,
    )
    expect(track!.segments.map((s) => s.source)).toEqual(['Day2', 'Day10'])
    expect(track!.hasTime).toBe(false)
  })

  test('KML 與 GPX 混用時（KML 沒有時間）依檔名排序', () => {
    const { track } = parseTrackFiles([read('relive-2024-08-14.gpx'), read('Day1+2.kml')], parseXmlForTest)
    expect(track!.segments.map((s) => s.source)).toEqual(['Day1+2', 'Day1+2', 'relive-2024-08-14'])
    expect(track!.hasTime).toBe(false)
  })
})

describe('部分失敗與全部失敗', () => {
  test('兩個 GPX 加一個 PDF：合併兩檔並回報 PDF 的原因', () => {
    const { track, failures } = parseTrackFiles(
      [read('relive-2024-08-14.gpx'), { name: 'ticket.pdf', text: '%PDF-1.4' }, read('relive-2024-08-15.gpx')],
      parseXmlForTest,
    )
    expect(track!.segments).toHaveLength(2)
    expect(failures).toEqual([{ name: 'ticket.pdf', message: expect.stringContaining('不支援的檔案格式') }])
  })

  test('兩個 PDF：沒有旅程，回報兩個失敗', () => {
    const { track, failures } = parseTrackFiles(
      [
        { name: 'a.pdf', text: '%PDF' },
        { name: 'b.pdf', text: '%PDF' },
      ],
      parseXmlForTest,
    )
    expect(track).toBeNull()
    expect(failures.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf'])
  })
})

describe('旅程名稱', () => {
  const range = (a: number, b: number) => formatDateRange(a, b, 'Asia/Taipei')
  test('單檔顯示檔名、兩檔顯示檔案數與日期範圍', () => {
    const one = parseTrackFiles([read('relive-2024-08-14.gpx')], parseXmlForTest).track!
    expect(tripLabel(one, range)).toBe('relive-2024-08-14')
    const two = parseTrackFiles([read('relive-2024-08-15.gpx'), read('relive-2024-08-14.gpx')], parseXmlForTest).track!
    expect(tripLabel(two, range)).toBe('2 個檔案 · 2024/8/14–8/15')
  })

  test('沒有時間資料時只顯示檔案數', () => {
    const track = parseTrackFiles(
      [
        { name: 'Day10.kml', text: kml('2,1 2,1.1') },
        { name: 'Day2.kml', text: kml('3,1 3,1.1') },
      ],
      parseXmlForTest,
    ).track!
    expect(tripLabel(track, range)).toBe('2 個檔案')
  })
})
