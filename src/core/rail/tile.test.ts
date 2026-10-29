import { describe, expect, test } from 'vitest'
import { distanceKm } from '../geo'
import { decodeCoords, decodeTile, encodeCoords, encodeTile, tileId, tileKeyOf, tilePath, tilesForLine, type RailEdge } from './tile.ts'

describe('網格', () => {
  test('網格索引與路徑', () => {
    expect(tileKeyOf(43.06, 141.35)).toEqual({ lat: 172, lon: 565 })
    expect(tileKeyOf(-0.1, -0.1)).toEqual({ lat: -1, lon: -1 })
    expect(tilePath({ lat: 172, lon: 565 })).toBe('v1/172/565.json')
  })

  test('跨 2 個網格的邊兩格都有', () => {
    const ids = tilesForLine([[141.2, 43.1], [141.3, 43.1]]).map(tileId)
    expect(ids.sort()).toEqual(['172/564', '172/565'])
  })
})

describe('座標編碼', () => {
  test('編碼後解碼誤差小於 1 m', () => {
    const coords: [number, number][] = [[141.3602345, 43.0576123], [141.3608765, 43.0579876], [-0.1276543, 51.5073219]]
    const decoded = decodeCoords(encodeCoords(coords))
    decoded.forEach(([lon, lat], i) => {
      expect(distanceKm({ lat, lon }, { lat: coords[i][1], lon: coords[i][0] }) * 1000).toBeLessThan(1)
    })
  })

  test('網格編碼後解碼還原所有欄位，名稱共用索引', () => {
    const edges: RailEdge[] = [
      { id: 1, a: 10, b: 11, service: 0, name: '千歳線', tunnel: false, coords: [[141.6, 42.8], [141.61, 42.81]] },
      { id: 2, a: 11, b: 12, service: 1, name: '千歳線', tunnel: true, coords: [[141.61, 42.81], [141.62, 42.82]] },
      { id: 3, a: 12, b: 13, service: 2, tunnel: false, coords: [[141.62, 42.82], [141.63, 42.83]] },
    ]
    const tile = encodeTile(edges)
    expect(tile.names).toEqual(['千歳線'])
    expect(decodeTile(JSON.parse(JSON.stringify(tile)))).toEqual(edges)
  })
})
