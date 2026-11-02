import type { FileSummary } from '../core/trip'

/** 旅程中一個檔案的摘要；原始文字另外存放，列出旅程時不必讀取 */
export interface FileMeta {
  id: string
  /** 原始檔名（含副檔名） */
  name: string
  fingerprint: string
  summary: FileSummary
  addedAt: number
}

export interface TripRecord {
  id: string
  customName?: string
  createdAt: number
  updatedAt: number
  files: FileMeta[]
}

/** 檔案匯入時的原始文字 */
export interface FileText {
  id: string
  text: string
}

/** 保存旅程的地方；所有寫入失敗都以 TripStoreError 回報，訊息可直接顯示給使用者 */
export interface TripStore {
  /** 依最後修改時間由新到舊 */
  listTrips(): Promise<TripRecord[]>
  loadFileTexts(tripId: string): Promise<FileText[]>
  /** 寫入旅程紀錄，並一起寫入給定檔案的原始文字（新增或還原時） */
  saveTrip(trip: TripRecord, texts?: FileText[]): Promise<void>
  /** 寫入已拿掉該檔案的旅程紀錄並刪除檔案文字；回傳刪掉的文字供復原 */
  removeFile(trip: TripRecord, fileId: string): Promise<FileText | undefined>
  /** 刪除旅程與所有檔案文字；回傳刪掉的資料供復原 */
  deleteTrip(tripId: string): Promise<{ trip: TripRecord; texts: FileText[] } | undefined>
  getLastTripId(): Promise<string | undefined>
  setLastTripId(tripId: string | undefined): Promise<void>
}

export class TripStoreError extends Error {}

/** 把儲存時發生的錯誤轉成使用者看得懂的訊息 */
export function toStoreError(error: unknown): TripStoreError {
  if (error instanceof TripStoreError) return error
  const name = (error as { name?: string } | null)?.name
  if (name === 'QuotaExceededError') return new TripStoreError('裝置空間不足，旅程沒有保存')
  return new TripStoreError('無法保存旅程，這次的變更在重新開啟後會消失')
}

export function sortByUpdated(trips: TripRecord[]): TripRecord[] {
  return [...trips].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 記憶體中的實作：用於測試，以及瀏覽器不支援 IndexedDB 時（資料只在這次開啟期間有效） */
export function createMemoryTripStore(options: { failWrites?: () => unknown } = {}): TripStore {
  const trips = new Map<string, TripRecord>()
  const texts = new Map<string, FileText & { tripId: string }>()
  let lastTripId: string | undefined
  // 回傳複本，避免呼叫端改到保存的資料（與 IndexedDB 的行為一致）
  const copy = <T>(value: T): T => structuredClone(value)
  const write = async <T>(action: () => T): Promise<T> => {
    const failure = options.failWrites?.()
    if (failure) throw toStoreError(failure)
    return action()
  }

  return {
    async listTrips() {
      return sortByUpdated([...trips.values()].map(copy))
    },
    async loadFileTexts(tripId) {
      return [...texts.values()].filter((t) => t.tripId === tripId).map(({ id, text }) => ({ id, text }))
    },
    saveTrip: (trip, newTexts = []) =>
      write(() => {
        trips.set(trip.id, copy(trip))
        for (const { id, text } of newTexts) texts.set(id, { id, text, tripId: trip.id })
      }),
    removeFile: (trip, fileId) =>
      write(() => {
        trips.set(trip.id, copy(trip))
        const removed = texts.get(fileId)
        texts.delete(fileId)
        return removed && { id: removed.id, text: removed.text }
      }),
    deleteTrip: (tripId) =>
      write(() => {
        const trip = trips.get(tripId)
        if (!trip) return undefined
        trips.delete(tripId)
        const removed: FileText[] = []
        for (const t of [...texts.values()]) {
          if (t.tripId !== tripId) continue
          texts.delete(t.id)
          removed.push({ id: t.id, text: t.text })
        }
        return { trip, texts: removed }
      }),
    async getLastTripId() {
      return lastTripId
    },
    setLastTripId: (tripId) =>
      write(() => {
        lastTripId = tripId
      }),
  }
}
