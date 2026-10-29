import { describe, expect, test } from 'vitest'
import { detectGaps } from '../gaps.ts'
import type { Track, TrackPoint } from '../track.ts'
import { fillGapAlongRail, hasRidingEvidence, tilesForGap } from './fill.ts'
import { RailGraph } from './graph.ts'
import type { RailEdge } from './tile.ts'

// 赤道附近：經度 0.01 度約 1.1 km、0.0009 度緯度約 100 m
function line(id: number, a: number, b: number, coords: [number, number][], service: 0 | 1 | 2 = 0): RailEdge {
  return { id, a, b, service, tunnel: false, name: `線${id}`, coords }
}

/** 沿經度方向、每 0.002 度（約 220 m）一個點 */
function walk(fromLon: number, toLon: number, lat = 0, time?: (i: number) => number): TrackPoint[] {
  const points: TrackPoint[] = []
  for (let lon = fromLon, i = 0; lon <= toLon + 1e-9; lon += 0.002, i++) {
    const p: TrackPoint = { lat, lon: Number(lon.toFixed(6)) }
    if (time) p.time = time(i)
    points.push(p)
  }
  return points
}

// 一條沿赤道 0 到 1 度的直線鐵路
const straightRail = new RailGraph()
straightRail.addEdges([line(1, 1, 2, [[0, 0], [0.5, 0]]), line(2, 2, 3, [[0.5, 0], [1, 0]])])

describe('搭乘證據', () => {
  test('缺口前的記錄點貼著鐵路時成立', () => {
    const track: Track = { hasTime: false, segments: [{ points: walk(0, 0.1) }] }
    expect(hasRidingEvidence(straightRail, track, { segment: 0, index: 50, lat: 0, lon: 0.1 }, -1)).toBe(true)
  })

  test('記錄點離鐵路約 500 m 時不成立（例如平行的道路）', () => {
    const track: Track = { hasTime: false, segments: [{ points: walk(0, 0.1, 0.0045) }] }
    expect(hasRidingEvidence(straightRail, track, { segment: 0, index: 50, lat: 0.0045, lon: 0.1 }, -1)).toBe(false)
  })
})

describe('補路判斷', () => {
  test('沿著鐵路搭乘、中間斷掉 30 km：補齊，長度約為兩端距離', () => {
    const track: Track = { hasTime: false, segments: [{ points: [...walk(0.1, 0.2), ...walk(0.47, 0.6)] }] }
    const [gap] = detectGaps(track)
    const fill = fillGapAlongRail(straightRail, track, gap)!
    expect(fill.routeNames).toEqual(['線1'])
    expect(fill.lengthKm).toBeCloseTo(gap.distanceKm, 1)
    expect(fill.remainders).toEqual([])
  })

  test('下車後才恢復 GPS：只補鐵路部分，剩下的列為 remainder', () => {
    // 終點在鐵路北方約 1.2 km
    const points = [...walk(0.1, 0.2), { lat: 0.0108, lon: 0.5 }, { lat: 0.0109, lon: 0.501 }]
    const track: Track = { hasTime: false, segments: [{ points }] }
    const [gap] = detectGaps(track)
    const fill = fillGapAlongRail(straightRail, track, gap)!
    expect(fill.remainders).toHaveLength(1)
    const [[railLon, railLat], [endLon, endLat]] = fill.remainders[0]
    expect([railLon, railLat]).toEqual([0.5, 0])
    expect([endLon, endLat]).toEqual([0.5, 0.0108])
  })

  test('附近沒有鐵路（山區步道）：不補', () => {
    const track: Track = { hasTime: false, segments: [{ points: [...walk(0.1, 0.2, 0.5), ...walk(0.4, 0.5, 0.5)] }] }
    const [gap] = detectGaps(track)
    expect(fillGapAlongRail(straightRail, track, gap)).toBeNull()
  })

  test('鐵路繞路超過直線距離 2.5 倍：不補', () => {
    // 兩端相距約 11 km，但鐵路往北繞了約 60 km
    const loop = new RailGraph()
    loop.addEdges([
      line(1, 1, 2, [[0, 0], [0.2, 0]]),
      line(2, 2, 3, [[0.2, 0], [0.2, 0.27], [0.3, 0.27], [0.3, 0]]),
      line(3, 3, 4, [[0.3, 0], [0.5, 0]]),
    ])
    const track: Track = { hasTime: false, segments: [{ points: [...walk(0.1, 0.2), ...walk(0.3, 0.4)] }] }
    const [gap] = detectGaps(track)
    expect(fillGapAlongRail(loop, track, gap)).toBeNull()
  })

  test('有時間資料且速度不合理（30 km 只花 1 分鐘）：不補', () => {
    const t0 = Date.parse('2024-08-14T10:00:00Z')
    const before = walk(0.1, 0.2, 0, (i) => t0 + i * 10_000)
    const lastTime = before[before.length - 1].time!
    const after = walk(0.47, 0.6, 0, (i) => lastTime + 60_000 + i * 10_000)
    const track: Track = { hasTime: true, segments: [{ points: [...before, ...after] }] }
    const [gap] = detectGaps(track)
    expect(fillGapAlongRail(straightRail, track, gap)).toBeNull()
  })

  test('缺口超過 300 km 不取網格（多半是飛機）', () => {
    const gap = { id: 'x', from: { segment: 0, index: 0, lat: 0, lon: 0 }, to: { segment: 0, index: 1, lat: 0, lon: 3 }, distanceKm: 333, isSegmentBoundary: false }
    expect(tilesForGap(gap)).toBeNull()
  })
})

describe('只貼到相連的鐵路網', () => {
  test('終點離一條不相連的線（例如地下鐵）比較近時，仍貼到搭乘的那條線', () => {
    const graph = new RailGraph()
    graph.addEdges([
      line(1, 1, 2, [[0, 0], [0.5, 0]]),
      // 終點北方約 300 m 有一條不相連的地下鐵
      line(9, 90, 91, [[0.45, 0.0108 + 0.0027], [0.55, 0.0108 + 0.0027]]),
    ])
    const points = [...walk(0.1, 0.2), { lat: 0.0108, lon: 0.5 }, { lat: 0.0109, lon: 0.501 }]
    const track: Track = { hasTime: false, segments: [{ points }] }
    const [gap] = detectGaps(track)
    const fill = fillGapAlongRail(graph, track, gap)!
    expect(fill).not.toBeNull()
    expect(fill.routeNames).toEqual(['線1'])
    expect(fill.remainders[0][0]).toEqual([0.5, 0])
  })
})

describe('複線', () => {
  test('起點靠近下行線、終點靠近上行線時，不會繞到遠方的渡線再折返', () => {
    // 兩條相距約 5 m 的平行軌道，只在經度 0.9 有渡線
    const graph = new RailGraph()
    graph.addEdges([
      line(1, 1, 2, [[0, 0], [0.9, 0]]),
      line(2, 3, 4, [[0, 0.00005], [0.9, 0.00005]]),
      line(3, 2, 4, [[0.9, 0], [0.9, 0.00005]], 1),
    ])
    const before = walk(0.1, 0.2, 0.00001)
    const after = walk(0.47, 0.6, 0.00004)
    const track: Track = { hasTime: false, segments: [{ points: [...before, ...after] }] }
    const [gap] = detectGaps(track)
    const fill = fillGapAlongRail(graph, track, gap)!
    expect(fill.lengthKm).toBeLessThan(gap.distanceKm * 1.1)
  })
})
