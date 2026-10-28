import { expect, test } from 'vitest'
import { distanceKm, EARTH_RADIUS_KM } from './geo'

function expectWithinPercent(actual: number, expected: number, percent: number) {
  expect(Math.abs(actual - expected) / expected).toBeLessThan(percent / 100)
}

test('赤道上經度相差 1 度約 111.195 公里', () => {
  expectWithinPercent(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), (Math.PI * EARTH_RADIUS_KM) / 180, 0.1)
})

test('赤道到北極是四分之一圓周', () => {
  expectWithinPercent(distanceKm({ lat: 0, lon: 120 }, { lat: 90, lon: 0 }), (Math.PI * EARTH_RADIUS_KM) / 2, 0.1)
})

test('跨越換日線時取較短的一側', () => {
  expectWithinPercent(distanceKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 }), (Math.PI * EARTH_RADIUS_KM) / 180, 0.1)
})

test('同一點距離為 0', () => {
  expect(distanceKm({ lat: 43.06, lon: 141.35 }, { lat: 43.06, lon: 141.35 })).toBe(0)
})
