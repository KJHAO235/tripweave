import { appendFile, readFile, writeFile } from 'node:fs/promises'
import type { RegionGroups } from './make-regions.ts'

const USAGE = `用法：node scripts/rail/balance-groups.ts <地區清單> <輸出檔> [每組上限 GB，預設 5] [--sizes <暫存檔>]

查詢每個地區在 Geofabrik 的檔案大小，把總量超過上限的洲拆成數組（例如 europe-1、europe-2），
讓每台機器的下載量相近，避免下載變慢時超過 workflow 的時間上限。
指定 --sizes 時，已查過的大小從暫存檔讀取、新查到的逐筆寫入（每行「地區<Tab>位元組」），
Geofabrik 不穩定而中斷時可以接續。`

const USER_AGENT = 'TripWeave/0.1 (https://github.com/KJHAO235/tripweave)'
const RETRIES = 5

/**
 * 把一洲的地區分成 n 組，各組總大小盡量接近（大的先放進目前最小的組）；
 * 組內維持原本的地區順序，方便閱讀
 */
export function splitBySize(regions: string[], sizes: ReadonlyMap<string, number>, parts: number): string[][] {
  const bins = Array.from({ length: parts }, () => ({ total: 0, regions: new Set<string>() }))
  for (const region of [...regions].sort((a, b) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0))) {
    const smallest = bins.reduce((min, bin) => (bin.total < min.total ? bin : min))
    smallest.total += sizes.get(region) ?? 0
    smallest.regions.add(region)
  }
  return bins.map((bin) => regions.filter((region) => bin.regions.has(region)))
}

/** 總量超過上限的洲拆成 ceil(總量 / 上限) 組；其他洲維持原樣 */
export function balanceGroups(groups: RegionGroups, sizes: ReadonlyMap<string, number>, limitBytes: number): RegionGroups {
  const result: RegionGroups = { groups: {} }
  for (const [name, regions] of Object.entries(groups.groups)) {
    const total = regions.reduce((sum, region) => sum + (sizes.get(region) ?? 0), 0)
    const parts = Math.max(1, Math.ceil(total / limitBytes))
    if (parts === 1) {
      result.groups[name] = regions
      continue
    }
    splitBySize(regions, sizes, parts).forEach((part, i) => {
      result.groups[`${name}-${i + 1}`] = part
    })
  }
  return result
}

/** 連線失敗時（Geofabrik 偶爾限流）稍等後重試 */
async function fetchSize(region: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchSizeOnce(region)
    } catch (error) {
      if (attempt >= RETRIES) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 5000))
    }
  }
}

async function fetchSizeOnce(region: string): Promise<number> {
  const response = await fetch(`https://download.geofabrik.de/${region}-latest.osm.pbf`, {
    method: 'HEAD',
    headers: { 'User-Agent': USER_AGENT },
  })
  const length = Number(response.headers.get('content-length'))
  if (!response.ok || !Number.isFinite(length)) throw new Error(`無法取得 ${region} 的大小：${response.status}`)
  return length
}

async function readSizes(file: string | undefined): Promise<Map<string, number>> {
  const sizes = new Map<string, number>()
  if (!file) return sizes
  try {
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      const [region, bytes] = line.split('\t')
      if (region && Number(bytes) > 0) sizes.set(region, Number(bytes))
    }
  } catch {
    // 暫存檔還不存在
  }
  return sizes
}

async function main(argv: string[]) {
  const sizesIndex = argv.indexOf('--sizes')
  const sizesFile = sizesIndex >= 0 ? argv[sizesIndex + 1] : undefined
  const args = sizesIndex >= 0 ? argv.filter((_, i) => i !== sizesIndex && i !== sizesIndex + 1) : argv
  if (args.length < 2 || args.includes('--help')) {
    console.log(USAGE)
    return
  }
  const [input, output, limitGb = '5'] = args
  const groups = JSON.parse(await readFile(input, 'utf8')) as RegionGroups
  const regions = Object.values(groups.groups).flat()
  const sizes = await readSizes(sizesFile)
  const missing = regions.filter((region) => !sizes.has(region))
  console.log(`共 ${regions.length} 個地區，需要查詢 ${missing.length} 個`)
  // 一次只送一個請求，避免被 Geofabrik 限流
  for (const region of missing) {
    const size = await fetchSize(region)
    sizes.set(region, size)
    if (sizesFile) await appendFile(sizesFile, `${region}\t${size}\n`)
  }
  const balanced = balanceGroups(groups, sizes, Number(limitGb) * 1e9)
  for (const [name, list] of Object.entries(balanced.groups)) {
    const total = list.reduce((sum, region) => sum + sizes.get(region)!, 0)
    console.log(`${name}：${list.length} 個地區、${(total / 1e9).toFixed(1)} GB`)
  }
  await writeFile(output, JSON.stringify(balanced, null, 2) + '\n')
}

if (import.meta.main) await main(process.argv.slice(2))
