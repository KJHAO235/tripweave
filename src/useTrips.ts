import { useEffect, useRef, useState } from 'react'
import { parseXmlInBrowser } from './browserXml'
import type { ImportFailure } from './core/parse/mergeTracks'
import { parseTrackFile, type ImportResult } from './core/parse/trackFile'
import { classifyNewFiles, daysApart, fileSummary, formatApart, tripDisplayName, type NewFile, type TripFile } from './core/trip'
import { setUpdateDeferred } from './pwa'
import { createIndexedDbTripStore } from './storage/indexedDbTripStore'
import { createMemoryTripStore, type FileMeta, type FileText, type TripRecord, type TripStore } from './storage/tripStore'

/** 復原提示顯示的時間 */
const UNDO_MS = 6000
/** 加入的檔案和目前旅程相隔超過這麼多天時，建議改成新旅程 */
const SUGGEST_NEW_TRIP_DAYS = 7

export interface CurrentTrip {
  record: TripRecord
  files: TripFile[]
}

export interface Progress {
  label: '讀取中' | '開啟中'
  current: number
  total: number
}

export interface UndoNotice {
  message: string
  undo: () => void
}

/** 加入的檔案和目前旅程相隔很久時，建議改成新旅程 */
export interface TripSuggestion {
  message: string
}

/** readSelected 準備好的一個檔案：摘要、解析結果與原始文字 */
interface SelectedEntry {
  meta: FileMeta
  tripFile: TripFile
  text: FileText
}

export interface Trips {
  /** 依最後修改時間由新到舊 */
  list: TripRecord[]
  current: CurrentTrip | null
  /** 第一次讀取保存的旅程完成前為 false，避免先閃出初始畫面 */
  ready: boolean
  progress: Progress | null
  undoNotice: UndoNotice | null
  dismissUndo: () => void
  suggestion: TripSuggestion | null
  /** 把建議中的檔案移到一趟新旅程並切換過去 */
  acceptSuggestion: () => Promise<void>
  dismissSuggestion: () => void
  createTrip: (files: File[]) => Promise<void>
  addFiles: (files: File[]) => Promise<void>
  removeFile: (fileId: string) => Promise<void>
  renameTrip: (name: string) => Promise<void>
  deleteTrip: (tripId: string) => Promise<void>
  openTrip: (tripId: string) => Promise<void>
}

function defaultStore(): TripStore {
  return typeof indexedDB === 'undefined' ? createMemoryTripStore() : createIndexedDbTripStore()
}

/** 不用 crypto.randomUUID：它只在 HTTPS／localhost 可用，用區網 IP 在 iPhone 上開發時會失敗 */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 讓出主執行緒，進度才能更新、畫面不會凍結 */
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0))

function parseText(name: string, text: string): ImportResult {
  try {
    return parseTrackFile(name, text, parseXmlInBrowser)
  } catch {
    return { ok: false, code: 'corrupt', message: '無法讀取檔案' }
  }
}

