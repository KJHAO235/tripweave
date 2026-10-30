import { describe, expect, test } from 'vitest'
import { formatDateRange, formatDuration, formatKm, formatLatLon, formatSpeed } from './format'

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

describe('日期範圍', () => {
  const at = (iso: string) => Date.parse(iso)
  test('同一個月、跨月、跨年、同一天', () => {
    expect(formatDateRange(at('2024-08-14T03:03:51Z'), at('2024-08-15T11:48:34Z'), 'Asia/Taipei')).toBe('2024/8/14–8/15')
    expect(formatDateRange(at('2024-08-31T01:00:00Z'), at('2024-09-02T01:00:00Z'), 'Asia/Taipei')).toBe('2024/8/31–9/2')
    expect(formatDateRange(at('2024-12-31T01:00:00Z'), at('2025-01-02T01:00:00Z'), 'Asia/Taipei')).toBe('2024/12/31–2025/1/2')
    expect(formatDateRange(at('2024-08-14T01:00:00Z'), at('2024-08-14T09:00:00Z'), 'Asia/Taipei')).toBe('2024/8/14')
  })

  test('依時區換日', () => {
    // UTC 8/14 20:00 是台北時間 8/15 04:00
    expect(formatDateRange(at('2024-08-14T20:00:00Z'), at('2024-08-14T21:00:00Z'), 'Asia/Taipei')).toBe('2024/8/15')
  })
})
