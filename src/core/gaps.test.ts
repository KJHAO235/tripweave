import { describe, expect, test } from 'vitest'
import { loadTestTrack } from '../test/parseXml'
import { detectGaps, type Gap } from './gaps'
import { distanceKm } from './geo'
import { toMapFeatures } from './mapFeatures'
import type { Track, TrackPoint } from './track'

const day12 = loadTestTrack('Day1+2.kml')

// 以實際座標辨識位置，數值來自對 Day1+2.kml 的實測
const MAJOR_GAPS = [
  { name: '苫小牧到札幌', km: 50.3, from: { lat: 42.6373, lon: 141.5898 }, to: { lat: 43.0576, lon: 141.3602 } },
  { name: '青函隧道', km: 47.5, from: { lat: 41.1786, lon: 140.4551 }, to: { lat: 41.5945, lon: 140.3249 } },
  { name: '八甲田隧道一帶', km: 27.9, from: { lat: 40.7451, lon: 141.1062 }, to: { lat: 40.7637, lon: 140.7762 } },
  { name: '岩手一戶隧道一帶', km: 25.9, from: { lat: 40.0076, lon: 141.2463 }, to: { lat: 40.2396, lon: 141.2739 } },
  { name: '二戶到八戶之間', km: 17.2, from: { lat: 40.3294, lon: 141.3057 }, to: { lat: 40.4649, lon: 141.4046 } },
]

function isNear(ref: { lat: number; lon: number }, expected: { lat: number; lon: number }) {
  return Math.abs(ref.lat - expected.lat) < 0.001 && Math.abs(ref.lon - expected.lon) < 0.001
}

function track(segments: TrackPoint[][], hasTime = false): Track {
  return { segments: segments.map((points) => ({ points })), hasTime }
}

// 緯度相差 0.44966 度約為 50 公里
const KM50_LAT = 50 / 111.195

describe('Day1+2.kml', () => {
  const gaps = detectGaps(day12)

  test.each(MAJOR_GAPS)('找到「$name」缺口（$km km）', ({ km, from, to }) => {
    const gap = gaps.find((g) => isNear(g.from, from) && isNear(g.to, to))
    expect(gap).toBeDefined()
    expect(Math.abs(gap!.distanceKm - km)).toBeLessThan(0.5)
  })

  test('預設門檻 1 km 共找到 68 個缺口，全部超過 1 km', () => {
    expect(gaps).toHaveLength(68)
    expect(gaps.every((g) => g.distanceKm > 1)).toBe(true)
  })

  test('兩段在札幌的交界（約 0.05 km）不是缺口', () => {
    expect(gaps.some((g) => g.isSegmentBoundary)).toBe(false)
  })

  test('沒有時間資料，所以缺口沒有時長與速度', () => {
    expect(gaps.every((g) => g.durationSec === undefined && g.speedKmh === undefined)).toBe(true)
  })

  test('依距離由大到小排序：第一筆苫小牧到札幌、第二筆青函隧道', () => {
    expect(isNear(gaps[0].from, MAJOR_GAPS[0].from)).toBe(true)
    expect(isNear(gaps[1].from, MAJOR_GAPS[1].from)).toBe(true)
    const distances = gaps.map((g) => g.distanceKm)
    expect(distances).toEqual([...distances].sort((a, b) => b - a))
  })

  test('門檻調為 10 km 時只剩超過 10 km 的缺口', () => {
    const large = detectGaps(day12, 10)
    expect(large.length).toBeLessThan(gaps.length)
    expect(large.every((g) => g.distanceKm > 10)).toBe(true)
    expect(large).toHaveLength(gaps.filter((g) => g.distanceKm > 10).length)
  })

  test('缺口 id 不重複', () => {
    expect(new Set(gaps.map((g) => g.id)).size).toBe(gaps.length)
  })
})

describe('門檻與段落交界', () => {
  test('相鄰點距離小於門檻時不是缺口', () => {
    expect(detectGaps(track([[{ lat: 0, lon: 0 }, { lat: 0.005, lon: 0 }]]))).toEqual([])
  })

  test('兩個段落相距 30 km 時，交界處是缺口', () => {
    const gaps = detectGaps(track([
      [{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }],
      [{ lat: 0.001 + 30 / 111.195, lon: 0 }, { lat: 0.002 + 30 / 111.195, lon: 0 }],
    ]))
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ isSegmentBoundary: true, from: { segment: 0, index: 1 }, to: { segment: 1, index: 0 } })
    expect(gaps[0].distanceKm).toBeCloseTo(30, 1)
  })
})

describe('時間資料', () => {
  test('10:00 到 10:30、50 km 的缺口：30 分鐘、約 100 km/h', () => {
    const t0 = Date.parse('2024-08-14T10:00:00Z')
    const [gap] = detectGaps(track([[
      { lat: 0, lon: 0, time: t0 },
      { lat: KM50_LAT, lon: 0, time: t0 + 30 * 60_000 },
    ]], true))
    expect(gap.durationSec).toBe(1800)
    expect(gap.speedKmh).toBeCloseTo(100, 0)
  })

  test('軌跡沒有時間資料時，缺口不提供時長與速度', () => {
    const [gap] = detectGaps(track([[{ lat: 0, lon: 0 }, { lat: KM50_LAT, lon: 0 }]]))
    expect(gap).not.toHaveProperty('durationSec')
    expect(gap).not.toHaveProperty('speedKmh')
  })
})

