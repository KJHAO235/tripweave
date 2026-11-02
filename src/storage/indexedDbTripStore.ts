import { sortByUpdated, toStoreError, type FileText, type TripRecord, type TripStore } from './tripStore'

const DB_NAME = 'tripweave'
const DB_VERSION = 1
const TRIPS = 'trips'
/** 原始文字：{ id, tripId, text }，以 tripId 建索引 */
const FILE_TEXTS = 'fileTexts'
const SETTINGS = 'settings'
const LAST_TRIP_KEY = 'lastTripId'

type StoreName = typeof TRIPS | typeof FILE_TEXTS | typeof SETTINGS

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function openDatabase(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, DB_VERSION)
  req.onupgradeneeded = () => {
    const db = req.result
    db.createObjectStore(TRIPS, { keyPath: 'id' })
    db.createObjectStore(FILE_TEXTS, { keyPath: 'id' }).createIndex('tripId', 'tripId')
    db.createObjectStore(SETTINGS)
  }
  return request(req)
}

/** 瀏覽器內建的 IndexedDB；資料只存在這個裝置上 */
export function createIndexedDbTripStore(): TripStore {
  const db = openDatabase()

  /** 在一個交易中執行，交易完成（寫入確實落地）才回傳結果 */
  async function run<T>(
    names: StoreName[],
    mode: IDBTransactionMode,
    body: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    try {
      const tx = (await db).transaction(names, mode)
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      const result = await body(tx)
      await done
      return result
    } catch (error) {
      throw mode === 'readwrite' ? toStoreError(error) : error
    }
  }

  return {
    listTrips: () =>
      run([TRIPS], 'readonly', async (tx) => sortByUpdated(await request(tx.objectStore(TRIPS).getAll() as IDBRequest<TripRecord[]>))),

    loadFileTexts: (tripId) =>
      run([FILE_TEXTS], 'readonly', async (tx) => {
        const rows = (await request(tx.objectStore(FILE_TEXTS).index('tripId').getAll(tripId))) as (FileText & { tripId: string })[]
        return rows.map(({ id, text }) => ({ id, text }))
      }),

    saveTrip: (trip, texts = []) =>
      run([TRIPS, FILE_TEXTS], 'readwrite', (tx) => {
        tx.objectStore(TRIPS).put(trip)
        for (const { id, text } of texts) tx.objectStore(FILE_TEXTS).put({ id, tripId: trip.id, text })
      }),

    removeFile: (trip, fileId) =>
      run([TRIPS, FILE_TEXTS], 'readwrite', async (tx) => {
        const texts = tx.objectStore(FILE_TEXTS)
        const removed = (await request(texts.get(fileId))) as (FileText & { tripId: string }) | undefined
        texts.delete(fileId)
        tx.objectStore(TRIPS).put(trip)
        return removed && { id: removed.id, text: removed.text }
      }),

    deleteTrip: (tripId) =>
      run([TRIPS, FILE_TEXTS], 'readwrite', async (tx) => {
        const trips = tx.objectStore(TRIPS)
        const trip = (await request(trips.get(tripId))) as TripRecord | undefined
        if (!trip) return undefined
        const texts = tx.objectStore(FILE_TEXTS)
        const rows = (await request(texts.index('tripId').getAll(tripId))) as (FileText & { tripId: string })[]
        for (const row of rows) texts.delete(row.id)
        trips.delete(tripId)
        return { trip, texts: rows.map(({ id, text }) => ({ id, text })) }
      }),

    getLastTripId: () =>
      run([SETTINGS], 'readonly', (tx) => request(tx.objectStore(SETTINGS).get(LAST_TRIP_KEY)) as Promise<string | undefined>),

    setLastTripId: (tripId) =>
      run([SETTINGS], 'readwrite', (tx) => {
        if (tripId === undefined) tx.objectStore(SETTINGS).delete(LAST_TRIP_KEY)
        else tx.objectStore(SETTINGS).put(tripId, LAST_TRIP_KEY)
      }),
  }
}

/** 請求瀏覽器不要在空間不足時自動清除資料；不支援或被拒絕時不影響使用 */
export function requestPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => {})
}
