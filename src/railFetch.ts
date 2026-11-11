import type { FetchRailJson } from './core/rail/loader'

/** 鐵路與渡輪資料都與網站同源，不向第三方送出位置 */
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
