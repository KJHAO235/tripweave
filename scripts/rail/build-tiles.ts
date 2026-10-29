import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  encodeTile,
  TILE_FORMAT_VERSION,
  TILE_SIZE_DEG,
  tileId,
  tilePath,
  tilesForLine,
  type RailEdge,
  type RailIndex,
  type TileKey,
} from '../../src/core/rail/tile.ts'
import { splitIntoEdges } from './edges.ts'
import { parseOplWay, type OplWay } from './opl.ts'
import { simplify } from './simplify.ts'

const USAGE = `用法：node scripts/rail/build-tiles.ts --out <輸出資料夾> <鐵路 OPL 檔> [更多 OPL 檔...]

把 osmium 輸出的鐵路 OPL（含節點座標）轉成 rail/v1 網格資料。`

const SIMPLIFY_TOLERANCE_M = 5

async function readWays(files: string[]): Promise<OplWay[]> {
  const ways: OplWay[] = []
  const seen = new Set<number>()
  for (const file of files) {
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
    for await (const line of lines) {
      const way = parseOplWay(line)
      // 相鄰地區的檔案在邊界會有重複的 way
      if (way && !seen.has(way.id)) {
        seen.add(way.id)
        ways.push(way)
      }
    }
  }
  return ways
}

async function main(argv: string[]) {
  const outIndex = argv.indexOf('--out')
  if (argv.length === 0 || argv.includes('--help') || outIndex < 0 || !argv[outIndex + 1]) {
    console.log(USAGE)
    return
  }
  const outDir = argv[outIndex + 1]
  const inputs = argv.filter((_, i) => i !== outIndex && i !== outIndex + 1)
  const started = Date.now()

  const ways = await readWays(inputs)
  const edges = splitIntoEdges(ways).map((edge) => ({ ...edge, coords: simplify(edge.coords, SIMPLIFY_TOLERANCE_M) }))

  const byTile = new Map<string, { key: TileKey; edges: RailEdge[] }>()
  for (const edge of edges) {
    for (const key of tilesForLine(edge.coords)) {
      const id = tileId(key)
      const bucket = byTile.get(id) ?? { key, edges: [] }
      bucket.edges.push(edge)
      byTile.set(id, bucket)
    }
  }

  let totalBytes = 0
  for (const { key, edges: tileEdges } of byTile.values()) {
    const path = join(outDir, tilePath(key))
    await mkdir(join(path, '..'), { recursive: true })
    const json = JSON.stringify(encodeTile(tileEdges))
    totalBytes += Buffer.byteLength(json)
    await writeFile(path, json)
  }

  const index: RailIndex = {
    v: TILE_FORMAT_VERSION,
    generated: new Date().toISOString(),
    tileSizeDeg: TILE_SIZE_DEG,
    tiles: [...byTile.keys()].sort(),
  }
  await writeFile(join(outDir, `v${TILE_FORMAT_VERSION}`, 'index.json'), JSON.stringify(index))

  console.log(
    `way ${ways.length}、邊 ${edges.length}、網格 ${byTile.size}、總大小 ${(totalBytes / 1e6).toFixed(1)} MB、耗時 ${((Date.now() - started) / 1000).toFixed(1)} 秒`,
  )
}

await main(process.argv.slice(2))
