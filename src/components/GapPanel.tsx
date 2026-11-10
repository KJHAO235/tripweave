import { useEffect, useRef, type ReactNode } from 'react'
import { formatDuration, formatKm, formatLatLon, formatSpeed } from '../core/format'
import type { Gap } from '../core/gaps'
import type { GapFill } from '../core/fill'
import { Legend } from './Legend'

const THRESHOLD_STEPS_KM = [0.5, 1, 2, 3, 5, 10, 20, 50]

interface Props {
  gaps: Gap[]
  fills: ReadonlyMap<string, GapFill>
  thresholdKm: number
  onThresholdChange: (km: number) => void
  selectedGapId: string | null
  onSelectFromList: (gapId: string) => void
  onClearSelection: () => void
  expanded: boolean
  onToggleExpanded: () => void
  /** 展開時顯示在門檻上方（檔案列表） */
  children?: ReactNode
}

export function GapPanel({
  gaps,
  fills,
  thresholdKm,
  onThresholdChange,
  selectedGapId,
  onSelectFromList,
  onClearSelection,
  expanded,
  onToggleExpanded,
  children,
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
        <span className="panel-title">
          缺口 {gaps.length} 個{fills.size > 0 && <span className="filled-count"> · 已補齊 {fills.size}</span>}
        </span>
        <span className="panel-toggle">{expanded ? '收合' : '展開'}</span>
      </button>
      {/* 圖例放在面板內，避免蓋住地圖上的軌跡 */}
      <Legend />

      {expanded && (
        <>
          {children}
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

          {selectedGap && <GapDetail gap={selectedGap} fill={fills.get(selectedGap.id)} onClose={onClearSelection} />}

          <ol className="gap-list" ref={listRef}>
            {gaps.map((gap, index) => {
              const fill = fills.get(gap.id)
              return (
                <li key={gap.id} data-gap-id={gap.id}>
                  <button className={gap.id === selectedGapId ? 'selected' : ''} onClick={() => onSelectFromList(gap.id)}>
                    <span className="rank">#{index + 1}</span>
                    <span className={fill ? `distance filled ${fill.mode}` : 'distance'}>{formatKm(gap.distanceKm)}</span>
                    {gap.durationSec !== undefined && <span className="meta">{formatDuration(gap.durationSec)}</span>}
                    {fill && (
                      <span className={`tag inferred ${fill.mode}`}>{fill.mode === 'rail' ? `鐵路 ${fill.routeNames[0] ?? ''}` : '飛機'}</span>
                    )}
                    {gap.isFileBoundary ? (
                      <span className="tag">檔案之間</span>
                    ) : (
                      gap.isSegmentBoundary && <span className="tag">段落交界</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

function GapDetail({ gap, fill, onClose }: { gap: Gap; fill: GapFill | undefined; onClose: () => void }) {
  return (
    <div className={fill ? `gap-detail filled ${fill.mode}` : 'gap-detail'} role="status">
      <div className="gap-detail-header">
        <strong>{detailTitle(gap, fill)}</strong>
        <button onClick={onClose} aria-label="關閉缺口資訊">
          ✕
        </button>
      </div>
      {gap.isFileBoundary && <p className="gap-note">位於兩個檔案之間</p>}
      <dl>
        {fill?.mode === 'rail' && (
          <>
            <dt>經過路線</dt>
            <dd>{fill.routeNames.length > 0 ? fill.routeNames.join('、') : '（未命名鐵路）'}</dd>
            <dt>推算長度</dt>
            <dd>{formatKm(fill.lengthKm)}（沿鐵路）</dd>
          </>
        )}
        {fill?.mode === 'flight' && (
          <>
            <dt>判斷依據</dt>
            <dd>
              {fill.basis.kind === 'speed'
                ? `平均時速 ${Math.round(fill.basis.speedKmh)} km/h`
                : `直線距離 ${Math.round(fill.basis.distanceKm)} km，鐵路無法補齊`}
            </dd>
            <dt>推算長度</dt>
            <dd>{formatKm(fill.lengthKm)}（大圓航線）</dd>
          </>
        )}
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

function detailTitle(gap: Gap, fill: GapFill | undefined): string {
  const km = formatKm(gap.distanceKm)
  if (!fill) return `缺口 ${km}`
  return fill.mode === 'rail' ? `已沿鐵路補齊（缺口 ${km}）` : `推算為飛機（缺口 ${km}）`
}
