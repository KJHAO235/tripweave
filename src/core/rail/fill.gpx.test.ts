import { describe, expect, test } from 'vitest'
import { fixtureLoader } from '../../test/railFixtures'
import { loadTestTrack } from '../../test/parseXml'
import { detectGaps } from '../gaps'
import { fillGapAlongRail, tilesForGap, type RailFill } from './fill'
import { RailGraph } from './graph'
import type { Track } from '../track'

async function fillAll(track: Track) {
  const gaps = detectGaps(track)
  const graph = new RailGraph()
  const loader = fixtureLoader()
  const fills = new Map<string, RailFill>()
  for (const gap of gaps) {
    graph.addEdges(await loader.loadTiles(tilesForGap(gap)!))
    const fill = fillGapAlongRail(graph, track, gap)
    if (fill) fills.set(gap.id, fill)
  }
  return { gaps, fills }
}

describe('有逐點時間的 GPX（2024/8/14，與 Day1+2.kml 第一段同一趟）', () => {
  test('缺口與 KML 相同；有時間資料時，只有平均速度低於步行程度的缺口不補，其餘都與 KML 一樣補齊', async () => {
    const gpx = loadTestTrack('relive-2024-08-14.gpx')
    expect(gpx.hasTime).toBe(true)
    const { gaps, fills } = await fillAll(gpx)
    const kmlTrack = loadTestTrack('Day1+2.kml')
    const kml = await fillAll({ ...kmlTrack, segments: [kmlTrack.segments[0]] })
    expect(gaps.map((g) => g.distanceKm.toFixed(2))).toEqual(kml.gaps.map((g) => g.distanceKm.toFixed(2)))
    expect(kml.fills.size).toBe(kml.gaps.length)

    // 上野站一帶 2 km 花了約 17 分鐘（多半是在地下月台步行、候車），有時間資料後判定不是搭火車
    const unfilled = gaps.filter((g) => !fills.has(g.id))
    expect(unfilled).toHaveLength(1)
    expect(unfilled[0].distanceKm).toBeCloseTo(2.01, 1)
    expect(unfilled[0].speedKmh!).toBeLessThan(10)
    expect([...fills.values()].flatMap((f) => f.remainders)).toHaveLength(1)
  })

  test('苫小牧到札幌在有時間資料時（約 2 小時 13 分）仍沿千歲線補齊', async () => {
    const gpx = loadTestTrack('relive-2024-08-14.gpx')
    const { gaps, fills } = await fillAll(gpx)
    const gap = gaps.find((g) => Math.abs(g.from.lat - 42.6373) < 0.001)!
    expect(gap.durationSec).toBeGreaterThan(2 * 3600)
    const fill = fills.get(gap.id)!
    expect(fill.routeNames.some((n) => n.includes('千歳線'))).toBe(true)
    expect(Math.abs(fill.lengthKm - 70.1)).toBeLessThan(3)
  })
})
