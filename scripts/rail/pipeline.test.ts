import { describe, expect, test } from 'vitest'
import { splitIntoEdges } from './edges.ts'
import { parseOplWay, unescapeOpl } from './opl.ts'
import { simplify } from './simplify.ts'

describe('OPL 解析', () => {
  test('解析 way 的 id、標籤（含特殊字元）與節點座標', () => {
    const way = parseOplWay(
      'w42 v3 dV c0 t2024-10-10T04:27:15Z i0 u Tname=%5343%%6b73%%7dda%,service=siding,tunnel=yes Nn1x141.65y42.82,n2x141.66y42.83',
    )
    expect(way).toEqual({
      id: 42,
      tags: { name: '千歳線', service: 'siding', tunnel: 'yes' },
      nodes: [
        { id: 1, lon: 141.65, lat: 42.82 },
        { id: 2, lon: 141.66, lat: 42.83 },
      ],
    })
  })

  test('節點沒有座標時略過；非 way 的行回傳 null', () => {
    expect(parseOplWay('w7 v1 Trailway=rail Nn1x1y2,n2xy,n3x3y4')!.nodes.map((n) => n.id)).toEqual([1, 3])
    expect(parseOplWay('n1 v1 x1 y2')).toBeNull()
  })

  test('跳脫字元：空白與逗號', () => {
    expect(unescapeOpl('Taiwan%20%High%2c%Speed')).toBe('Taiwan High,Speed')
  })
})

describe('在路口切邊', () => {
  test('兩條 way 在中間節點相交時切成 4 條邊，路口節點 id 相同', () => {
    const ways = [
      parseOplWay('w1 v1 Trailway=rail Nn10x0y0,n11x1y0,n12x2y0')!,
      parseOplWay('w2 v1 Trailway=rail Nn20x1y-1,n11x1y0,n21x1y1')!,
    ]
    const edges = splitIntoEdges(ways)
    expect(edges).toHaveLength(4)
    expect(edges.map((e) => [e.a, e.b])).toEqual([[10, 11], [11, 12], [20, 11], [11, 21]])
    expect(new Set(edges.map((e) => e.id)).size).toBe(4)
  })

  test('沒有路口的 way 保持一條邊，並帶有 service 類別、名稱與隧道', () => {
    const [edge] = splitIntoEdges([parseOplWay('w3 v1 Trailway=rail,service=yard,name=A,tunnel=yes Nn1x0y0,n2x1y0,n3x2y0')!])
    expect(edge).toMatchObject({ a: 1, b: 3, service: 2, name: 'A', tunnel: true })
    expect(edge.coords).toHaveLength(3)
  })
})

describe('Douglas–Peucker 精簡', () => {
  test('直線上的中間點被移除、兩端保留', () => {
    expect(simplify([[0, 0], [0.001, 0], [0.002, 0], [0.003, 0]], 5)).toEqual([[0, 0], [0.003, 0]])
  })

  test('明顯的轉彎點保留', () => {
    const corner: [number, number][] = [[0, 0], [0.01, 0], [0.01, 0.01]]
    expect(simplify(corner, 5)).toEqual(corner)
  })

  test('偏離不到容許值的點被移除', () => {
    // 0.00002 度約 2 m
    expect(simplify([[0, 0], [0.005, 0.00002], [0.01, 0]], 5)).toEqual([[0, 0], [0.01, 0]])
  })
})

describe('產生網格的指令', () => {
  test('沒有任何鐵路的地區也輸出空的 index（例如南極洲）', async () => {
    const { execFileSync } = await import('node:child_process')
    const { mkdtemp, readFile, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'build-tiles-'))
    await writeFile(join(dir, 'empty.rail.opl'), '')
    execFileSync('node', ['scripts/rail/build-tiles.ts', '--out', join(dir, 'out'), join(dir, 'empty.rail.opl')])
    const index = JSON.parse(await readFile(join(dir, 'out/v1/index.json'), 'utf8'))
    expect(index.tiles).toEqual([])
  })
})
