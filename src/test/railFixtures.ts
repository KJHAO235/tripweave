import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RailGraph } from '../core/rail/graph'
import { RailTileLoader } from '../core/rail/loader'
import type { TileKey } from '../core/rail/tile'

const FIXTURE_ROOT = join(import.meta.dirname, '../../test-data')

/** 從 test-data/rail（或 ferry）讀取網格，行為與瀏覽器端的下載相同（檔案不存在回傳 null） */
export function fixtureLoader(dataset: 'rail' | 'ferry' = 'rail') {
  return new RailTileLoader(async (path) => {
    try {
      return JSON.parse(await readFile(join(FIXTURE_ROOT, dataset, path), 'utf8'))
    } catch {
      return null
    }
  })
}

export async function fixtureGraph(keys: TileKey[], dataset: 'rail' | 'ferry' = 'rail'): Promise<RailGraph> {
  const graph = new RailGraph()
  graph.addEdges(await fixtureLoader(dataset).loadTiles(keys))
  return graph
}
