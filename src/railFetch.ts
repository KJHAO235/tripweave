import { parseAirports, type Airport } from './core/airports'
import type { FetchRailJson } from './core/rail/loader'

/** 鐵路、渡輪與機場資料都與網站同源，不向第三方送出位置 */
function fetchFrom(dataset: 'rail' | 'ferry', label: string): FetchRailJson {
  const base = `${import.meta.env.BASE_URL}${dataset}/`
  return async (path) => {
    const response = await fetch(base + path)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`${label}資料下載失敗：${response.status}`)
    return response.json()
  }
}

export const fetchRailJson = fetchFrom('rail', '鐵路')
export const fetchFerryJson = fetchFrom('ferry', '渡輪')

let airportsRequest: Promise<Airport[]> | undefined

/** 機場資料只下載一次；失敗時清除，下次需要時再試 */
export function loadAirports(): Promise<Airport[]> {
  airportsRequest ??= fetch(`${import.meta.env.BASE_URL}airports.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`機場資料下載失敗：${response.status}`)
      return response.json()
    })
    .then(parseAirports)
    .catch((error: unknown) => {
      airportsRequest = undefined
      throw error
    })
  return airportsRequest
}
