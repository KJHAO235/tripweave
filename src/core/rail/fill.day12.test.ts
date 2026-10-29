import { beforeAll, describe, expect, test } from 'vitest'
import { fixtureGraph, fixtureLoader } from '../../test/railFixtures'
import { loadTestTrack } from '../../test/parseXml'
import { detectGaps, type Gap } from '../gaps'
import { distanceKm } from '../geo'
import { fillGapAlongRail, hasRidingEvidence, tilesForGap, type RailFill } from './fill'
import { RailGraph } from './graph'
import { tileId, tileKeyOf, tilesForBounds } from './tile'

const track = loadTestTrack('Day1+2.kml')
const gaps = detectGaps(track)

function gapAt(lat: number, lon: number): Gap {
  const gap = gaps.find((g) => Math.abs(g.from.lat - lat) < 0.001 && Math.abs(g.from.lon - lon) < 0.001)
  if (!gap) throw new Error(`找不到起點在 ${lat}, ${lon} 的缺口`)
  return gap
}

async function fill(gap: Gap): Promise<RailFill | null> {
  return fillGapAlongRail(await fixtureGraph(tilesForGap(gap)!), track, gap)
}

function nearestKm(path: [number, number][], lat: number, lon: number) {
  return Math.min(...path.map(([pLon, pLat]) => distanceKm({ lat, lon }, { lat: pLat, lon: pLon })))
}

describe('苫小牧到札幌', () => {
  const gap = gapAt(42.6373, 141.5898)
  let result: RailFill | null

  test('需要的網格涵蓋偏離直線約 10 km 的千歲站', () => {
    const ids = tilesForGap(gap)!.map(tileId)
    expect(ids).toContain(tileId(tileKeyOf(42.8282, 141.6517)))
  })

  test('苫小牧端有搭乘證據', async () => {
    expect(hasRidingEvidence(await fixtureGraph(tilesForGap(gap)!), track, gap.from, -1)).toBe(true)
  })

  beforeAll(async () => {
    result = await fill(gap)
  })

  test('沿千歲線補齊，長度約 70 km', () => {
    expect(result).not.toBeNull()
    expect(Math.abs(result!.lengthKm - 70.4)).toBeLessThan(3)
    expect(result!.routeNames.some((name) => name.includes('千歳線'))).toBe(true)
  })

  test('經過千歲站與新札幌站 300 m 內', () => {
    expect(nearestKm(result!.path, 42.8282, 141.6517)).toBeLessThan(0.3)
    expect(nearestKm(result!.path, 43.0383, 141.4728)).toBeLessThan(0.3)
  })

  test('札幌站一帶到終點約 1.2 km 維持缺口', () => {
    expect(result!.remainders).toHaveLength(1)
    const [[railLon, railLat], [endLon, endLat]] = result!.remainders[0]
    expect(distanceKm({ lat: railLat, lon: railLon }, { lat: endLat, lon: endLon })).toBeCloseTo(1.24, 1)
  })
})

describe('新幹線隧道', () => {
  test('青函隧道沿海峡線補齊，長度接近隧道全長 53.85 km', async () => {
    const result = await fill(gapAt(41.1786, 140.4551))
    expect(result).not.toBeNull()
    expect(result!.routeNames.some((name) => name.includes('海峡線'))).toBe(true)
    expect(result!.lengthKm).toBeGreaterThan(53)
    expect(result!.lengthKm).toBeLessThan(60)
  })

  test.each([
    ['八甲田隧道一帶', 40.7451, 141.1062],
    ['岩手一戶隧道一帶', 40.0076, 141.2463],
  ])('%s沿東北新幹線補齊', async (_, lat, lon) => {
    const result = await fill(gapAt(lat, lon))
    expect(result).not.toBeNull()
    expect(result!.routeNames.some((name) => name.includes('東北新幹線'))).toBe(true)
  })
})

describe('測試網格', () => {
  test('台北車站一帶含台鐵與高鐵', async () => {
    const edges = await fixtureLoader().loadTiles(tilesForBounds(25.03, 121.5, 25.06, 121.53))
    const names = new Set(edges.map((e) => e.name ?? ''))
    expect([...names].some((n) => n.includes('高速鐵路') || n.includes('高鐵'))).toBe(true)
    expect([...names].some((n) => n.includes('縱貫線'))).toBe(true)
  })
})

describe('整份軌跡', () => {
  test('補齊全部缺口後原始軌跡不變，並記錄補齊數量', async () => {
    const before = structuredClone(track)
    const graph = new RailGraph()
    const loader = fixtureLoader()
    const fills: RailFill[] = []
    for (const gap of gaps) {
      const keys = tilesForGap(gap)
      if (!keys) continue
      graph.addEdges(await loader.loadTiles(keys))
      const result = fillGapAlongRail(graph, track, gap)
      if (result) fills.push(result)
    }
    console.log(`Day1+2.kml：${gaps.length} 個缺口中補齊 ${fills.length} 個`)
    expect(fills.length).toBe(gaps.length)
    expect(fills.flatMap((f) => f.remainders)).toHaveLength(1)
    expect(track).toEqual(before)
  })
})
