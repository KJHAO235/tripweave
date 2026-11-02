import { describe, expect, test } from 'vitest'
import { createMemoryTripStore, toStoreError, TripStoreError, type FileMeta, type TripRecord } from './tripStore'

const meta = (id: string): FileMeta => ({ id, name: `${id}.gpx`, fingerprint: id, summary: { pointCount: 2 }, addedAt: 1 })
const trip = (id: string, updatedAt: number, files: FileMeta[] = []): TripRecord => ({ id, createdAt: 1, updatedAt, files })

describe('記憶體版 TripStore', () => {
  test('建立、加入、移除、刪除後還原的資料與原本相同', async () => {
    const store = createMemoryTripStore()
    await store.saveTrip(trip('t1', 1, [meta('a')]), [{ id: 'a', text: 'A' }])
    await store.saveTrip(trip('t1', 2, [meta('a'), meta('b')]), [{ id: 'b', text: 'B' }])
    expect(await store.loadFileTexts('t1')).toEqual([
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ])

    const removedText = await store.removeFile(trip('t1', 3, [meta('a')]), 'b')
    expect(removedText).toEqual({ id: 'b', text: 'B' })
    expect(await store.loadFileTexts('t1')).toEqual([{ id: 'a', text: 'A' }])

    const before = (await store.listTrips())[0]
    const removed = (await store.deleteTrip('t1'))!
    expect(await store.listTrips()).toEqual([])
    expect(await store.loadFileTexts('t1')).toEqual([])

    await store.saveTrip(removed.trip, removed.texts)
    expect(await store.listTrips()).toEqual([before])
    expect(await store.loadFileTexts('t1')).toEqual([{ id: 'a', text: 'A' }])
  })

  test('依最後修改時間由新到舊列出', async () => {
    const store = createMemoryTripStore()
    await store.saveTrip(trip('old', 1))
    await store.saveTrip(trip('new', 5))
    await store.saveTrip(trip('mid', 3))
    expect((await store.listTrips()).map((t) => t.id)).toEqual(['new', 'mid', 'old'])
  })

  test('其他旅程的檔案不受影響', async () => {
    const store = createMemoryTripStore()
    await store.saveTrip(trip('t1', 1, [meta('a')]), [{ id: 'a', text: 'A' }])
    await store.saveTrip(trip('t2', 1, [meta('b')]), [{ id: 'b', text: 'B' }])
    await store.deleteTrip('t1')
    expect(await store.loadFileTexts('t2')).toEqual([{ id: 'b', text: 'B' }])
  })

  test('記住上次的旅程', async () => {
    const store = createMemoryTripStore()
    await store.setLastTripId('t1')
    expect(await store.getLastTripId()).toBe('t1')
    await store.setLastTripId(undefined)
    expect(await store.getLastTripId()).toBeUndefined()
  })

  test('寫入失敗時回傳空間不足的訊息', async () => {
    const store = createMemoryTripStore({ failWrites: () => new DOMException('full', 'QuotaExceededError') })
    await expect(store.saveTrip(trip('t1', 1))).rejects.toThrow(new TripStoreError('裝置空間不足，旅程沒有保存'))
    expect(await store.listTrips()).toEqual([])
  })
})

test('其他錯誤轉成一般的保存失敗訊息', () => {
  expect(toStoreError(new Error('x')).message).toBe('無法保存旅程，這次的變更在重新開啟後會消失')
})
