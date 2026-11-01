import { useEffect, useMemo, useState } from 'react'
import { parseXmlInBrowser } from './browserXml'
import { GapPanel } from './components/GapPanel'
import { ImportButton } from './components/ImportButton'
import { TrackMap } from './components/TrackMap'
import { DEFAULT_GAP_THRESHOLD_KM, detectGaps } from './core/gaps'
import { toOverlayFeatures, toRecordedFeatures } from './core/mapFeatures'
import { formatDateRange } from './core/format'
import { combineImports, type ImportFailure } from './core/parse/mergeTracks'
import { parseTrackFile, type ImportResult } from './core/parse/trackFile'
import { trackBounds, tripLabel, type Track } from './core/track'
import { setHasUserData } from './pwa'
import { useRailFills } from './useRailFills'

export default function App() {
  const [track, setTrack] = useState<Track | null>(null)
  const [thresholdKm, setThresholdKm] = useState(DEFAULT_GAP_THRESHOLD_KM)
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ coords: [number, number][] } | null>(null)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  const gaps = useMemo(() => (track ? detectGaps(track, thresholdKm) : []), [track, thresholdKm])
  const { fills, pending, total } = useRailFills(track, gaps)
  // 實線只跟軌跡與缺口有關；補路時只重算資料量小的疊加圖層
  const recorded = useMemo(() => (track ? toRecordedFeatures(track, gaps) : null), [track, gaps])
  const overlay = useMemo(() => (track ? toOverlayFeatures(gaps, fills) : null), [track, gaps, fills])
  const bounds = useMemo(() => (track ? trackBounds(track) : null), [track])
  const selectedGap = gaps.find((gap) => gap.id === selectedGapId) ?? null

  useEffect(() => setHasUserData(track !== null), [track])

  async function handleFiles(files: File[]) {
    const results: { name: string; result: ImportResult }[] = []
    try {
      for (const [i, file] of files.entries()) {
        setProgress({ current: i + 1, total: files.length })
        // 讓出主執行緒，進度才能更新、畫面不會凍結
        await new Promise((resolve) => setTimeout(resolve, 0))
        let result: ImportResult
        try {
          result = parseTrackFile(file.name, await file.text(), parseXmlInBrowser)
        } catch {
          result = { ok: false, code: 'corrupt', message: '無法讀取檔案' }
        }
        results.push({ name: file.name, result })
      }
      const { track: merged, failures } = combineImports(results)
      setErrors(formatFailures(failures, files.length))
      // 全部失敗時保留目前的旅程
      if (merged) {
        setTrack(merged)
        setSelectedGapId(null)
      }
    } finally {
      setProgress(null)
    }
  }

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
        <ImportButton onFiles={handleFiles} />
        {progress && (
          <span className="file-name">
            讀取中 {progress.current}/{progress.total}
          </span>
        )}
        {!progress && track && <span className="file-name">{tripLabel(track, formatDateRange)}</span>}
        {pending > 0 && (
          <span className="file-name progress">
            沿鐵路補齊中 {total - pending}/{total}
          </span>
        )}
      </header>


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
        />
      ) : (
        <p className="hint">點左上角「匯入軌跡」，選擇 KML 或 GPX 檔</p>
      )}

      <footer className="build-info">build {__BUILD_TIME__}</footer>
    </div>
  )
}

/** 單檔時只顯示原因；多檔時每個失敗的檔案一行「檔名：原因」 */
function formatFailures(failures: ImportFailure[], fileCount: number): string[] {
  if (fileCount === 1) return failures.map((f) => f.message)
  return failures.map((f) => `${f.name}：${f.message}`)
}
