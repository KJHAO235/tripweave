export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分鐘`
  return minutes === 0 ? `${hours} 小時` : `${hours} 小時 ${minutes} 分`
}

export function formatSpeed(kmh: number): string {
  return `約 ${Math.round(kmh)} km/h`
}

export function formatLatLon(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`
}

interface DateParts {
  year: number
  month: number
  day: number
}

function dateParts(epochMs: number, timeZone?: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(
    new Date(epochMs),
  )
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** 例如「2024/8/14–8/15」、跨年時「2024/12/31–2025/1/2」；timeZone 省略時用裝置時區 */
export function formatDateRange(startMs: number, endMs: number, timeZone?: string): string {
  const a = dateParts(startMs, timeZone)
  const b = dateParts(endMs, timeZone)
  const start = `${a.year}/${a.month}/${a.day}`
  if (a.year === b.year && a.month === b.month && a.day === b.day) return start
  return a.year === b.year ? `${start}–${b.month}/${b.day}` : `${start}–${b.year}/${b.month}/${b.day}`
}
