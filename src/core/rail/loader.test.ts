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
