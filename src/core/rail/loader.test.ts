import { describe, expect, test } from 'vitest'
import { RailTileLoader } from './loader.ts'
import { encodeTile, type RailEdge } from './tile.ts'

const edge: RailEdge = { id: 1, a: 1, b: 2, service: 0, tunnel: false, name: '千歳線', coords: [[141.6, 42.8], [141.61, 42.81]] }

function fakeSite(tiles: string[], options: { delayMs?: number } = {}) {
  const requests: string[] = []
  let active = 0
  let maxActive = 0
  const fetchJson = async (path: string) => {
    requests.push(path)
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? 0))
    active--
    if (path === 'v1/index.json') return { v: 1, generated: '2026-10-29', tileSizeDeg: 0.25, tiles }
    return tiles.some((t) => path === `v1/${t}.json`) ? encodeTile([edge]) : null
  }
  return { fetchJson, requests, maxActive: () => maxActive }
}

describe('鐵路資料載入器', () => {
  test('同一網格只請求一次，index 也只讀一次', async () => {
    const site = fakeSite(['171/566'])
    const loader = new RailTileLoader(site.fetchJson)
    const [first, second] = await Promise.all([loader.loadTiles([{ lat: 171, lon: 566 }]), loader.loadTiles([{ lat: 171, lon: 566 }])])
    await loader.loadTiles([{ lat: 171, lon: 566 }])
    expect(first).toEqual([edge])
    expect(second).toEqual([edge])
    expect(site.requests).toEqual(['v1/index.json', 'v1/171/566.json'])
  })

  test('不在 index 的網格不發請求', async () => {
    const site = fakeSite(['171/566'])
    const loader = new RailTileLoader(site.fetchJson)
    expect(await loader.loadTiles([{ lat: 0, lon: 0 }, { lat: 171, lon: 566 }])).toEqual([edge])
    expect(site.requests).not.toContain('v1/0/0.json')
  })

  test('網站沒有鐵路資料時回傳空陣列，不請求任何網格', async () => {
    const requests: string[] = []
    const loader = new RailTileLoader(async (path) => (requests.push(path), null))
    expect(await loader.loadTiles([{ lat: 171, lon: 566 }])).toEqual([])
    expect(requests).toEqual(['v1/index.json'])
  })

  test('同時最多 4 個請求', async () => {
    const tiles = Array.from({ length: 12 }, (_, i) => `171/${560 + i}`)
    const site = fakeSite(tiles, { delayMs: 5 })
    const loader = new RailTileLoader(site.fetchJson)
    await loader.loadTiles(tiles.map((t) => ({ lat: 171, lon: Number(t.split('/')[1]) })))
    expect(site.requests).toHaveLength(13)
    expect(site.maxActive()).toBeLessThanOrEqual(4)
  })
})

test('超過 64 個網格時移出最久沒用的，再需要時重新取得', async () => {
  const tiles = Array.from({ length: 70 }, (_, i) => `171/${500 + i}`)
  const site = fakeSite(tiles)
  const loader = new RailTileLoader(site.fetchJson)
  const key = (t: string) => ({ lat: 171, lon: Number(t.split('/')[1]) })
  for (const t of tiles) await loader.loadTiles([key(t)])
  expect(site.requests).toHaveLength(71)
  // 最新的仍在快取中，不重新請求
  await loader.loadTiles([key(tiles[69])])
  expect(site.requests).toHaveLength(71)
  // 最早的已被移出，重新請求
  await loader.loadTiles([key(tiles[0])])
  expect(site.requests).toHaveLength(72)
  expect(site.requests[71]).toBe(`v1/${tiles[0]}.json`)
})

test('預先下載的網格之後取用時不再重複請求', async () => {
  const site = fakeSite(['171/566', '171/567'])
  const loader = new RailTileLoader(site.fetchJson)
  await loader.prefetch([{ lat: 171, lon: 566 }, { lat: 171, lon: 567 }, { lat: 0, lon: 0 }])
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(site.requests.sort()).toEqual(['v1/171/566.json', 'v1/171/567.json', 'v1/index.json'])
  expect(await loader.loadTiles([{ lat: 171, lon: 566 }])).toEqual([edge])
  expect(site.requests).toHaveLength(3)
})
