import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { loadTestTrack, parseXmlForTest } from '../test/parseXml'
import { parseTrackFile } from './parse/trackFile'
import { formatDateRange } from './format'
import { tripLabel, type Track } from './track'
import { buildTrack, classifyNewFiles, daysApart, fileFingerprint, fileOrder, fileSummary, formatApart, tripDisplayName, tripMeta, type TripFile } from './trip'

const day14 = loadTestTrack('relive-2024-08-14.gpx')
const day15 = loadTestTrack('relive-2024-08-15.gpx')
const file = (id: string, name: string, track: Track): TripFile => ({ id, name, track })
const parsed = (name: string, text: string) => ({ name, result: parseTrackFile(name, text, parseXmlForTest) })
const kml = (coords: string) =>
  `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><LineString><coordinates>${coords}</coordinates></LineString></Placemark></kml>`

describe('buildTrack', () => {
  test('8/15、8/14 傳入時順序為 8/14、8/15，段落標上所屬檔案', () => {
    const track = buildTrack([file('b', '8-15.gpx', day15), file('a', '8-14.gpx', day14)])!
    expect(fileOrder(track)).toEqual(['a', 'b'])
    expect(track.segments.every((s) => s.fileId === (s.source === 'relive-2024-08-14' ? 'a' : 'b'))).toBe(true)
  })

  test('不修改原本檔案的軌跡', () => {
    buildTrack([file('a', '8-14.gpx', day14)])
    expect(day14.segments[0].fileId).toBeUndefined()
  })

  test('沒有檔案時為 null', () => {
    expect(buildTrack([])).toBeNull()
  })
})

test('fileSummary：點數與首尾時間', () => {
  const summary = fileSummary(day14)
  expect(summary.pointCount).toBe(day14.segments.reduce((n, s) => n + s.points.length, 0))
  expect(new Date(summary.firstTime!).toISOString().slice(0, 10)).toBe('2024-08-14')
  expect(summary.lastTime).toBeGreaterThan(summary.firstTime!)
  const noTime = parseTrackFile('a.kml', kml('1,1 2,2'), parseXmlForTest)
  expect(noTime.ok && fileSummary(noTime.track)).toEqual({ pointCount: 2 })
})

describe('fileFingerprint', () => {
  const text = readFileSync('test-data/relive-2024-08-14.gpx', 'utf8')

  test('同一個 GPX 改檔名後指紋相同', () => {
    const renamed = parseTrackFile('另一個名字.gpx', text, parseXmlForTest)
    expect(renamed.ok && fileFingerprint(renamed.track)).toBe(fileFingerprint(day14))
  })

  test('8/14 與 8/15 指紋不同', () => {
    expect(fileFingerprint(day14)).not.toBe(fileFingerprint(day15))
  })

  test('KML 與 GPX 各自穩定', () => {
    expect(fileFingerprint(loadTestTrack('Day1+2.kml'))).toBe(fileFingerprint(loadTestTrack('Day1+2.kml')))
    expect(fileFingerprint(loadTestTrack('relive-2024-08-15.gpx'))).toBe(fileFingerprint(day15))
  })

  test('只差一個點的座標時指紋不同', () => {
    const a = parseTrackFile('a.kml', kml('1,1 2,2'), parseXmlForTest)
    const b = parseTrackFile('a.kml', kml('1,1 2,2.0001'), parseXmlForTest)
    expect(a.ok && b.ok && fileFingerprint(a.track) !== fileFingerprint(b.track)).toBe(true)
  })
})

