import { useEffect, useRef } from 'react'
import { formatDuration, formatKm, formatLatLon, formatSpeed } from '../core/format'
import type { Gap } from '../core/gaps'

const THRESHOLD_STEPS_KM = [0.5, 1, 2, 3, 5, 10, 20, 50]

interface Props {
  gaps: Gap[]
  thresholdKm: number
  onThresholdChange: (km: number) => void
  selectedGapId: string | null
  onSelectFromList: (gapId: string) => void
  onClearSelection: () => void
  expanded: boolean
  onToggleExpanded: () => void
}

export function GapPanel({
  gaps,
  thresholdKm,
  onThresholdChange,
  selectedGapId,
  onSelectFromList,
  onClearSelection,
  expanded,
  onToggleExpanded,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null)
  const selectedGap = gaps.find((gap) => gap.id === selectedGapId) ?? null

  // 在地圖上點選缺口時，把列表捲到對應項目
  useEffect(() => {
    if (!selectedGapId) return
    listRef.current?.querySelector(`[data-gap-id="${selectedGapId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedGapId])

  const stepIndex = Math.max(0, THRESHOLD_STEPS_KM.indexOf(thresholdKm))

  return (
    <section className={`panel ${expanded ? 'expanded' : 'collapsed'}`}>
      <button className="panel-handle" onClick={onToggleExpanded} aria-expanded={expanded}>
        <span className="panel-title">缺口 {gaps.length} 個</span>
        <span className="panel-toggle">{expanded ? '收合' : '展開'}</span>
      </button>

      {expanded && (
        <>
          <label className="threshold">
            <span>缺口門檻：相鄰點距離超過 {thresholdKm} km</span>
            <input
              type="range"
              min={0}
              max={THRESHOLD_STEPS_KM.length - 1}
              step={1}
              value={stepIndex}
              onChange={(event) => onThresholdChange(THRESHOLD_STEPS_KM[Number(event.target.value)])}
            />
          </label>

          {selectedGap && <GapDetail gap={selectedGap} onClose={onClearSelection} />}

          <ol className="gap-list" ref={listRef}>
            {gaps.map((gap, index) => (
              <li key={gap.id} data-gap-id={gap.id}>
                <button className={gap.id === selectedGapId ? 'selected' : ''} onClick={() => onSelectFromList(gap.id)}>
                  <span className="rank">#{index + 1}</span>
                  <span className="distance">{formatKm(gap.distanceKm)}</span>
                  {gap.durationSec !== undefined && <span className="meta">{formatDuration(gap.durationSec)}</span>}
                  {gap.isSegmentBoundary && <span className="tag">段落交界</span>}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function GapDetail({ gap, onClose }: { gap: Gap; onClose: () => void }) {
  return (
    <div className="gap-detail" role="status">
      <div className="gap-detail-header">
        <strong>缺口 {formatKm(gap.distanceKm)}</strong>
        <button onClick={onClose} aria-label="關閉缺口資訊">
          ✕
        </button>
      </div>
      <dl>
        <dt>起點</dt>
        <dd>{formatLatLon(gap.from.lat, gap.from.lon)}</dd>
        <dt>終點</dt>
        <dd>{formatLatLon(gap.to.lat, gap.to.lon)}</dd>
        <dt>直線距離</dt>
        <dd>{formatKm(gap.distanceKm)}</dd>
        {gap.durationSec !== undefined && (
          <>
            <dt>時間長度</dt>
            <dd>{formatDuration(gap.durationSec)}</dd>
          </>
        )}
        {gap.speedKmh !== undefined && (
          <>
            <dt>平均速度</dt>
            <dd>{formatSpeed(gap.speedKmh)}</dd>
          </>
        )}
      </dl>
    </div>
  )
}
