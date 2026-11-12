import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildCameraPath, cameraAt, frameAt, type AnimationRoute } from '../core/animation'
import type { Bounds } from '../core/track'
import { setAnimationCurrent, setAnimationDone, setAnimationLayersVisible, type AnimationLines } from '../map/animationLayers'
import { setTrackLayersVisible } from '../map/trackLayers'

interface Props {
  map: MapLibreMap
  route: AnimationRoute
  /** 播完後回到的全景範圍 */
  bounds: Bounds | null
  onClose: () => void
}

const MAX_ZOOM = 14
/** 底部控制列的高度，鏡頭置中時避開 */
const CONTROLS_PADDING = { top: 60, bottom: 110, left: 40, right: 40 }

function doneLines(route: AnimationRoute, upTo: number): AnimationLines {
  return {
    type: 'FeatureCollection',
    features: route.pieces.slice(0, upTo).flatMap((piece) =>
      piece.mode === 'jump' ? [] : [{ type: 'Feature' as const, properties: { mode: piece.mode }, geometry: { type: 'LineString' as const, coordinates: piece.coords } }],
    ),
  }
}

function formatDate(time: number): string {
  const d = new Date(time)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 沿路線播放的動畫：路線逐步畫出、鏡頭跟著目前位置移動 */
export function Player({ map, route, bounds, onClose }: Props) {
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const [date, setDate] = useState<string | null>(null)
  const progressRef = useRef(0)
  const lastPiece = useRef(-1)
  // 播放前先算好整段鏡頭（平滑過的中心與縮放），播放時只取值，畫面才不會晃
  const camera = useMemo(
    () =>
      buildCameraPath(route, (bounds) => map.cameraForBounds(bounds, { padding: CONTROLS_PADDING, maxZoom: MAX_ZOOM })?.zoom ?? MAX_ZOOM),
    [route, map],
  )

  /** 把指定進度畫到地圖上，鏡頭依預先算好的路徑移動 */
  function render(p: number) {
    const frame = frameAt(route, p)
    if (!frame) return
    if (frame.pieceIndex !== lastPiece.current) {
      setAnimationDone(map, doneLines(route, frame.pieceIndex))
      lastPiece.current = frame.pieceIndex
    }
    setAnimationCurrent(map, route.pieces[frame.pieceIndex].mode, frame.partial, frame.position)
    setDate(frame.time !== undefined ? formatDate(frame.time) : null)

    const { center, zoom } = cameraAt(camera, p)
    map.jumpTo({ center, zoom, padding: { top: 0, left: 0, right: 0, bottom: CONTROLS_PADDING.bottom - CONTROLS_PADDING.top } })
  }

  // 進入與離開播放模式：切換圖層
  useEffect(() => {
    setTrackLayersVisible(map, false)
    setAnimationLayersVisible(map, true)
    const pause = () => setPlaying(false)
    map.on('click', pause)
    map.on('dragstart', pause)
    return () => {
      map.off('click', pause)
      map.off('dragstart', pause)
      setAnimationLayersVisible(map, false)
      setTrackLayersVisible(map, true)
      map.jumpTo({ padding: { top: 0, left: 0, right: 0, bottom: 0 } })
    }
  }, [map])

  // 播放迴圈
  useEffect(() => {
    if (!playing) return
    if (progressRef.current >= 1) {
      progressRef.current = 0
      lastPiece.current = -1
    }
    let raf = 0
    let last = performance.now()
    let lastUi = 0
    const tick = (now: number) => {
      const p = Math.min(1, progressRef.current + (now - last) / 1000 / route.durationSec)
      last = now
      progressRef.current = p
      render(p)
      // 進度條每 100 ms 更新一次即可，避免每一格都重新渲染 React
      if (now - lastUi > 100 || p >= 1) {
        setProgress(p)
        lastUi = now
      }
      if (p >= 1) {
        setPlaying(false)
        if (bounds) map.fitBounds(bounds, { padding: { top: 80, bottom: 140, left: 40, right: 40 }, duration: 1500 })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // render 只讀 ref 與穩定的參數，不需要列入依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, route, map])

  return (
    <div className="player">
      {date && <div className="player-date">{date}</div>}
      <div className="player-controls">
        <button className="player-toggle" onClick={() => setPlaying(!playing)} aria-label={playing ? '暫停' : '播放'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          aria-label="播放進度"
          onChange={(event) => {
            const p = Number(event.target.value) / 1000
            setPlaying(false)
            progressRef.current = p
            setProgress(p)
            lastPiece.current = -1
            render(p)
          }}
        />
        <button className="player-close" onClick={onClose} aria-label="結束播放">
          ✕
        </button>
      </div>
    </div>
  )
}
