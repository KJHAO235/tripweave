import { describe, expect, test } from 'vitest'
import { loadTestTrack } from '../test/parseXml'
import { detectGaps } from './gaps'
import { toMapFeatures } from './mapFeatures'
import type { RailFill } from './rail/fill'
import { countPoints, type Track } from './track'

const key = (a: number[], b: number[]) => `${a[0]},${a[1]}|${b[0]},${b[1]}`

describe('Day1+2.kml', () => {
  const track = loadTestTrack('Day1+2.kml')
  const gaps = detectGaps(track)
  const { recorded, gaps: gapFeatures } = toMapFeatures(track, gaps)
  const lines = recorded.features[0].geometry.coordinates

  test('缺口線的數量等於缺口數量', () => {
    expect(gapFeatures.features).toHaveLength(gaps.length)
  })

  test('實線不包含任何缺口兩端之間的線段', () => {
    const recordedPairs = new Set<string>()
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) recordedPairs.add(key(line[i - 1], line[i]))
    }
    for (const gap of gaps) {
      expect(recordedPairs.has(key([gap.from.lon, gap.from.lat], [gap.to.lon, gap.to.lat]))).toBe(false)
    }
  })

  test('切開後的實線點數加上被略過的單點，等於原始點數', () => {
    const recordedPoints = lines.reduce((sum, line) => sum + line.length, 0)
    expect(recordedPoints).toBeLessThanOrEqual(countPoints(track))
    expect(recordedPoints).toBeGreaterThanOrEqual(countPoints(track) - gaps.length)
  })
})

describe('切線規則', () => {
  const p = (lat: number) => ({ lat, lon: 0 })
  const track: Track = { hasTime: false, segments: [{ points: [p(0), p(0.001), p(0.002), p(1), p(1.001)] }] }

  test('A-B-C 缺口 D-E：實線切成 [A,B,C] 與 [D,E]，缺口線為 C 到 D', () => {
    const { recorded, gaps } = toMapFeatures(track, detectGaps(track))
    expect(recorded.features[0].geometry.coordinates).toEqual([
      [[0, 0], [0, 0.001], [0, 0.002]],
      [[0, 1], [0, 1.001]],
    ])
    expect(gaps.features.map((f) => f.geometry.coordinates)).toEqual([[[0, 0.002], [0, 1]]])
  })

  test('夾在兩個缺口中間的單一點不畫成實線，但仍是兩條缺口線的端點', () => {
    const lonely: Track = { hasTime: false, segments: [{ points: [p(0), p(0.001), p(1), p(2), p(2.001)] }] }
    const { recorded, gaps } = toMapFeatures(lonely, detectGaps(lonely))
    expect(recorded.features[0].geometry.coordinates).toEqual([
      [[0, 0], [0, 0.001]],
      [[0, 2], [0, 2.001]],
    ])
    expect(gaps.features).toHaveLength(2)
    expect(gaps.features.flatMap((f) => f.geometry.coordinates)).toContainEqual([0, 1])
  })

  test('缺口線的屬性不含 undefined 欄位', () => {
    const { gaps } = toMapFeatures(track, detectGaps(track))
    expect(Object.values(gaps.features[0].properties)).not.toContain(undefined)
    expect(gaps.features[0].properties).not.toHaveProperty('durationSec')
  })
})

describe('推算路段', () => {
  const p = (lat: number) => ({ lat, lon: 0 })
  const track: Track = { hasTime: false, segments: [{ points: [p(0), p(0.001), p(1), p(1.001), p(2), p(2.001)] }] }
  const gaps = detectGaps(track)
  const filled = gaps.find((g) => g.from.lat === 0.001)!
  const fills = new Map<string, RailFill>([
    [
      filled.id,
      {
        gapId: filled.id,
        mode: 'rail',
        path: [[0, 0.001], [0.01, 0.5], [0, 0.99]],
        lengthKm: 110,
        routeNames: ['線'],
        remainders: [[[0, 0.99], [0, 1]]],
      },
    ],
  ])
  const features = toMapFeatures(track, gaps, fills)

  test('已補齊的缺口不再畫成整段缺口線，只畫 remainder', () => {
    const lines = features.gaps.features.map((f) => f.geometry.coordinates)
    expect(lines).not.toContainEqual([[0, 0.001], [0, 1]])
    expect(lines).toContainEqual([[0, 0.99], [0, 1]])
    expect(features.gaps.features.filter((f) => f.properties.id === filled.id)).toHaveLength(1)
  })

  test('未補齊的缺口照舊畫成整段缺口線', () => {
    expect(features.gaps.features.map((f) => f.geometry.coordinates)).toContainEqual([[0, 1.001], [0, 2]])
  })

  test('推算圖層只有補齊的缺口，帶有缺口 id 與長度', () => {
    expect(features.inferred.features).toHaveLength(1)
    expect(features.inferred.features[0].properties).toEqual({ gapId: filled.id, lengthKm: 110 })
    expect(features.inferred.features[0].geometry.coordinates).toEqual(fills.get(filled.id)!.path)
  })
})
