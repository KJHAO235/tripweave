import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { PieceMode } from '../core/animation'
import { TRACK_COLORS } from './style'

const SOURCE_DONE = 'anim-done'
const SOURCE_CURRENT = 'anim-current'
const SOURCE_HEAD = 'anim-head'
const SOURCE_TERRAIN = 'terrain-dem'
const LAYER_HILLSHADE = 'terrain-hillshade'

/** AWS Open Data 的公開地形圖磚（Terrarium 格式，免費、不需註冊）；只在 3D 播放時載入 */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
/** 地形起伏放大倍數，讓山勢在動畫中更明顯 */
const TERRAIN_EXAGGERATION = 1.4

export type AnimationLines = GeoJSON.FeatureCollection<GeoJSON.LineString, { mode: PieceMode }>

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const isMode = (mode: PieceMode): ExpressionSpecification => ['==', ['get', 'mode'], mode]

/** 與一般顯示相同的樣式：實際記錄實線、推算依交通方式的虛線、缺口橘色虛線 */
const LINE_STYLES: { mode: PieceMode; paint: Record<string, unknown>; round?: boolean }[] = [
  { mode: 'recorded', paint: { 'line-color': TRACK_COLORS.recorded, 'line-width': 4 }, round: true },
  { mode: 'rail', paint: { 'line-color': TRACK_COLORS.inferred, 'line-width': 5, 'line-dasharray': [0, 2] }, round: true },
  { mode: 'ferry', paint: { 'line-color': TRACK_COLORS.inferredFerry, 'line-width': 4, 'line-dasharray': [5, 2, 1, 2] } },
  { mode: 'flight', paint: { 'line-color': TRACK_COLORS.inferredFlight, 'line-width': 4, 'line-dasharray': [4, 2] } },
  { mode: 'gap', paint: { 'line-color': TRACK_COLORS.gap, 'line-width': 3, 'line-dasharray': [2, 1.5] } },
]

export function addAnimationLayers(map: MapLibreMap) {
  map.addSource(SOURCE_TERRAIN, {
    type: 'raster-dem',
    tiles: [TERRAIN_TILES],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 14,
    attribution: '地形 © AWS Terrain Tiles',
  })
  // 山體陰影放在軌跡圖層下方，只在 3D 播放時顯示
  map.addLayer(
    {
      id: LAYER_HILLSHADE,
      type: 'hillshade',
      source: SOURCE_TERRAIN,
      layout: { visibility: 'none' },
      paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#6b7280' },
    },
    'recorded-line',
  )
  for (const id of [SOURCE_DONE, SOURCE_CURRENT, SOURCE_HEAD]) map.addSource(id, { type: 'geojson', data: EMPTY })
  for (const source of [SOURCE_DONE, SOURCE_CURRENT]) {
    for (const { mode, paint, round } of LINE_STYLES) {
      map.addLayer({
        id: `${source}-${mode}`,
        type: 'line',
        source,
        filter: isMode(mode),
        layout: { visibility: 'none', 'line-join': 'round', ...(round ? { 'line-cap': 'round' as const } : {}) },
        paint,
      })
    }
  }
  map.addLayer({
    id: `${SOURCE_HEAD}-dot`,
    type: 'circle',
    source: SOURCE_HEAD,
    layout: { visibility: 'none' },
    // 傾斜時圓點仍保持正圓、面向鏡頭
    paint: {
      'circle-radius': 7,
      'circle-color': '#fff',
      'circle-stroke-color': TRACK_COLORS.recorded,
      'circle-stroke-width': 4,
      'circle-pitch-alignment': 'viewport',
    },
  })
}

export function setAnimationLayersVisible(map: MapLibreMap, visible: boolean) {
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('anim-')) map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
  }
}

/** 已播完的片段；只在換片段時更新 */
export function setAnimationDone(map: MapLibreMap, lines: AnimationLines) {
  ;(map.getSource(SOURCE_DONE) as GeoJSONSource).setData(lines)
}

/** 目前片段畫到的位置與圓點；每一格都更新，資料量小 */
export function setAnimationCurrent(map: MapLibreMap, mode: PieceMode, coords: [number, number][], head: [number, number]) {
  ;(map.getSource(SOURCE_CURRENT) as GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: mode === 'jump' || coords.length < 2 ? [] : [{ type: 'Feature', properties: { mode }, geometry: { type: 'LineString', coordinates: coords } }],
  })
  ;(map.getSource(SOURCE_HEAD) as GeoJSONSource).setData({ type: 'Point', coordinates: head })
}

/** 3D：開啟地形起伏與山體陰影；關閉時回到平面地圖 */
export function setTerrain3D(map: MapLibreMap, enabled: boolean) {
  map.setTerrain(enabled ? { source: SOURCE_TERRAIN, exaggeration: TERRAIN_EXAGGERATION } : null)
  map.setLayoutProperty(LAYER_HILLSHADE, 'visibility', enabled ? 'visible' : 'none')
}
