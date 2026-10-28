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
