import { MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import type { Gap } from '../core/gaps'
import type { MapFeatures } from '../core/mapFeatures'
import type { Bounds } from '../core/track'
import { MAP_STYLE_URL } from '../map/style'
import '../map/worker'
import { addTrackLayers, LAYER_GAPS_HIT, LAYER_INFERRED_HIT, setSelectedGap, setTrackData } from '../map/trackLayers'

interface Props {
  features: MapFeatures | null
  /** 匯入新軌跡時變更，地圖會縮放到這個範圍 */
  bounds: Bounds | null
  selectedGap: Gap | null
  /** 從列表點選時傳入新的物件，地圖就移到這些座標的範圍；在地圖上點選不移動 */
  focusRequest: { coords: [number, number][] } | null
  onSelectGap: (gapId: string) => void
}

// 底部面板會蓋住畫面下方，縮放時預留空間讓軌跡落在可見範圍
function padding() {
  return { top: 72, left: 32, right: 32, bottom: Math.round(window.innerHeight * 0.45) + 24 }
}

export function TrackMap({ features, bounds, selectedGap, focusRequest, onSelectGap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const onSelectRef = useRef(onSelectGap)
  useEffect(() => {
    onSelectRef.current = onSelectGap
  })

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: MAP_STYLE_URL,
      center: [139.77, 35.71],
      zoom: 4,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.on('load', () => {
      addTrackLayers(map)
      setReady(true)
    })
    map.on('click', LAYER_GAPS_HIT, (event) => {
      const id = event.features?.[0]?.properties?.id
      if (typeof id === 'string') onSelectRef.current(id)
    })
    map.on('click', LAYER_INFERRED_HIT, (event) => {
      const id = event.features?.[0]?.properties?.gapId
      if (typeof id === 'string') onSelectRef.current(id)
    })
    for (const layer of [LAYER_GAPS_HIT, LAYER_INFERRED_HIT]) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (ready) setTrackData(mapRef.current!, features)
  }, [ready, features])

  useEffect(() => {
    if (ready && bounds) mapRef.current!.fitBounds(bounds, { padding: padding(), duration: 0 })
  }, [ready, bounds])

  useEffect(() => {
    if (ready) setSelectedGap(mapRef.current!, selectedGap?.id ?? null)
  }, [ready, selectedGap])

  useEffect(() => {
    if (!ready || !focusRequest) return
    const lons = focusRequest.coords.map(([lon]) => lon)
    const lats = focusRequest.coords.map(([, lat]) => lat)
    mapRef.current!.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: padding(), maxZoom: 13 },
    )
  }, [ready, focusRequest])

  return <div ref={containerRef} className="map" />
}
