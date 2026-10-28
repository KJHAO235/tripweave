import { expect, test } from 'vitest'
import { loadTestTrack } from '../test/parseXml'
import { countPoints, trackBounds } from './track'

test('Day1+2.kml 的範圍涵蓋上野到釧路', () => {
  const track = loadTestTrack('Day1+2.kml')
  expect(countPoints(track)).toBe(17033 + 29845)
  const [[west, south], [east, north]] = trackBounds(track)!
  // 上野約 (35.71, 139.77)，釧路約 (42.99, 144.38)
  expect(south).toBeLessThan(35.72)
  expect(west).toBeLessThan(139.78)
  expect(north).toBeGreaterThan(43)
  expect(east).toBeGreaterThan(144)
})

test('沒有任何點時沒有範圍', () => {
  expect(trackBounds({ segments: [], hasTime: false })).toBeNull()
})