test('偵測前後原始軌跡點的數量與座標完全相同', () => {
  const before = structuredClone(day12)
  const gaps: Gap[] = detectGaps(day12)
  expect(gaps.length).toBeGreaterThan(0)
  expect(day12).toEqual(before)
})

describe('檔案之間的缺口', () => {
  test('合併 8/14 與 8/15 時，札幌處（相距約 0.1 km）不形成缺口', async () => {
    const { readFileSync } = await import('node:fs')
    const { parseTrackFiles } = await import('./parse/mergeTracks')
    const { parseXmlForTest } = await import('../test/parseXml')
    const read = (name: string) => ({ name, text: readFileSync(`test-data/${name}`, 'utf8') })
    const { track } = parseTrackFiles([read('relive-2024-08-14.gpx'), read('relive-2024-08-15.gpx')], parseXmlForTest)
    const gaps = detectGaps(track!)
    expect(gaps.some((g) => g.isFileBoundary)).toBe(false)
    expect(gaps.every((g) => !g.isSegmentBoundary)).toBe(true)
  })

  test('兩個檔案相距 200 km 時形成一個「檔案之間」的缺口', () => {
    const km200 = 200 / 111.195
    const merged: Track = {
      hasTime: false,
      segments: [
        { source: 'a', points: [{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }] },
        { source: 'b', points: [{ lat: 0.001 + km200, lon: 0 }, { lat: 0.002 + km200, lon: 0 }] },
      ],
    }
    const gaps = detectGaps(merged)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ isFileBoundary: true, isSegmentBoundary: true })
    expect(gaps[0].distanceKm).toBeCloseTo(200, 0)
  })

  test('同一個檔案內的兩個段落之間不算檔案之間', () => {
    const gaps = detectGaps({
      hasTime: false,
      segments: [
        { source: 'a', points: [{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }] },
        { source: 'a', points: [{ lat: 0.5, lon: 0 }, { lat: 0.501, lon: 0 }] },
      ],
    })
    expect(gaps[0]).toMatchObject({ isFileBoundary: false, isSegmentBoundary: true })
  })
})

describe('有時間與沒有時間的段落混合', () => {
  test('只看缺口兩端的點：有時間段落內的缺口有時長，沒有時間的段落與交界處沒有', () => {
    const t0 = Date.parse('2024-08-14T10:00:00Z')
    const km = (n: number) => n / 111.195
    const track: Track = {
      hasTime: false,
      segments: [
        { source: 'gpx', points: [{ lat: 0, lon: 0, time: t0 }, { lat: km(50), lon: 0, time: t0 + 1800_000 }] },
        { source: 'kml', points: [{ lat: km(100), lon: 0 }, { lat: km(150), lon: 0 }] },
      ],
    }
    const gaps = detectGaps(track).sort((a, b) => a.from.lat - b.from.lat)
    expect(gaps).toHaveLength(3)
    expect(gaps[0].durationSec).toBe(1800)
    expect(gaps[0].speedKmh).toBeCloseTo(100, 0)
    expect(gaps[1]).toMatchObject({ isFileBoundary: true })
    expect(gaps[1]).not.toHaveProperty('durationSec')
    expect(gaps[2]).not.toHaveProperty('durationSec')
  })
})

describe('相隔超過 3 天的兩段行程', () => {
  const japan = loadTestTrack('relive-2024-08-14.gpx')
  const elNido = loadTestTrack('relive-elnido-2025-01-26.gpx')
  const merged: Track = {
    segments: [...japan.segments.map((s) => ({ ...s, fileId: 'japan' })), ...elNido.segments.map((s) => ({ ...s, fileId: 'elnido' }))],
    hasTime: true,
  }

  test('日本與 El Nido 之間不形成缺口，缺口數等於兩檔各自的缺口數之和', () => {
    const gaps = detectGaps(merged)
    expect(gaps.filter((g) => g.isFileBoundary)).toHaveLength(0)
    expect(gaps).toHaveLength(detectGaps(japan).length + detectGaps(elNido).length)
  })

  test('實際記錄的線不連接日本與菲律賓', () => {
    const { recorded } = toMapFeatures(merged, detectGaps(merged))
    for (const line of recorded.features[0].geometry.coordinates) {
      for (let i = 1; i < line.length; i++) {
        expect(distanceKm({ lon: line[i - 1][0], lat: line[i - 1][1] }, { lon: line[i][0], lat: line[i][1] })).toBeLessThan(50)
      }
    }
  })

  test('隔一晚（12 小時）、1,550 km 的兩個檔案仍形成缺口', () => {
    const night = 12 * 3_600_000
    const t: Track = {
      segments: [
        { points: [{ lat: 26.2, lon: 127.6, time: 0 }, { lat: 26.201, lon: 127.6, time: 60_000 }], source: 'a' },
        { points: [{ lat: 35.55, lon: 139.78, time: night }, { lat: 35.551, lon: 139.78, time: night + 60_000 }], source: 'b' },
      ],
      hasTime: true,
    }
    const gaps = detectGaps(t)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].isFileBoundary).toBe(true)
  })

  test('沒有時間資料的兩個檔案相距 200 km 仍形成缺口', () => {
    const t: Track = {
      segments: [
        { points: [{ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 }], source: 'a' },
        { points: [{ lat: 0.001 + 4 * KM50_LAT, lon: 0 }, { lat: 0.002 + 4 * KM50_LAT, lon: 0 }], source: 'b' },
      ],
      hasTime: false,
    }
    expect(detectGaps(t)).toHaveLength(1)
  })
})
