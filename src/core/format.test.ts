import { expect, test } from 'vitest'
import { formatDuration, formatKm, formatLatLon, formatSpeed } from './format'

test('距離顯示到小數一位', () => {
  expect(formatKm(50.2961)).toBe('50.3 km')
  expect(formatKm(1.04)).toBe('1.0 km')
})

test('時間長度', () => {
  expect(formatDuration(45)).toBe('45 秒')
  expect(formatDuration(1800)).toBe('30 分鐘')
  expect(formatDuration(3600)).toBe('1 小時')
  expect(formatDuration(3 * 3600 + 40 * 60)).toBe('3 小時 40 分')
})

test('速度與座標', () => {
  expect(formatSpeed(99.6)).toBe('約 100 km/h')
  expect(formatLatLon(42.63731, 141.58981)).toBe('42.6373, 141.5898')
})
