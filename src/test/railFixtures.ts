import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RailGraph } from '../core/rail/graph'
import { RailTileLoader } from '../core/rail/loader'
import type { TileKey } from '../core/rail/tile'

const FIXTURE_DIR = join(import.meta.dirname, '../../test-data/rail')

/** 從 test-data/rail 讀取網格，行為與瀏覽器端的下載相同（檔案不存在回傳 null） */
export function fixtureLoader() {
  return new RailTileLoader(async (path) => {
    try {
      return JSON.parse(await readFile(join(FIXTURE_DIR, path), 'utf8'))
    } catch {
      return null
    }
  })
}

export async function fixtureGraph(keys: TileKey[]): Promise<RailGraph> {
  const graph = new RailGraph()
  graph.addEdges(await fixtureLoader().loadTiles(keys))
  return graph
}
