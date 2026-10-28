import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MapFeatures } from '../core/mapFeatures'
import { TRACK_COLORS } from './style'

const SOURCE_RECORDED = 'recorded'
const SOURCE_GAPS = 'gaps'
export const LAYER_GAPS_HIT = 'gaps-hit'
const LAYER_GAPS_SELECTED = 'gaps-selected'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function addTrackLayers(map: MapLibreMap) {
  map.addSource(SOURCE_RECORDED, { type: 'geojson', data: EMPTY })
  map.addSource(SOURCE_GAPS, { type: 'geojson', data: EMPTY })

  map.addLayer({
    id: 'recorded-line',
    type: 'line',
    source: SOURCE_RECORDED,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': TRACK_COLORS.recorded, 'line-width': 3 },
  })
  map.addLayer({
    id: 'gaps-line',
    type: 'line',
    source: SOURCE_GAPS,
    paint: { 'line-color': TRACK_COLORS.gap, 'line-width': 3, 'line-dasharray': [2, 1.5] },
  })
  map.addLayer({
    id: LAYER_GAPS_SELECTED,
    type: 'line',
    source: SOURCE_GAPS,
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': TRACK_COLORS.gapSelected, 'line-width': 6, 'line-dasharray': [2, 1] },
  })
  // 看不見的加寬線，讓手指容易點到細虛線
  map.addLayer({
    id: LAYER_GAPS_HIT,
    type: 'line',
    source: SOURCE_GAPS,
    paint: { 'line-color': '#000', 'line-width': 24, 'line-opacity': 0 },
  })
}

export function setTrackData(map: MapLibreMap, features: MapFeatures | null) {
  ;(map.getSource(SOURCE_RECORDED) as GeoJSONSource).setData(features?.recorded ?? EMPTY)
  ;(map.getSource(SOURCE_GAPS) as GeoJSONSource).setData(features?.gaps ?? EMPTY)
}

export function setSelectedGap(map: MapLibreMap, gapId: string | null) {
  map.setFilter(LAYER_GAPS_SELECTED, ['==', ['get', 'id'], gapId ?? ''])
}
