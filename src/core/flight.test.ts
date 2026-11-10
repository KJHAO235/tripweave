import { describe, expect, test } from 'vitest'
import { loadTestTrack } from '../test/parseXml'
import { flightAfterRail, flightBySpeed, greatCirclePath, recordedSpeedNear } from './flight'
import { detectGaps } from './gaps'
import { distanceKm, type LatLon } from './geo'
import type { Segment, Track, TrackPoint } from './track'

const NAHA: LatLon = { lat: 26.206, lon: 127.646 }
const HANEDA: LatLon = { lat: 35.549, lon: 139.78 }
const HONOLULU: LatLon = { lat: 21.318, lon: -157.922 }

const coron = loadTestTrack('relive-coron-2025-01-23.gpx')

/** 從 start 往北每 step 秒移動 kmPerStep 公里的一串點 */
function line(start: LatLon, startMs: number | undefined, count: number, kmPerStep: number, stepSec: number): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: start.lat + (i * kmPerStep) / 111,
    lon: start.lon,
    ...(startMs === undefined ? {} : { time: startMs + i * stepSec * 1000 }),
  }))
}

const track = (segments: Segment[]): Track => ({
  segments,
  hasTime: segments.every((s) => s.points.every((p) => p.time !== undefined)),
})

/** 兩段之間只有一個缺口時取出它 */
function onlyGap(t: Track) {
  const gaps = detectGaps(t, 1)
  expect(gaps).toHaveLength(1)
  return gaps[0]
}

describe('greatCirclePath', () => {
  test('那霸到羽田：長度與大圓距離相差 1% 內、點距不超過 50 km', () => {
    const path = greatCirclePath(NAHA, HANEDA)
    const steps = path.slice(1).map((p, i) => distanceKm({ lon: path[i][0], lat: path[i][1] }, { lon: p[0], lat: p[1] }))
    const total = steps.reduce((a, b) => a + b, 0)
    expect(Math.abs(total - distanceKm(NAHA, HANEDA)) / distanceKm(NAHA, HANEDA)).toBeLessThan(0.01)
    expect(Math.max(...steps)).toBeLessThanOrEqual(50)
    expect(path[0]).toEqual([NAHA.lon, NAHA.lat])
    expect(path.at(-1)).toEqual([HANEDA.lon, HANEDA.lat])
  })

  test('東京到檀香山經過太平洋：經度連續、全程大於 139 度', () => {
    const path = greatCirclePath(HANEDA, HONOLULU)
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i][0] - path[i - 1][0])).toBeLessThan(10)
    expect(Math.min(...path.map((p) => p[0]))).toBeGreaterThan(139)
    // 終點以展開後的經度表示（-157.9 + 360）
    expect(path.at(-1)![0]).toBeCloseTo(HONOLULU.lon + 360, 6)
  })

  test('兩點非常接近時仍有起訖兩點', () => {
    expect(greatCirclePath(NAHA, { lat: NAHA.lat + 0.01, lon: NAHA.lon })).toHaveLength(2)
  })
})

describe('recordedSpeedNear', () => {
  test('Coron 降落前 32 km 缺口：起點往前的實際記錄超過 200 km/h', () => {
    const gap = detectGaps(coron, 1).find((g) => g.distanceKm > 30)!
    expect(gap.speedKmh!).toBeLessThan(200)
    expect(recordedSpeedNear(coron, gap.from, -1)!).toBeGreaterThan(200)
  })

  test('沒有時間資料時為 undefined', () => {
    const kml = loadTestTrack('Day1+2.kml')
    const gap = detectGaps(kml, 1)[0]
    expect(recordedSpeedNear(kml, gap.from, -1)).toBeUndefined()
  })
})

describe('判斷為飛機', () => {
  test('Coron 航程：11 個缺口在鐵路補不了時全部判斷為飛機，其中 10 個時速 ≥ 340 km/h', () => {
    expect(coron.hasTime).toBe(true)
    const gaps = detectGaps(coron, 1)
    expect(gaps).toHaveLength(11)
    expect(gaps.filter((g) => g.speedKmh! >= 340)).toHaveLength(10)
    for (const gap of gaps) expect(flightBySpeed(gap) ?? flightAfterRail(coron, gap)).not.toBeNull()
    const fast = gaps.find((g) => g.distanceKm > 20 && g.distanceKm < 22)!
    expect(flightBySpeed(fast)!.basis).toEqual({ kind: 'speed', speedKmh: fast.speedKmh })
  })

  test('時速 250 km/h、前後也高速的新幹線缺口不會跳過鐵路', () => {
    // 前後各 2 分鐘以 270 km/h 行駛（每 10 秒 0.75 km），中間 10 km 的隧道花 144 秒
    const before = line({ lat: 40, lon: 141 }, 0, 13, 0.75, 10)
    const last = before.at(-1)!
    const after = line({ lat: last.lat + 10 / 111, lon: 141 }, last.time! + 144_000, 13, 0.75, 10)
    const t = track([{ points: [...before, ...after] }])
    const gap = onlyGap(t)
    expect(gap.speedKmh!).toBeCloseTo(250, 0)
    expect(flightBySpeed(gap)).toBeNull()
  })

  test('兩天的檔案之間隔著一趟飛機（那霸 → 羽田，隔一晚）', () => {
    const day1 = line(NAHA, Date.UTC(2024, 7, 20, 11), 5, 0.01, 60)
    const day2 = line(HANEDA, Date.UTC(2024, 7, 21, 0), 5, 0.01, 60)
    const t = track([
      { points: day1, source: 'day1' },
      { points: day2, source: 'day2' },
    ])
    const gap = onlyGap(t)
    expect(gap.isFileBoundary).toBe(true)
    expect(gap.speedKmh!).toBeLessThan(150)
    const fill = flightAfterRail(t, gap)!
    expect(fill.basis).toEqual({ kind: 'distance', distanceKm: gap.distanceKm })
    expect(fill.lengthKm).toBeCloseTo(distanceKm(NAHA, HANEDA), 1)
  })

  test('沒有時間資料、520 km 的缺口', () => {
    const t = track([{ points: [...line(NAHA, undefined, 3, 0.1, 0), ...line({ lat: NAHA.lat + 520 / 111, lon: NAHA.lon }, undefined, 3, 0.1, 0)] }])
    const gap = onlyGap(t)
    expect(gap.distanceKm).toBeCloseTo(520, -1)
    expect(flightBySpeed(gap)).toBeNull()
    expect(flightAfterRail(t, gap)!.basis.kind).toBe('distance')
  })

  test('開車途中 120 km、90 km/h 的缺口不判斷為飛機', () => {
    const before = line({ lat: 35, lon: 138 }, 0, 10, 0.25, 10)
    const last = before.at(-1)!
    const after = line({ lat: last.lat + 120 / 111, lon: 138 }, last.time! + 80 * 60_000, 10, 0.25, 10)
    const gap = onlyGap(track([{ points: [...before, ...after] }]))
    expect(gap.speedKmh!).toBeCloseTo(90, 0)
    const t = track([{ points: [...before, ...after] }])
    expect(flightBySpeed(gap)).toBeNull()
    expect(flightAfterRail(t, gap)).toBeNull()
  })
})
