const METERS_PER_DEG = 111_320

/** Douglas–Peucker，容許誤差以公尺計；兩端一定保留 */
export function simplify(coords: [number, number][], toleranceM: number): [number, number][] {
  if (coords.length <= 2) return coords
  const cosLat = Math.cos((coords[0][1] * Math.PI) / 180)
  const toXY = ([lon, lat]: [number, number]) => [lon * METERS_PER_DEG * cosLat, lat * METERS_PER_DEG]
  const xy = coords.map(toXY)
  const keep = new Uint8Array(coords.length)
  keep[0] = 1
  keep[coords.length - 1] = 1

  const stack: [number, number][] = [[0, coords.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(xy[i], xy[first], xy[last])
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index >= 0 && maxDist > toleranceM) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return coords.filter((_, i) => keep[i] === 1)
}

function distanceToSegment(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}
