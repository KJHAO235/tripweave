import { useState } from 'react'
import { tripDisplayName, tripMeta } from '../core/trip'
import type { TripRecord } from '../storage/tripStore'

interface Props {
  trips: TripRecord[]
  currentId: string | null
  onSelect: (tripId: string) => void
  onRename: (name: string) => void
  onDelete: (tripId: string) => void
  onNewTrip: (files: File[]) => void
}

/** 點工具列的旅程名稱後展開：改名、切換、新增與刪除旅程 */
export function TripList({ trips, currentId, onSelect, onRename, onDelete, onNewTrip }: Props) {
  const current = trips.find((t) => t.id === currentId)

  return (
    <section className="trip-list" aria-label="旅程列表">
      {current && <RenameField key={current.id} trip={current} onRename={onRename} />}

      <label className="new-trip">
        ＋ 新旅程
        {/* 與匯入按鈕相同：不設定 accept，iOS 才能點選 .kml / .gpx */}
        <input
          type="file"
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            if (files.length > 0) onNewTrip(files)
          }}
        />
      </label>

      <ul>
        {trips.map((trip) => {
          const name = tripDisplayName(trip.customName, trip.files)
          // 沒有自訂名稱的多檔旅程，名稱本身就是檔案數與日期範圍，不重複顯示
          const showMeta = Boolean(trip.customName) || trip.files.length === 1
          return (
            <li key={trip.id} className={trip.id === currentId ? 'current' : undefined}>
              <button className="trip-select" onClick={() => onSelect(trip.id)}>
                <span className="trip-title">{name}</span>
                {showMeta && <span className="trip-meta">{tripMeta(trip.files)}</span>}
              </button>
              <button className="trip-delete" onClick={() => onDelete(trip.id)} aria-label={`刪除「${name}」`}>
                刪除
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** 目前旅程的名稱；離開輸入框或按 Enter 時保存，清空時回到自動名稱 */
function RenameField({ trip, onRename }: { trip: TripRecord; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(trip.customName ?? '')
  return (
    <label className="rename">
      <span>目前旅程名稱</span>
      <input
        value={draft}
        placeholder={tripDisplayName(undefined, trip.files)}
        enterKeyHint="done"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onRename(draft)}
        onKeyDown={(event) => {
          // 中文輸入法選字時的 Enter 不算完成
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
        }}
      />
    </label>
  )
}
