import { describe, expect, test } from 'vitest'
import { carvedElNidoTrack, loadTestTrack } from '../test/parseXml'
import { fixtureGraph } from '../test/railFixtures'
import { animationSeconds, boundsAhead, buildAnimationRoute, buildCameraPath, cameraAt, frameAt } from './animation'
import { fillGapAlongFerry, tilesForFerryGap } from './ferry'
import type { GapFill } from './fill'
import { flightAfterRail, flightBySpeed } from './flight'
import { detectGaps } from './gaps'
import type { Track } from './track'

describe('El Nido 船程（挖掉中段、沿渡輪航線補齊）', async () => {
  const track = carvedElNidoTrack()
  const gaps = detectGaps(track)
  const fill = fillGapAlongFerry(await fixtureGraph(tilesForFerryGap(gaps[0])!, 'ferry'), gaps[0])!
  const route = buildAnimationRoute(track, gaps, new Map<string, GapFill>([[gaps[0].id, fill]]))

  test('片段依序為實際記錄 → 渡輪 → 缺口殘段 → 實際記錄', () => {
    expect(route.pieces.map((p) => p.mode)).toEqual(['recorded', 'ferry', 'gap', 'recorded'])
  })

  test('起點與終點對應軌跡的起訖點', () => {
    const points = track.segments[0].points
    expect(frameAt(route, 0)!.position).toEqual([points[0].lon, points[0].lat])
    const end = frameAt(route, 1)!.position
    expect(end[0]).toBeCloseTo(points.at(-1)!.lon, 6)
    expect(end[1]).toBeCloseTo(points.at(-1)!.lat, 6)
  })

  test('有時間資料時每一格都有時間，且隨進度遞增', () => {
    const times = [0, 0.25, 0.5, 0.75, 1].map((p) => frameAt(route, p)!.time!)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1])
  })

  test('實際記錄的點數被抽稀到上限以內', () => {
    const recorded = route.pieces.filter((p) => p.mode === 'recorded').reduce((n, p) => n + p.coords.length, 0)
    expect(recorded).toBeLessThanOrEqual(6100)
  })

  test('一天的旅程約 40 秒', () => {
    expect(route.durationSec).toBe(40)
  })

  test('接下來幾秒的範圍包含目前位置', () => {
    const [[w, s], [e, n]] = boundsAhead(route, 0.5, 3)!
    const [lon, lat] = frameAt(route, 0.5)!.position
    expect(lon).toBeGreaterThanOrEqual(w)
    expect(lon).toBeLessThanOrEqual(e)
    expect(lat).toBeGreaterThanOrEqual(s)
    expect(lat).toBeLessThanOrEqual(n)
  })
})

test('長距離的推算段落被壓縮：1,500 km 的飛機只占 30 km 實際記錄的數倍，而不是 50 倍', () => {
  const day = (lat: number, time: number) => Array.from({ length: 31 }, (_, i) => ({ lat: lat + i / 111.195, lon: 127.6, time: time + i * 60_000 }))
  const track: Track = {
    segments: [
      { points: day(26.2, 0), source: 'a' },
      { points: day(26.2 + 1500 / 111.195, 6 * 3_600_000), source: 'b' },
    ],
    hasTime: true,
  }
  const gaps = detectGaps(track)
  const flight = flightBySpeed(gaps[0]) ?? flightAfterRail(track, gaps[0])!
  const route = buildAnimationRoute(track, gaps, new Map<string, GapFill>([[gaps[0].id, flight]]))
  const flightWeight = route.pieces.find((p) => p.mode === 'flight')!.weight
  const dayWeight = route.pieces.find((p) => p.mode === 'recorded')!.weight
  expect(flightWeight / dayWeight).toBeLessThan(10)
})

test('多天旅程最多 150 秒；沒有時間資料時以檔案數計算', () => {
  expect(animationSeconds(loadTestTrack('relive-2024-08-14.gpx'))).toBe(40)
  // 兩天的檔案（8/14、8/15）跨度超過 24 小時，算 2 天
  const twoDays: Track = { segments: [...loadTestTrack('relive-2024-08-14.gpx').segments, ...loadTestTrack('relive-2024-08-15.gpx').segments], hasTime: true }
  expect(animationSeconds(twoDays)).toBe(80)
  const noTime: Track = {
    segments: [1, 2, 3, 4].map((i) => ({ points: [{ lat: i, lon: 0 }, { lat: i + 0.001, lon: 0 }], source: `f${i}` })),
    hasTime: false,
  }
  expect(animationSeconds(noTime)).toBe(150)
})

test('相隔太久的兩段行程之間以 jump 片段跳過，不畫線也不占時間', () => {
  const japan = loadTestTrack('relive-2024-08-14.gpx')
  const elNido = loadTestTrack('relive-elnido-2025-01-26.gpx')
  const track: Track = { segments: [...japan.segments, ...elNido.segments], hasTime: true }
  const route = buildAnimationRoute(track, detectGaps(track), new Map())
  const jumps = route.pieces.filter((p) => p.mode === 'jump')
  expect(jumps.length).toBeGreaterThan(0)
  for (const jump of jumps) expect(jump.weight).toBe(0)
})

test('鏡頭路徑比圓點平滑：中心的二階差分小於十分之一，縮放每格變化很小', () => {
  const track = loadTestTrack('relive-2024-08-14.gpx')
  const route = buildAnimationRoute(track, detectGaps(track), new Map())
  const zoomFor = ([[w, s], [e, n]]: [[number, number], [number, number]]) => Math.min(14, Math.log2(360 / Math.max(e - w, n - s, 0.002)) - 1)
  const camera = buildCameraPath(route, zoomFor)
  const frames = route.durationSec * 60
  const raw: [number, number][] = []
  const smooth: [number, number][] = []
  const zooms: number[] = []
  for (let i = 0; i <= frames; i++) {
    raw.push(frameAt(route, i / frames)!.position)
    const c = cameraAt(camera, i / frames)
    smooth.push(c.center)
    zooms.push(c.zoom)
  }
  const jerk = (c: [number, number][]) =>
    c.slice(1, -1).reduce((sum, p, i) => sum + Math.hypot(c[i][0] + c[i + 2][0] - 2 * p[0], c[i][1] + c[i + 2][1] - 2 * p[1]), 0)
  expect(jerk(smooth)).toBeLessThan(jerk(raw) / 10)
  for (let i = 1; i < zooms.length; i++) expect(Math.abs(zooms[i] - zooms[i - 1])).toBeLessThan(0.05)
  // 畫面每秒最多轉 12°（取樣間隔 0.1 秒最多 1.2°）
  for (let i = 1; i < camera.bearings.length; i++) {
    const diff = Math.abs(((((camera.bearings[i] - camera.bearings[i - 1]) % 360) + 540) % 360) - 180)
    expect(diff).toBeLessThanOrEqual(1.2 + 1e-9)
  }
})