/** 旅程的保存、開啟與編輯；所有變更先更新畫面再寫入儲存，寫入失敗時以 onError 告知 */
export function useTrips(onError: (messages: string[]) => void): Trips {
  const [store] = useState(defaultStore)
  const [list, setList] = useState<TripRecord[]>([])
  const [current, setCurrent] = useState<CurrentTrip | null>(null)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null)
  // 建議需要使用者決定，不自動消失；開啟、修改旅程時清除
  const [suggestion, setSuggestion] = useState<(TripSuggestion & { tripId: string; entries: SelectedEntry[] }) | null>(null)
  // 只有最後一次開啟的旅程會顯示，連續點選時先前的讀取結果直接丟棄
  const openToken = useRef(0)
  const busyCount = useRef(0)
  // 開啟與修改依序執行，避免兩個操作同時以舊的旅程狀態為基礎（例如開啟中又加入檔案）
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // 依序執行的操作可能在之後的 render 才跑，一律從 ref 讀取最新狀態
  const currentRef = useRef(current)
  const listRef = useRef(list)

  function updateCurrent(next: CurrentTrip | null) {
    currentRef.current = next
    setCurrent(next)
  }

  function updateList(next: TripRecord[] | ((prev: TripRecord[]) => TripRecord[])) {
    listRef.current = typeof next === 'function' ? next(listRef.current) : next
    setList(listRef.current)
  }

  async function busy<T>(task: () => Promise<T>): Promise<T> {
    busyCount.current++
    setUpdateDeferred(true)
    try {
      return await task()
    } finally {
      if (--busyCount.current === 0) setUpdateDeferred(false)
    }
  }

  async function write(task: () => Promise<unknown>) {
    try {
      await busy(task)
    } catch (error) {
      onError([(error as Error).message])
    }
  }

  function serial<A extends unknown[]>(task: (...args: A) => Promise<void>) {
    return (...args: A): Promise<void> => {
      const run = queue.current.then(() => task(...args))
      queue.current = run.catch(() => {})
      return run
    }
  }

  async function refreshList() {
    try {
      updateList(await store.listTrips())
    } catch {
      // 列表讀不到時維持原樣
    }
  }

  function showUndo(message: string, undo: () => Promise<void>) {
    clearTimeout(undoTimer.current)
    const notice: UndoNotice = {
      message,
      undo: () => {
        clearTimeout(undoTimer.current)
        setUndoNotice(null)
        void serial(undo)()
      },
    }
    setUndoNotice(notice)
    undoTimer.current = setTimeout(() => setUndoNotice((n) => (n === notice ? null : n)), UNDO_MS)
  }

  /** 依序讀取並解析檔案，顯示進度 */
  async function parseAll(items: { name: string; read: () => Promise<string> }[], label: Progress['label']) {
    const results: { name: string; text: string; result: ImportResult }[] = []
    for (const [i, item] of items.entries()) {
      setProgress({ label, current: i + 1, total: items.length })
      await yieldToBrowser()
      let text = ''
      let result: ImportResult
      try {
        text = await item.read()
        result = parseText(item.name, text)
      } catch {
        result = { ok: false, code: 'corrupt', message: '無法讀取檔案' }
      }
      results.push({ name: item.name, text, result })
    }
    return results
  }

  /** 讀取使用者選取的檔案，分成新增、略過與失敗，並準備好要保存的資料 */
  async function readSelected(files: File[], existing: FileMeta[]) {
    const parsed = await parseAll(
      files.map((file) => ({ name: file.name, read: () => file.text() })),
      '讀取中',
    )
    const textOf = new Map(parsed.flatMap((p) => (p.result.ok ? [[p.result.track, p.text] as const] : [])))
    const { added, skipped, failures } = classifyNewFiles(
      existing.map((f) => f.fingerprint),
      parsed.map(({ name, result }) => ({ name, result })),
    )
    const now = Date.now()
    const entries = added.map((file: NewFile): SelectedEntry => {
      const id = newId()
      return {
        meta: { id, name: file.name, fingerprint: file.fingerprint, summary: fileSummary(file.track), addedAt: now } satisfies FileMeta,
        tripFile: { id, name: file.name, track: file.track } satisfies TripFile,
        text: { id, text: textOf.get(file.track)! } satisfies FileText,
      }
    })
    const messages = formatFailures(failures, files.length)
    for (const name of skipped) messages.push(`${name}：已在旅程中，已略過`)
    return { entries, messages }
  }

  async function openTrip(tripId: string, records: TripRecord[] = listRef.current) {
    setSuggestion(null)
    const record = records.find((t) => t.id === tripId)
    if (!record) return
    const token = ++openToken.current
    await busy(async () => {
      try {
        const texts = new Map((await store.loadFileTexts(tripId)).map((t) => [t.id, t.text]))
        const parsed = await parseAll(
          record.files.map((meta) => ({ name: meta.name, read: async () => texts.get(meta.id) ?? '' })),
          '開啟中',
        )
        if (token !== openToken.current) return
        const files: TripFile[] = []
        const failed: ImportFailure[] = []
        record.files.forEach((meta, i) => {
          const { result } = parsed[i]
          if (result.ok) files.push({ id: meta.id, name: meta.name, track: result.track })
          else failed.push({ name: meta.name, message: result.message })
        })
        updateCurrent({ record, files })
        if (failed.length > 0) onError(failed.map((f) => `${f.name}：${f.message}`))
        void store.setLastTripId(tripId).catch(() => {})
      } catch {
        if (token === openToken.current) onError(['無法開啟旅程'])
      } finally {
        if (token === openToken.current) setProgress(null)
      }
    })
  }

  // 開啟 App 時回到上次的旅程（開發模式的 StrictMode 會執行兩次 effect，只做一次）
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const [records, lastId] = await Promise.all([store.listTrips(), store.getLastTripId()])
        updateList(records)
        if (lastId) await serial(openTrip)(lastId, records)
      } catch {
        // 讀不到保存的資料時從初始畫面開始
      } finally {
        setReady(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在啟動時執行一次
  }, [store])

  async function createTrip(selected: File[]) {
    setSuggestion(null)
    await busy(async () => {
      try {
        const { entries, messages } = await readSelected(selected, [])
        onError(messages)
        // 全部無法匯入時不建立旅程，目前的旅程保持不變
        if (entries.length === 0) return
        openToken.current++
        const now = Date.now()
        const record: TripRecord = { id: newId(), createdAt: now, updatedAt: now, files: entries.map((e) => e.meta) }
        updateCurrent({ record, files: entries.map((e) => e.tripFile) })
        updateList((prev) => [record, ...prev])
        await write(async () => {
          await store.saveTrip(
            record,
            entries.map((e) => e.text),
          )
          await store.setLastTripId(record.id)
        })
      } finally {
        setProgress(null)
      }
    })
  }

  async function addFiles(selected: File[]) {
    const trip = currentRef.current
    if (!trip) return createTrip(selected)
    setSuggestion(null)
    await busy(async () => {
      try {
        const { entries, messages } = await readSelected(selected, trip.record.files)
        onError(messages)
        if (entries.length === 0) return
        const latest = currentRef.current
        if (latest?.record.id !== trip.record.id) return
        const record: TripRecord = { ...latest.record, updatedAt: Date.now(), files: [...latest.record.files, ...entries.map((e) => e.meta)] }
        updateCurrent({ record, files: [...latest.files, ...entries.map((e) => e.tripFile)] })
        updateList((prev) => [record, ...prev.filter((t) => t.id !== record.id)])
        await write(() =>
          store.saveTrip(
            record,
            entries.map((e) => e.text),
          ),
        )
        suggestNewTrip(record.id, latest.record.files, entries)
      } finally {
        setProgress(null)
      }
    })
  }

  /** 以加入前的旅程判斷：相隔超過 7 天的新檔案，建議移到新旅程 */
  function suggestNewTrip(tripId: string, before: FileMeta[], entries: SelectedEntry[]) {
    const summaries = before.map((f) => f.summary)
    const far = entries.flatMap((entry) => {
      const days = daysApart(summaries, entry.meta.summary)
      return days !== undefined && days > SUGGEST_NEW_TRIP_DAYS ? [{ entry, days }] : []
    })
    if (far.length === 0) return
    const nearest = Math.min(...far.map((f) => f.days))
    const message =
      far.length === 1
        ? `${far[0].entry.meta.name} 和目前旅程相隔${formatApart(nearest)}`
        : `${far.length} 個檔案和目前旅程相隔${formatApart(nearest)}以上`
    setSuggestion({ tripId, entries: far.map((f) => f.entry), message })
  }

  async function acceptSuggestion() {
    const pending = suggestion
    setSuggestion(null)
    const trip = currentRef.current
    if (!pending || trip?.record.id !== pending.tripId) return
    const moving = new Set(pending.entries.map((e) => e.meta.id))
    // 從目前旅程拿掉這些檔案；檔案資料（解析結果與原文）沿用加入時讀到的，不必再讀一次
    const remaining: TripRecord = { ...trip.record, updatedAt: Date.now(), files: trip.record.files.filter((f) => !moving.has(f.id)) }
    const now = Date.now()
    const created: TripRecord = { id: newId(), createdAt: now, updatedAt: now + 1, files: pending.entries.map((e) => e.meta) }
    openToken.current++
    updateCurrent({ record: created, files: pending.entries.map((e) => e.tripFile) })
    updateList((prev) => [created, remaining, ...prev.filter((t) => t.id !== remaining.id)])
    await write(async () => {
      for (const id of moving) await store.removeFile(remaining, id)
      await store.saveTrip(
        created,
        pending.entries.map((e) => e.text),
      )
      await store.setLastTripId(created.id)
    })
  }

  async function removeFile(fileId: string) {
    setSuggestion(null)
    const trip = currentRef.current
    if (!trip) return
    // 移除最後一個檔案時視同刪除旅程
    if (trip.record.files.length <= 1) return deleteTrip(trip.record.id)
    const meta = trip.record.files.find((f) => f.id === fileId)
    const tripFile = trip.files.find((f) => f.id === fileId)
    if (!meta) return
    const record: TripRecord = { ...trip.record, updatedAt: Date.now(), files: trip.record.files.filter((f) => f.id !== fileId) }
    updateCurrent({ record, files: trip.files.filter((f) => f.id !== fileId) })
    updateList((prev) => [record, ...prev.filter((t) => t.id !== record.id)])
    let removedText: FileText | undefined
    await write(async () => {
      removedText = await store.removeFile(record, fileId)
    })

    showUndo(`已移除 ${meta.name}`, async () => {
      const latest = currentRef.current
      const base = latest?.record.id === record.id ? latest.record : (await store.listTrips()).find((t) => t.id === record.id)
      if (!base) return
      const restored: TripRecord = { ...base, updatedAt: Date.now(), files: [...base.files, meta] }
      if (latest?.record.id === record.id && tripFile) updateCurrent({ record: restored, files: [...latest.files, tripFile] })
      updateList((prev) => [restored, ...prev.filter((t) => t.id !== restored.id)])
      await write(() => store.saveTrip(restored, removedText ? [removedText] : []))
    })
  }

  async function renameTrip(name: string) {
    setSuggestion(null)
    const trip = currentRef.current
    if (!trip) return
    const customName = name.trim() || undefined
    if (customName === trip.record.customName) return
    const record: TripRecord = { ...trip.record, customName, updatedAt: Date.now() }
    if (!customName) delete record.customName
    updateCurrent({ ...trip, record })
    updateList((prev) => [record, ...prev.filter((t) => t.id !== record.id)])
    await write(() => store.saveTrip(record))
  }

  async function deleteTrip(tripId: string) {
    setSuggestion(null)
    const wasCurrent = currentRef.current?.record.id === tripId
    const previous = wasCurrent ? currentRef.current : null
    const remaining = listRef.current.filter((t) => t.id !== tripId)
    updateList(remaining)
    if (wasCurrent) {
      openToken.current++
      updateCurrent(null)
    }
    let removed: { trip: TripRecord; texts: FileText[] } | undefined
    await write(async () => {
      removed = await store.deleteTrip(tripId)
    })
    // 刪除目前的旅程時改為顯示下一趟最近修改的旅程
    if (wasCurrent) {
      if (remaining.length > 0) await openTrip(remaining[0].id, remaining)
      else void store.setLastTripId(undefined).catch(() => {})
    }
    if (!removed) return
    const { trip, texts } = removed
    showUndo(`已刪除「${tripDisplayName(trip.customName, trip.files)}」`, async () => {
      await write(() => store.saveTrip(trip, texts))
      await refreshList()
      if (previous) {
        openToken.current++
        updateCurrent(previous)
        void store.setLastTripId(trip.id).catch(() => {})
      }
    })
  }

  return {
    list,
    current,
    ready,
    progress,
    undoNotice,
    dismissUndo: () => setUndoNotice(null),
    suggestion: suggestion && { message: suggestion.message },
    acceptSuggestion: serial(acceptSuggestion),
    dismissSuggestion: () => setSuggestion(null),
    createTrip: serial(createTrip),
    addFiles: serial(addFiles),
    removeFile: serial(removeFile),
    renameTrip: serial(renameTrip),
    deleteTrip: serial(deleteTrip),
    openTrip: serial((id: string) => openTrip(id)),
  }
}

/** 單檔時只顯示原因；多檔時每個失敗的檔案一行「檔名：原因」 */
function formatFailures(failures: ImportFailure[], fileCount: number): string[] {
  if (fileCount === 1) return failures.map((f) => f.message)
  return failures.map((f) => `${f.name}：${f.message}`)
}
