import { describe, expect, test } from 'vitest'
import { loadTestTrack } from '../test/parseXml'
import { detectGaps, type Gap } from './gaps'
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
