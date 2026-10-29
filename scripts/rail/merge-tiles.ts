import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { decodeTile, encodeTile, TILE_FORMAT_VERSION, TILE_SIZE_DEG, type RailEdge, type RailIndex, type RailTile } from '../../src/core/rail/tile.ts'

const USAGE = `用法：node scripts/rail/merge-tiles.ts --out <輸出資料夾> <網格資料夾> [更多網格資料夾...]

把多個地區各自產生的 rail/v1 網格合併成一份；同一格子的鐵路合在一起，依邊的 id 去重。`

const VERSION_DIR = `v${TILE_FORMAT_VERSION}`

export async function mergeTiles(inputs: string[], outDir: string): Promise<{ tiles: number; merged: number }> {
  const sources = new Map<string, string[]>()
  for (const input of inputs) {
    const index = JSON.parse(await readFile(join(input, VERSION_DIR, 'index.json'), 'utf8')) as RailIndex
    for (const id of index.tiles) sources.set(id, [...(sources.get(id) ?? []), input])
  }

  let merged = 0
  for (const [id, dirs] of sources) {
    const target = join(outDir, VERSION_DIR, `${id}.json`)
    await mkdir(join(target, '..'), { recursive: true })
    if (dirs.length === 1) {
      await copyFile(join(dirs[0], VERSION_DIR, `${id}.json`), target)
      continue
    }
    // 地區邊界的緩衝區會讓相鄰地區包含同一段鐵路
    const edges = new Map<number, RailEdge>()
    for (const dir of dirs) {
      const tile = JSON.parse(await readFile(join(dir, VERSION_DIR, `${id}.json`), 'utf8')) as RailTile
      for (const edge of decodeTile(tile)) if (!edges.has(edge.id)) edges.set(edge.id, edge)
    }
    await writeFile(target, JSON.stringify(encodeTile([...edges.values()])))
    merged++
  }

  // 所有輸入都沒有鐵路時（例如南極洲）也要輸出空的 index
  await mkdir(join(outDir, VERSION_DIR), { recursive: true })
  const index: RailIndex = { v: TILE_FORMAT_VERSION, generated: new Date().toISOString(), tileSizeDeg: TILE_SIZE_DEG, tiles: [...sources.keys()].sort() }
  await writeFile(join(outDir, VERSION_DIR, 'index.json'), JSON.stringify(index))
  return { tiles: sources.size, merged }
}

async function main(argv: string[]) {
  const outIndex = argv.indexOf('--out')
  if (argv.includes('--help') || outIndex < 0 || !argv[outIndex + 1]) {
    console.log(USAGE)
    return
  }
  const inputs = argv.filter((_, i) => i !== outIndex && i !== outIndex + 1)
  const { tiles, merged } = await mergeTiles(inputs, argv[outIndex + 1])
  console.log(`合併 ${inputs.length} 份資料：網格 ${tiles} 個，其中 ${merged} 個由多份合併`)
}

if (import.meta.main) await main(process.argv.slice(2))
