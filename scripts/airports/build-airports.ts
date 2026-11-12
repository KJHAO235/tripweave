import { readFile, writeFile } from 'node:fs/promises'

const USAGE = `用法：node scripts/airports/build-airports.ts <airports.csv> <輸出檔>

把 OurAirports 的 airports.csv（公有領域）轉成 App 使用的機場資料，
只保留有定期航班且有 IATA 代碼的機場。
下載：https://davidmegginson.github.io/ourairports-data/airports.csv`

/** [IATA, 名稱, 城市, 緯度, 經度] */
export type AirportRow = [string, string, string, number, number]

const AIRPORT_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport'])

/** 解析 CSV：支援雙引號包住的欄位（內含逗號、換行與 "" 跳脫） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** 「Manila (Pasay)」→「Manila」；沒有城市時用機場名稱 */
export function cityName(municipality: string, name: string): string {
  const city = municipality.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  return city || name
}

/** 挑出有定期航班、有 IATA 代碼的機場 */
export function selectAirports(csv: string): AirportRow[] {
  const [header, ...rows] = parseCsv(csv)
  const col = (name: string) => {
    const index = header.indexOf(name)
    if (index < 0) throw new Error(`airports.csv 缺少欄位 ${name}`)
    return index
  }
  const [type, name, lat, lon, municipality, scheduled, iata] = [
    'type',
    'name',
    'latitude_deg',
    'longitude_deg',
    'municipality',
    'scheduled_service',
    'iata_code',
  ].map(col)
  return rows
    .filter((r) => AIRPORT_TYPES.has(r[type]) && r[scheduled] === 'yes' && /^[A-Z0-9]{3}$/.test(r[iata] ?? ''))
    .map((r): AirportRow => [
      r[iata],
      r[name],
      cityName(r[municipality] ?? '', r[name]),
      Math.round(Number(r[lat]) * 1e4) / 1e4,
      Math.round(Number(r[lon]) * 1e4) / 1e4,
    ])
    .sort((a, b) => a[0].localeCompare(b[0]))
}

async function main(argv: string[]) {
  if (argv.length < 2 || argv.includes('--help')) {
    console.log(USAGE)
    return
  }
  const [input, output] = argv
  const airports = selectAirports(await readFile(input, 'utf8'))
  const json = JSON.stringify(airports)
  await writeFile(output, json + '\n')
  console.log(`機場 ${airports.length} 個、${(json.length / 1024).toFixed(0)} KB`)
}

if (import.meta.main) await main(process.argv.slice(2))
