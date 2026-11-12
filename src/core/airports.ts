import { distanceKm, type LatLon } from './geo'

export interface Airport {
  iata: string
  name: string
  city: string
  lat: number
  lon: number
}

/** 缺口端點離機場多近才視為在機場起降 */
export const AIRPORT_MATCH_KM = 10

/** airports.json 的每一列：[IATA, 名稱, 城市, 緯度, 經度] */
export function parseAirports(data: unknown): Airport[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 5) return []
    const [iata, name, city, lat, lon] = row
    return typeof iata === 'string' && Number.isFinite(lat) && Number.isFinite(lon) ? [{ iata, name, city, lat, lon }] : []
  })
}

/** 離某點 maxKm 內最近的機場；沒有時回傳 null（約 4,000 個機場，直接逐一比較） */
export function nearestAirport(airports: readonly Airport[], point: LatLon, maxKm = AIRPORT_MATCH_KM): Airport | null {
  let best: Airport | null = null
  let bestKm = maxKm
  for (const airport of airports) {
    // 先用緯度差粗篩，避免對每個機場都算大圓距離
    if (Math.abs(airport.lat - point.lat) > maxKm / 100) continue
    const km = distanceKm(point, airport)
    if (km <= bestKm) {
      best = airport
      bestKm = km
    }
  }
  return best
}

/** 「Coron (USU)」 */
export function formatAirport(airport: Airport): string {
  return `${airport.city} (${airport.iata})`
}

/** 航段：兩端都有「A → B」、只有一端「A →」或「→ B」；都沒有時為 undefined */
export function formatLeg(from: Airport | undefined, to: Airport | undefined): string | undefined {
  if (!from && !to) return undefined
  return [from ? formatAirport(from) : '', to ? formatAirport(to) : ''].join(' → ').trim()
}
