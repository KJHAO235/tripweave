import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildCameraPath, cameraAt, frameAt, type AnimationRoute } from '../core/animation'
import type { Bounds } from '../core/track'
import { setAnimationCurrent, setAnimationDone, setAnimationLayersVisible, setTerrain3D, type AnimationLines } from '../map/animationLayers'
import { setTrackLayersVisible } from '../map/trackLayers'

interface Props {
  map: MapLibreMap
  route: AnimationRoute
  /** 播完後回到的全景範圍 */
  bounds: Bounds | null
  onClose: () => void
}

const MAX_ZOOM = 14
/**
 * 3D：鏡頭貼近地形、從背後往前看。看前 1 秒到後 6 秒的範圍再拉近 1.3 級，山才顯得立體，畫面上的移動不會太快；
 * 圓點放在畫面下方三分之一處，前方留給地形
 */
const PITCH_3D = 70
const MAX_ZOOM_3D = 15
const ZOOM_3D_OFFSET = 1.3
const ZOOM_WINDOW_3D = { behindSec: 1, aheadSec: 6 }
/** 3D 播放時的繪圖解析度上限：iPhone 為 3 倍，降到 2 倍像素量約少一半，肉眼差別不大 */
const PIXEL_RATIO_3D = 2
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
  const [is3D, setIs3D] = useState(true)
  const is3DRef = useRef(is3D)
  is3DRef.current = is3D
  const progressRef = useRef(0)
  const lastPiece = useRef(-1)
  // 播放前先算好整段鏡頭（平滑過的中心與縮放），播放時只取值，畫面才不會晃
  const camera2D = useMemo(
    () =>
      buildCameraPath(route, (bounds) => map.cameraForBounds(bounds, { padding: CONTROLS_PADDING, maxZoom: MAX_ZOOM })?.zoom ?? MAX_ZOOM),
    [route, map],
  )
  const camera3D = useMemo(
    () =>
      buildCameraPath(
        route,
        (bounds) => map.cameraForBounds(bounds, { padding: CONTROLS_PADDING, maxZoom: MAX_ZOOM_3D })?.zoom ?? MAX_ZOOM_3D,
        ZOOM_WINDOW_3D,
      ),
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

    const threeD = is3DRef.current
    const { center, zoom, bearing } = cameraAt(threeD ? camera3D : camera2D, p)
    const height = map.getContainer().clientHeight
    map.jumpTo({
      center,
      zoom: threeD ? Math.min(MAX_ZOOM_3D + 1, zoom + ZOOM_3D_OFFSET) : zoom,
      bearing: threeD ? bearing : 0,
      pitch: threeD ? PITCH_3D : 0,
      // 3D 時把中心往下移到畫面下方約三分之一處，前方看得更遠
      padding: threeD
        ? { top: Math.round(height * 0.4), left: 0, right: 0, bottom: CONTROLS_PADDING.bottom }
        : { top: 0, left: 0, right: 0, bottom: CONTROLS_PADDING.bottom - CONTROLS_PADDING.top },
    })
  }

  /** 整趟旅程的全景（平面、北方朝上） */
  function showOverview(duration: number) {
    if (bounds) map.fitBounds(bounds, { padding: { top: 80, bottom: 140, left: 40, right: 40 }, pitch: 0, bearing: 0, duration })
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
      setTerrain3D(map, false)
      map.setPixelRatio(window.devicePixelRatio)
      map.jumpTo({ pitch: 0, bearing: 0, padding: { top: 0, left: 0, right: 0, bottom: 0 } })
    }
  }, [map])

  // 2D／3D 切換：地形只在 3D 時載入，3D 時降低繪圖解析度
  useEffect(() => {
    setTerrain3D(map, is3D)
    map.setPixelRatio(is3D ? Math.min(window.devicePixelRatio, PIXEL_RATIO_3D) : window.devicePixelRatio)
    // 播完後切換：維持整趟旅程的全景，不跳回終點的近景
    if (progressRef.current >= 1) {
      showOverview(0)
      return
    }
    render(progressRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is3D, map])

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
        showOverview(1500)
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
        <button className="player-mode" onClick={() => setIs3D(!is3D)} aria-label={is3D ? '切換為 2D' : '切換為 3D'}>
          {is3D ? '2D' : '3D'}
        </button>
        <button className="player-close" onClick={onClose} aria-label="結束播放">
          ✕
        </button>
      </div>
    </div>
  )
}