describe('tripDisplayName', () => {
  const two = [
    { name: 'relive-2024-08-14.gpx', summary: fileSummary(day14) },
    { name: 'relive-2024-08-15.gpx', summary: fileSummary(day15) },
  ]

  test('有自訂名稱時用自訂名稱', () => {
    expect(tripDisplayName('北海道鐵道之旅', two)).toBe('北海道鐵道之旅')
  })

  test('清空或只有空白時回到自動名稱，與 tripLabel 相同', () => {
    const track = buildTrack([file('a', 'relive-2024-08-14.gpx', day14), file('b', 'relive-2024-08-15.gpx', day15)])!
    expect(tripDisplayName('', two)).toBe(tripLabel(track, formatDateRange))
    expect(tripDisplayName('', two)).toMatch(/^2 個檔案 · 2024\/8\/1[45]/)
    expect(tripDisplayName('  ', two)).toBe(tripDisplayName(undefined, two))
  })

  test('單檔時用不含副檔名的檔名', () => {
    expect(tripDisplayName(undefined, [two[0]])).toBe('relive-2024-08-14')
  })

  test('tripMeta：單檔也顯示檔案數與日期', () => {
    expect(tripMeta([two[0]])).toBe('1 個檔案 · 2024/8/14')
  })

  test('都沒有時間時只顯示檔案數', () => {
    expect(tripDisplayName(undefined, [{ name: 'a.kml', summary: { pointCount: 2 } }, { name: 'b.kml', summary: { pointCount: 3 } }])).toBe('2 個檔案')
  })

  test('兩個同名的不同檔案在合併軌跡中仍算 2 個檔案', () => {
    const a = parseTrackFile('Day1.kml', kml('1,1 1,1.1'), parseXmlForTest)
    const b = parseTrackFile('Day1.kml', kml('2,1 2,1.1'), parseXmlForTest)
    if (!a.ok || !b.ok) throw new Error('解析失敗')
    expect(tripLabel(buildTrack([file('a', 'Day1.kml', a.track), file('b', 'Day1.kml', b.track)])!, formatDateRange)).toBe('2 個檔案')
  })
})

describe('classifyNewFiles', () => {
  const read = (name: string) => readFileSync(`test-data/${name}`, 'utf8')

  test('旅程已有 8/14 時選取 8/14 與 8/15，只新增 8/15', () => {
    const result = classifyNewFiles(
      [fileFingerprint(day14)],
      [parsed('8-14.gpx', read('relive-2024-08-14.gpx')), parsed('8-15.gpx', read('relive-2024-08-15.gpx'))],
    )
    expect(result.added.map((f) => f.name)).toEqual(['8-15.gpx'])
    expect(result.skipped).toEqual(['8-14.gpx'])
    expect(result.failures).toEqual([])
  })

  test('同一批中選到兩次相同內容時只新增一次', () => {
    const text = read('relive-2024-08-15.gpx')
    const result = classifyNewFiles([], [parsed('a.gpx', text), parsed('b.gpx', text)])
    expect(result.added.map((f) => f.name)).toEqual(['a.gpx'])
    expect(result.skipped).toEqual(['b.gpx'])
  })

  test('無法匯入的檔案列為失敗', () => {
    const result = classifyNewFiles([], [parsed('a.pdf', '%PDF')])
    expect(result.failures).toEqual([{ name: 'a.pdf', message: expect.stringContaining('不支援') }])
  })
})

describe('daysApart 與 formatApart', () => {
  const at = (iso: string) => Date.parse(iso)
  const japan = [
    { pointCount: 1, firstTime: at('2024-08-14T00:00:00Z'), lastTime: at('2024-08-15T12:00:00Z') },
    { pointCount: 1, firstTime: at('2024-08-27T00:00:00Z'), lastTime: at('2024-08-28T12:00:00Z') },
  ]

  test('時間範圍重疊時為 0', () => {
    expect(daysApart(japan, { pointCount: 1, firstTime: at('2024-08-20T00:00:00Z'), lastTime: at('2024-08-20T10:00:00Z') })).toBe(0)
  })

  test('日本 8/28 與 El Nido 1/26 相隔約 151 天，寫成「約 5 個月」', () => {
    const days = daysApart(japan, { pointCount: 1, firstTime: at('2025-01-26T00:00:00Z'), lastTime: at('2025-01-26T08:00:00Z') })!
    expect(days).toBeCloseTo(150.5, 0)
    expect(formatApart(days)).toBe('約 5 個月')
  })

  test('早於旅程的檔案也計算間隔', () => {
    expect(daysApart(japan, { pointCount: 1, firstTime: at('2024-08-01T00:00:00Z'), lastTime: at('2024-08-02T00:00:00Z') })).toBeCloseTo(12, 5)
  })

  test('格式：未滿 30 天、未滿一年、一年以上', () => {
    expect(formatApart(12)).toBe('12 天')
    expect(formatApart(400)).toBe('約 1 年')
    expect(formatApart(800)).toBe('約 2 年')
  })

  test('任一方沒有時間資料時為 undefined', () => {
    expect(daysApart(japan, { pointCount: 1 })).toBeUndefined()
    expect(daysApart([{ pointCount: 1 }], { pointCount: 1, firstTime: 0, lastTime: 1 })).toBeUndefined()
  })
})
