import type { FetchRailJson } from './core/rail/loader'

/** 鐵路資料與網站同源，不向第三方送出位置 */
const RAIL_BASE = `${import.meta.env.BASE_URL}rail/`

export const fetchRailJson: FetchRailJson = async (path) => {
  const response = await fetch(RAIL_BASE + path)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`鐵路資料下載失敗：${response.status}`)
  return response.json()
}
