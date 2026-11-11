import { describe, expect, test } from 'vitest'
import { carvedElNidoTrack, loadTestTrack } from '../test/parseXml'
import { fixtureGraph } from '../test/railFixtures'
import { fillGapAlongFerry, tilesForFerryGap } from './ferry'
import { decideFill } from './fill'
import { detectGaps, type Gap } from './gaps'
import { distanceKm } from './geo'
import { RailGraph } from './rail/graph'
import type { RailEdge } from './rail/tile'
import type { Track, TrackPoint } from './track'

const ferryGraphFor = (gap: Gap) => fixtureGraph(tilesForFerryGap(gap)!, 'ferry')

/** 只有兩個點、指定時間差的缺口 */
function twoPointGap(from: TrackPoint, to: TrackPoint): { track: Track; gap: Gap } {
  const track: Track = { segments: [{ points: [from, to] }], hasTime: from.time !== undefined }
  return { track, gap: detectGaps(track, 1)[0] }
}

describe('El Nido 船程挖掉中段', () => {
  test('原檔沒有缺口，挖掉後有 1 個約 32 km 的缺口', () => {
    expect(detectGaps(loadTestTrack('relive-elnido-2025-01-26.gpx'), 1)).toHaveLength(0)
    const gaps = detectGaps(carvedElNidoTrack(), 1)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].distanceKm).toBeCloseTo(32.4, 0)
  })

  test('判斷為渡輪，沿 Coron 一帶的航線補齊，離航線較遠的終點留下殘段', async () => {
    const track = carvedElNidoTrack()
    const [gap] = detectGaps(track, 1)
    const fill = fillGapAlongFerry(await ferryGraphFor(gap), gap)!
    expect(fill.mode).toBe('ferry')
    // 這一段「El Nido – Coron」與「Sibaltan - Coron」兩條航線幾乎重疊，取哪一條都合理
    expect(fill.routeNames.some((name) => /Coron/.test(name))).toBe(true)
    // 起點貼著航線併入推算路段；終點離最近的航線超過 0.3 km，以缺口殘段連到航線
    expect(fill.path[0]).toEqual([gap.from.lon, gap.from.lat])
    expect(fill.remainders).toHaveLength(1)
    expect(fill.remainders[0][1]).toEqual([gap.to.lon, gap.to.lat])
    const remainderKm = distanceKm({ lon: fill.remainders[0][0][0], lat: fill.remainders[0][0][1] }, gap.to)
    expect(remainderKm).toBeGreaterThan(0.3)
    expect(remainderKm).toBeLessThan(3)
    // 推算路段沿航線而不是直線：中段的點離兩端直線超過 1 km
    const mid = fill.path[Math.floor(fill.path.length / 2)]
    expect(fill.path.length).toBeGreaterThan(2)
    expect(distanceFromLineKm(mid, [gap.from.lon, gap.from.lat], [gap.to.lon, gap.to.lat])).toBeGreaterThan(1)
  })

  test('完整判斷順序也得到渡輪（不是飛機或鐵路）', async () => {
    const track = carvedElNidoTrack()
    const [gap] = detectGaps(track, 1)
    expect(decideFill(track, gap, new RailGraph(), await ferryGraphFor(gap))?.mode).toBe('ferry')
  })
})

describe('不是渡輪的情況', () => {
  test('附近 3 km 內沒有航線（巴拉望內陸山區）', async () => {
    const { gap } = twoPointGap({ lat: 10.3, lon: 119.2 }, { lat: 10.5, lon: 119.3 })
    expect(fillGapAlongFerry(await ferryGraphFor(gap), gap)).toBeNull()
  })

  test('兩端都在航線附近，但時速 400 km/h', async () => {
    const carved = carvedElNidoTrack()
    const [real] = detectGaps(carved, 1)
    const hours = real.distanceKm / 400
    const { gap } = twoPointGap({ lat: real.from.lat, lon: real.from.lon, time: 0 }, { lat: real.to.lat, lon: real.to.lon, time: hours * 3_600_000 })
    expect(fillGapAlongFerry(await ferryGraphFor(gap), gap)).toBeNull()
  })
})

describe('長程渡輪優先於依距離判斷的飛機', () => {
  // 合成的鹿兒島港—那霸港航線（經過奄美大島外海），約 700 km
  const KAGOSHIMA = { lat: 31.59, lon: 130.57 }
  const AMAMI = { lat: 28.4, lon: 129.5 }
  const NAHA = { lat: 26.22, lon: 127.67 }
  const edge = (id: number, a: number, b: number, coords: [number, number][]): RailEdge => ({
    id,
    a,
    b,
    service: 0,
    tunnel: false,
    name: '鹿兒島—那霸',
    coords,
  })
  const graph = new RailGraph()
  graph.addEdges([
    edge(1, 1, 2, [
      [KAGOSHIMA.lon, KAGOSHIMA.lat],
      [AMAMI.lon, AMAMI.lat],
    ]),
    edge(2, 2, 3, [
      [AMAMI.lon, AMAMI.lat],
      [NAHA.lon, NAHA.lat],
    ]),
  ])

  test('25 小時、約 700 km 的缺口判斷為渡輪而不是飛機', () => {
    const { track, gap } = twoPointGap({ ...KAGOSHIMA, time: 0 }, { ...NAHA, time: 25 * 3_600_000 })
    expect(gap.distanceKm).toBeGreaterThan(600)
    const fill = decideFill(track, gap, new RailGraph(), graph)!
    expect(fill.mode).toBe('ferry')
    expect(fill.lengthKm).toBeGreaterThan(gap.distanceKm)
  })

  test('沒有渡輪資料時同一個缺口仍判斷為飛機', () => {
    const { track, gap } = twoPointGap({ ...KAGOSHIMA, time: 0 }, { ...NAHA, time: 25 * 3_600_000 })
    expect(decideFill(track, gap, new RailGraph(), new RailGraph())?.mode).toBe('flight')
  })
})

/** 點到兩點連線的近似距離（公里，等距投影） */
function distanceFromLineKm([lon, lat]: [number, number], [lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const c = Math.cos((lat * Math.PI) / 180)
  const dx = (lon2 - lon1) * c
  const dy = lat2 - lat1
  const t = Math.max(0, Math.min(1, (((lon - lon1) * c) * dx + (lat - lat1) * dy) / (dx * dx + dy * dy)))
  return distanceKm({ lat, lon }, { lat: lat1 + t * dy, lon: lon1 + t * (lon2 - lon1) })
}
