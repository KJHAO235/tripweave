import { useMemo, useState } from 'react'
import { parseXmlInBrowser } from './browserXml'
import { GapPanel } from './components/GapPanel'
import { ImportButton } from './components/ImportButton'
import { TrackMap } from './components/TrackMap'
import { DEFAULT_GAP_THRESHOLD_KM, detectGaps } from './core/gaps'
import { toMapFeatures } from './core/mapFeatures'
import { parseTrackFile } from './core/parse/trackFile'
import { trackBounds, type Track } from './core/track'
import { useRailFills } from './useRailFills'

export default function App() {
  const [track, setTrack] = useState<Track | null>(null)
  const [thresholdKm, setThresholdKm] = useState(DEFAULT_GAP_THRESHOLD_KM)
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ coords: [number, number][] } | null>(null)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const gaps = useMemo(() => (track ? detectGaps(track, thresholdKm) : []), [track, thresholdKm])
  const { fills, pending, total } = useRailFills(track, gaps)
  const features = useMemo(() => (track ? toMapFeatures(track, gaps, fills) : null), [track, gaps, fills])
  const bounds = useMemo(() => (track ? trackBounds(track) : null), [track])
  const selectedGap = gaps.find((gap) => gap.id === selectedGapId) ?? null

  async function handleFile(file: File) {
    setLoading(true)
    try {
      const result = parseTrackFile(file.name, await file.text(), parseXmlInBrowser)
      if (!result.ok) {
        // 匯入失敗時保留目前的軌跡
        setError(result.message)
        return
      }
      setError(null)
      setTrack(result.track)
      setSelectedGapId(null)
    } catch {
      setError('無法讀取檔案')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <TrackMap
        features={features}
        bounds={bounds}
        selectedGap={selectedGap}
        focusRequest={focusRequest}
        onSelectGap={(id) => {
          setSelectedGapId(id)
          setPanelExpanded(true)
        }}
      />

      <header className="toolbar">
        <ImportButton onFile={handleFile} />
        {loading && <span className="file-name">讀取中…</span>}
        {!loading && track?.name && <span className="file-name">{track.name}</span>}
        {pending > 0 && (
          <span className="file-name progress">
            沿鐵路補齊中 {total - pending}/{total}
          </span>
        )}
      </header>


      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="關閉錯誤訊息">
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
