import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MapFeatures } from '../core/mapFeatures'
import { TRACK_COLORS } from './style'

const SOURCE_RECORDED = 'recorded'
const SOURCE_GAPS = 'gaps'
const SOURCE_INFERRED = 'inferred'
export const LAYER_GAPS_HIT = 'gaps-hit'
export const LAYER_INFERRED_HIT = 'inferred-hit'
const LAYER_GAPS_SELECTED = 'gaps-selected'
const LAYER_INFERRED_SELECTED = 'inferred-selected'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export function addTrackLayers(map: MapLibreMap) {
  map.addSource(SOURCE_RECORDED, { type: 'geojson', data: EMPTY })
  map.addSource(SOURCE_GAPS, { type: 'geojson', data: EMPTY })
  map.addSource(SOURCE_INFERRED, { type: 'geojson', data: EMPTY })

  map.addLayer({
    id: 'recorded-line',
    type: 'line',
    source: SOURCE_RECORDED,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': TRACK_COLORS.recorded, 'line-width': 3 },
  })
  // 寬度 0 的虛線段搭配圓形端點，畫出圓點線
  map.addLayer({
    id: 'inferred-line',
    type: 'line',
    source: SOURCE_INFERRED,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TRACK_COLORS.inferred, 'line-width': 4, 'line-dasharray': [0, 2] },
  })
  map.addLayer({
    id: LAYER_INFERRED_SELECTED,
    type: 'line',
    source: SOURCE_INFERRED,
    filter: ['==', ['get', 'gapId'], ''],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TRACK_COLORS.inferred, 'line-width': 7, 'line-dasharray': [0, 1.6] },
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
  // 看不見的加寬線，讓手指容易點到細虛線與圓點線
  map.addLayer({
    id: LAYER_INFERRED_HIT,
    type: 'line',
    source: SOURCE_INFERRED,
    paint: { 'line-color': '#000', 'line-width': 24, 'line-opacity': 0 },
  })
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
  ;(map.getSource(SOURCE_INFERRED) as GeoJSONSource).setData(features?.inferred ?? EMPTY)
}

export function setSelectedGap(map: MapLibreMap, gapId: string | null) {
  map.setFilter(LAYER_GAPS_SELECTED, ['==', ['get', 'id'], gapId ?? ''])
  map.setFilter(LAYER_INFERRED_SELECTED, ['==', ['get', 'gapId'], gapId ?? ''])
}
