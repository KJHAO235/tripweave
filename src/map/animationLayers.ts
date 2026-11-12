import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { PieceMode } from '../core/animation'
import { TRACK_COLORS } from './style'

const SOURCE_DONE = 'anim-done'
const SOURCE_CURRENT = 'anim-current'
const SOURCE_HEAD = 'anim-head'
const SOURCE_TERRAIN = 'terrain-dem'
const LAYER_HILLSHADE = 'terrain-hillshade'
const SOURCE_SATELLITE = 'satellite'
const LAYER_SATELLITE = 'satellite-imagery'

/**
 * EOX 的 Sentinel-2 無雲衛星圖（不需註冊；2018 年後的版本授權為 CC BY-NC-SA 4.0，限非商業使用）；
 * 解析度約 10 公尺，只在 3D 播放時顯示
 */
const SATELLITE_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg'

/** AWS Open Data 的公開地形圖磚（Terrarium 格式，免費、不需註冊）；只在 3D 播放時載入 */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
/** 地形起伏放大倍數，讓山勢在動畫中更明顯 */
const TERRAIN_EXAGGERATION = 1.8

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
    // 地形只需要到第 11 級（約 75 公尺），再細也看不出差別，卻要多下載好幾倍的圖磚
    maxzoom: 11,
    attribution: '地形 © AWS Terrain Tiles',
  })
  map.addSource(SOURCE_SATELLITE, {
    type: 'raster',
    tiles: [SATELLITE_TILES],
    tileSize: 256,
    // 衛星圖原始解析度約 10 公尺，第 13 級（約 19 公尺）看起來差不多，圖磚數量少很多；更細的縮放直接放大使用
    maxzoom: 13,
    attribution: 'Sentinel-2 cloudless 2023 © EOX IT Services GmbH（Copernicus Sentinel 資料）',
  })
  // 衛星圖與山體陰影放在底圖的道路與地名下方（第一個線或文字圖層之前），只在 3D 播放時顯示
  const firstOverlay = map.getStyle().layers.find((layer) => layer.type === 'line' || layer.type === 'symbol')?.id
  // 圖磚載到就直接顯示，不做淡入，移動中畫面比較快補齊
  map.addLayer(
    { id: LAYER_SATELLITE, type: 'raster', source: SOURCE_SATELLITE, layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
    firstOverlay,
  )
  map.addLayer(
    {
      id: LAYER_HILLSHADE,
      type: 'hillshade',
      source: SOURCE_TERRAIN,
      layout: { visibility: 'none' },
      paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#1f2937', 'hillshade-highlight-color': '#ffffff' },
    },
    firstOverlay,
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

/** 3D 的天空：遠方以地平線的霧氣淡出，還沒載入的遠處圖磚不會露出空白 */
const SKY_3D = {
  'sky-color': '#7fb6e8',
  'sky-horizon-blend': 0.6,
  'horizon-color': '#dbeafe',
  'horizon-fog-blend': 0.6,
  'fog-color': '#dbeafe',
  'fog-ground-blend': 0.4,
}

/** 3D：開啟地形起伏、衛星圖、山體陰影與天空；關閉時回到平面地圖 */
export function setTerrain3D(map: MapLibreMap, enabled: boolean) {
  map.setTerrain(enabled ? { source: SOURCE_TERRAIN, exaggeration: TERRAIN_EXAGGERATION } : null)
  map.setSky(enabled ? SKY_3D : {})
  for (const layer of [LAYER_SATELLITE, LAYER_HILLSHADE]) map.setLayoutProperty(layer, 'visibility', enabled ? 'visible' : 'none')
  // 加入新的資料來源時，精簡版的資料來源標示會自動展開，蓋住播放列；收回成 ⓘ，需要時再點開。
  // 圖磚載入後才會展開，因此在第一次載完時再收一次（之後使用者自己點開則不干涉）
  const collapse = () => map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
  collapse()
  map.once('idle', collapse)
}
