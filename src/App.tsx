import { useMemo, useState } from 'react'
import { FileList } from './components/FileList'
import { GapPanel } from './components/GapPanel'
import { ImportButton } from './components/ImportButton'
import { TrackMap } from './components/TrackMap'
import { TripList } from './components/TripList'
import { DEFAULT_GAP_THRESHOLD_KM, detectGaps } from './core/gaps'
import { toOverlayFeatures, toRecordedFeatures } from './core/mapFeatures'
import { trackBounds, type Track } from './core/track'
import { buildTrack, fileOrder, tripDisplayName } from './core/trip'
import { useRailFills } from './useRailFills'
import { useTrips } from './useTrips'

export default function App() {
  const [thresholdKm, setThresholdKm] = useState(DEFAULT_GAP_THRESHOLD_KM)
  const [focusRequest, setFocusRequest] = useState<{ coords: [number, number][] } | null>(null)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [listOpen, setListOpen] = useState(false)
  const trips = useTrips(setErrors)
  const { current, progress } = trips

  const files = current?.files
  const track = useMemo(() => (files ? buildTrack(files) : null), [files])
  // 選取的缺口跟著軌跡走；換了旅程或檔案後原本的缺口 id 不再有意義
  const [selection, setSelection] = useState<{ track: Track | null; gapId: string } | null>(null)
  const selectedGapId = selection?.track === track ? selection.gapId : null
  const setSelectedGapId = (gapId: string | null) => setSelection(gapId ? { track, gapId } : null)
  const gaps = useMemo(() => (track ? detectGaps(track, thresholdKm) : []), [track, thresholdKm])
  const { fills, pending, total } = useRailFills(track, gaps)
  // 實線只跟軌跡與缺口有關；補路時只重算資料量小的疊加圖層
  const recorded = useMemo(() => (track ? toRecordedFeatures(track, gaps) : null), [track, gaps])
  const overlay = useMemo(() => (track ? toOverlayFeatures(gaps, fills) : null), [track, gaps, fills])
  const bounds = useMemo(() => (track ? trackBounds(track) : null), [track])
  const selectedGap = gaps.find((gap) => gap.id === selectedGapId) ?? null
  // 檔案列表依合併後的順序（時間或檔名）排列
  const orderedFiles = useMemo(() => {
    if (!current || !track) return []
    const byId = new Map(current.record.files.map((f) => [f.id, f]))
    return fileOrder(track).flatMap((id) => byId.get(id) ?? [])
  }, [current, track])

  return (
    <div className="app">
      <TrackMap
        recorded={recorded}
        overlay={overlay}
        bounds={bounds}
        selectedGap={selectedGap}
        focusRequest={focusRequest}
        onSelectGap={(id) => {
          setSelectedGapId(id)
          setPanelExpanded(true)
        }}
      />

      <header className="toolbar">
        <ImportButton label={current || progress?.label === '開啟中' ? '加入檔案' : '匯入軌跡'} onFiles={(files) => void trips.addFiles(files)} />
        {progress && (
          <span className="file-name">
            {progress.label} {progress.current}/{progress.total}
          </span>
        )}
        {!progress && (current || trips.list.length > 0) && (
          <button className="file-name trip-name" onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen}>
            {current ? tripDisplayName(current.record.customName, current.record.files) : '我的旅程'} ▾
          </button>
        )}
        {pending > 0 && (
          <span className="file-name progress">
            沿鐵路補齊中 {total - pending}/{total}
          </span>
        )}
      </header>

      {listOpen && (
        <>
          <div className="trip-list-backdrop" onClick={() => setListOpen(false)} />
          <TripList
            trips={trips.list}
            currentId={current?.record.id ?? null}
            onSelect={(id) => {
              setListOpen(false)
              if (id !== current?.record.id) void trips.openTrip(id)
            }}
            onRename={(name) => void trips.renameTrip(name)}
            onDelete={(id) => void trips.deleteTrip(id)}
            onNewTrip={(files) => {
              setListOpen(false)
              void trips.createTrip(files)
            }}
          />
        </>
      )}

      <div className="notices">
        {errors.length > 0 && (
          <div className="error" role="alert">
            <ul>
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <button onClick={() => setErrors([])} aria-label="關閉錯誤訊息">
              ✕
            </button>
          </div>
        )}
        {trips.undoNotice && (
          <div className="undo" role="status">
            <span>{trips.undoNotice.message}</span>
            <button onClick={trips.undoNotice.undo}>復原</button>
          </div>
        )}
      </div>

      {track ? (
        <GapPanel
          gaps={gaps}
          fills={fills}
          thresholdKm={thresholdKm}
          onThresholdChange={setThresholdKm}
          selectedGapId={selectedGapId}
          onSelectFromList={(id) => {
            setSelectedGapId(id)
            const gap = gaps.find((g) => g.id === id)
            if (!gap) return
            const fill = fills.get(id)
            const coords: [number, number][] = [[gap.from.lon, gap.from.lat], [gap.to.lon, gap.to.lat], ...(fill?.path ?? [])]
            setFocusRequest({ coords })
          }}
          onClearSelection={() => setSelectedGapId(null)}
          expanded={panelExpanded}
          onToggleExpanded={() => setPanelExpanded(!panelExpanded)}
        >
          {current && <FileList files={orderedFiles} onRemove={(id) => void trips.removeFile(id)} />}
        </GapPanel>
      ) : (
        trips.ready && !progress && <p className="hint">點左上角「匯入軌跡」，選擇 KML 或 GPX 檔</p>
      )}

    </div>
  )
}
