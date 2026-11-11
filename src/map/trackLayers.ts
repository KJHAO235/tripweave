import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { MapFeatures } from '../core/mapFeatures'
import { TRACK_COLORS } from './style'

const SOURCE_RECORDED = 'recorded'
const SOURCE_GAPS = 'gaps'
const SOURCE_INFERRED = 'inferred'
export const LAYER_GAPS_HIT = 'gaps-hit'
export const LAYER_INFERRED_HIT = 'inferred-hit'
const LAYER_GAPS_SELECTED = 'gaps-selected'
const LAYER_INFERRED_SELECTED = 'inferred-selected'
const LAYER_FLIGHT_SELECTED = 'inferred-flight-selected'
const LAYER_FERRY_SELECTED = 'inferred-ferry-selected'
const IS_RAIL: ExpressionSpecification = ['==', ['get', 'mode'], 'rail']
const IS_FLIGHT: ExpressionSpecification = ['==', ['get', 'mode'], 'flight']
const IS_FERRY: ExpressionSpecification = ['==', ['get', 'mode'], 'ferry']

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
    filter: IS_RAIL,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TRACK_COLORS.inferred, 'line-width': 4, 'line-dasharray': [0, 2] },
  })
  // 渡輪：綠色長短交錯虛線
  map.addLayer({
    id: 'inferred-ferry-line',
    type: 'line',
    source: SOURCE_INFERRED,
    filter: IS_FERRY,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': TRACK_COLORS.inferredFerry, 'line-width': 3, 'line-dasharray': [5, 2, 1, 2] },
  })
  // 飛機：青色長虛線，與鐵路的紫色圓點線、缺口的橘色短虛線區分
  map.addLayer({
    id: 'inferred-flight-line',
    type: 'line',
    source: SOURCE_INFERRED,
    filter: IS_FLIGHT,
    paint: { 'line-color': TRACK_COLORS.inferredFlight, 'line-width': 3, 'line-dasharray': [4, 2] },
  })
  map.addLayer({
    id: LAYER_INFERRED_SELECTED,
    type: 'line',
    source: SOURCE_INFERRED,
    filter: ['all', IS_RAIL, ['==', ['get', 'gapId'], '']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': TRACK_COLORS.inferred, 'line-width': 7, 'line-dasharray': [0, 1.6] },
  })
  map.addLayer({
    id: LAYER_FERRY_SELECTED,
    type: 'line',
    source: SOURCE_INFERRED,
    filter: ['all', IS_FERRY, ['==', ['get', 'gapId'], '']],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': TRACK_COLORS.inferredFerry, 'line-width': 6, 'line-dasharray': [5, 1.5, 1, 1.5] },
  })
  map.addLayer({
    id: LAYER_FLIGHT_SELECTED,
    type: 'line',
    source: SOURCE_INFERRED,
    filter: ['all', IS_FLIGHT, ['==', ['get', 'gapId'], '']],
    paint: { 'line-color': TRACK_COLORS.inferredFlight, 'line-width': 6, 'line-dasharray': [4, 1.5] },
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

/** 實際記錄的路段資料量大（多日旅程可達數十萬點），只在軌跡或缺口改變時更新 */
export function setRecordedData(map: MapLibreMap, recorded: MapFeatures['recorded'] | null) {
  ;(map.getSource(SOURCE_RECORDED) as GeoJSONSource).setData(recorded ?? EMPTY)
}

export function setOverlayData(map: MapLibreMap, overlay: Pick<MapFeatures, 'gaps' | 'inferred'> | null) {
  ;(map.getSource(SOURCE_GAPS) as GeoJSONSource).setData(overlay?.gaps ?? EMPTY)
  ;(map.getSource(SOURCE_INFERRED) as GeoJSONSource).setData(overlay?.inferred ?? EMPTY)
}

export function setSelectedGap(map: MapLibreMap, gapId: string | null) {
  map.setFilter(LAYER_GAPS_SELECTED, ['==', ['get', 'id'], gapId ?? ''])
  map.setFilter(LAYER_INFERRED_SELECTED, ['all', IS_RAIL, ['==', ['get', 'gapId'], gapId ?? '']])
  map.setFilter(LAYER_FERRY_SELECTED, ['all', IS_FERRY, ['==', ['get', 'gapId'], gapId ?? '']])
  map.setFilter(LAYER_FLIGHT_SELECTED, ['all', IS_FLIGHT, ['==', ['get', 'gapId'], gapId ?? '']])
}
