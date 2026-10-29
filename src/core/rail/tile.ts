/** 網格邊長（度），約 25 km */
export const TILE_SIZE_DEG = 0.25
export const TILE_FORMAT_VERSION = 1
const COORD_SCALE = 1e5

/** 0 主線、1 側線或渡線、2 車廠、支線等 */
export type ServiceClass = 0 | 1 | 2

export interface RailEdge {
  /** way id × 4096 + 切段序號 */
  id: number
  /** 兩端節點 id，鐵路網靠它相接 */
  a: number
  b: number
  service: ServiceClass
  name?: string
  tunnel: boolean
  /** [經度, 緯度] */
  coords: [number, number][]
}

/** [id, a, b, service, 名稱索引（-1 為無名稱）, 隧道 0/1, 差分編碼座標] */
export type EncodedEdge = [number, number, number, ServiceClass, number, 0 | 1, number[]]

export interface RailTile {
  v: number
  names: string[]
  edges: EncodedEdge[]
}

export interface RailIndex {
  v: number
  generated: string
  tileSizeDeg: number
  /** "<lat>/<lon>" 網格索引 */
  tiles: string[]
}

export interface TileKey {
  lat: number
  lon: number
}

export function tileKeyOf(lat: number, lon: number): TileKey {
  return { lat: Math.floor(lat / TILE_SIZE_DEG), lon: Math.floor(lon / TILE_SIZE_DEG) }
}

export function tileId({ lat, lon }: TileKey): string {
  return `${lat}/${lon}`
}

export function tilePath(key: TileKey): string {
  return `v${TILE_FORMAT_VERSION}/${tileId(key)}.json`
}

/** 涵蓋某個經緯度範圍的所有網格 */
export function tilesForBounds(south: number, west: number, north: number, east: number): TileKey[] {
  const sw = tileKeyOf(south, west)
  const ne = tileKeyOf(north, east)
  const keys: TileKey[] = []
  for (let lat = sw.lat; lat <= ne.lat; lat++) {
    for (let lon = sw.lon; lon <= ne.lon; lon++) keys.push({ lat, lon })
  }
  return keys
}

/** 一條線經過的網格；每段以外接矩形計算，寧可多放不可漏放 */
export function tilesForLine(coords: [number, number][]): TileKey[] {
  const ids = new Map<string, TileKey>()
  const add = (key: TileKey) => ids.set(tileId(key), key)
  if (coords.length === 1) add(tileKeyOf(coords[0][1], coords[0][0]))
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1]
    const [lon2, lat2] = coords[i]
    for (const key of tilesForBounds(Math.min(lat1, lat2), Math.min(lon1, lon2), Math.max(lat1, lat2), Math.max(lon1, lon2))) add(key)
  }
  return [...ids.values()]
}

export function encodeCoords(coords: [number, number][]): number[] {
  const out: number[] = []
  let prevLon = 0
  let prevLat = 0
  for (const [lon, lat] of coords) {
    const ilon = Math.round(lon * COORD_SCALE)
    const ilat = Math.round(lat * COORD_SCALE)
    out.push(ilon - prevLon, ilat - prevLat)
    prevLon = ilon
    prevLat = ilat
  }
  return out
}

export function decodeCoords(encoded: number[]): [number, number][] {
  const coords: [number, number][] = []
  let lon = 0
  let lat = 0
  for (let i = 0; i < encoded.length; i += 2) {
    lon += encoded[i]
    lat += encoded[i + 1]
    coords.push([lon / COORD_SCALE, lat / COORD_SCALE])
  }
  return coords
}

export function encodeTile(edges: RailEdge[]): RailTile {
  const names: string[] = []
  const nameIndex = new Map<string, number>()
  const encoded = edges.map((edge): EncodedEdge => {
    let n = -1
    if (edge.name) {
      n = nameIndex.get(edge.name) ?? names.push(edge.name) - 1
      nameIndex.set(edge.name, n)
    }
    return [edge.id, edge.a, edge.b, edge.service, n, edge.tunnel ? 1 : 0, encodeCoords(edge.coords)]
  })
  return { v: TILE_FORMAT_VERSION, names, edges: encoded }
}

export function decodeTile(tile: RailTile): RailEdge[] {
  return tile.edges.map(([id, a, b, service, n, tunnel, coords]) => {
    const edge: RailEdge = { id, a, b, service, tunnel: tunnel === 1, coords: decodeCoords(coords) }
    if (n >= 0) edge.name = tile.names[n]
    return edge
  })
}
