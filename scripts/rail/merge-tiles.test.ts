import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { decodeTile, encodeTile, type RailEdge } from '../../src/core/rail/tile.ts'
import { mergeTiles } from './merge-tiles.ts'

const edge = (id: number, name: string): RailEdge => ({ id, a: id, b: id + 1, service: 0, tunnel: false, name, coords: [[141.6, 42.8], [141.61, 42.81]] })

async function writeRegion(dir: string, tiles: Record<string, RailEdge[]>) {
  for (const [id, edges] of Object.entries(tiles)) {
    await mkdir(join(dir, 'v1', id.split('/')[0]), { recursive: true })
    await writeFile(join(dir, 'v1', `${id}.json`), JSON.stringify(encodeTile(edges)))
  }
  await writeFile(join(dir, 'v1', 'index.json'), JSON.stringify({ v: 1, generated: 'x', tileSizeDeg: 0.25, tiles: Object.keys(tiles) }))
}

test('相鄰地區的同一格子合併，重複的邊只留一條', async () => {
  const root = await mkdtemp(join(tmpdir(), 'merge-tiles-'))
  await writeRegion(join(root, 'a'), { '171/566': [edge(1, 'A'), edge(2, '共用')], '170/566': [edge(5, 'A')] })
  await writeRegion(join(root, 'b'), { '171/566': [edge(2, '共用'), edge(3, 'B')], '172/566': [edge(7, 'B')] })

  const result = await mergeTiles([join(root, 'a'), join(root, 'b')], join(root, 'out'))
  expect(result).toEqual({ tiles: 3, merged: 1 })

  const merged = decodeTile(JSON.parse(await readFile(join(root, 'out/v1/171/566.json'), 'utf8')))
  expect(merged.map((e) => e.id).sort()).toEqual([1, 2, 3])
  const index = JSON.parse(await readFile(join(root, 'out/v1/index.json'), 'utf8'))
  expect(index.tiles).toEqual(['170/566', '171/566', '172/566'])
})
