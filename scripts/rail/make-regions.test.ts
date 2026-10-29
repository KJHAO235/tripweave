import { expect, test } from 'vitest'
import { regionPath, selectRegions } from './make-regions.ts'

const square = (x: number, y: number, size: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] as [number, number][][],
})
const url = (path: string) => ({ pbf: `https://download.geofabrik.de/${path}-latest.osm.pbf` })

test('下載網址轉成地區路徑', () => {
  expect(regionPath('https://download.geofabrik.de/europe/germany/berlin-latest.osm.pbf')).toBe('europe/germany/berlin')
})

test('只挑最底層地區，跨國組合區域與洲本身被排除', () => {
  const features = [
    { properties: { id: 'continent', urls: url('continent') }, geometry: square(0, 0, 4) },
    { properties: { id: 'a', parent: 'continent', urls: url('continent/a') }, geometry: square(0, 0, 2) },
    { properties: { id: 'b', parent: 'continent', urls: url('continent/b') }, geometry: square(2, 0, 2) },
    // 跨 a、b 的組合區域，本身沒有子地區
    { properties: { id: 'ab', parent: 'continent', urls: url('continent/ab') }, geometry: square(1, 0, 2) },
    { properties: { id: 'island', parent: 'continent', urls: url('continent/island') }, geometry: square(3, 3, 0.1) },
  ]
  const { groups, overlaps } = selectRegions(features)
  expect(groups.groups).toEqual({ continent: ['continent/a', 'continent/b', 'continent/island'] })
  expect(overlaps).toEqual([])
})
