import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { loadTestTrack } from '../test/parseXml'
import { formatAirport, formatLeg, nearestAirport, parseAirports, type Airport } from './airports'
import { decideFill } from './fill'
import { flightBySpeed, throughAirports, type FlightFill } from './flight'
import { detectGaps, type Gap } from './gaps'
import { distanceKm } from './geo'
import { RailGraph } from './rail/graph'
import type { Track } from './track'

const airports = parseAirports(JSON.parse(readFileSync('public/airports.json', 'utf8')))
const byCode = (iata: string) => airports.find((a) => a.iata === iata)!
const coron = loadTestTrack('relive-coron-2025-01-23.gpx')
const coronGaps = detectGaps(coron, 1)
const landing = coronGaps.find((g) => g.distanceKm > 30)!
const noGraph = async () => new RailGraph()

/** 從 point 往北移 km 公里 */
const north = (point: { lat: number; lon: number }, km: number) => ({ lat: point.lat + km / 111.195, lon: point.lon })

function twoPointGap(from: { lat: number; lon: number }, to: { lat: number; lon: number }): { track: Track; gap: Gap } {
  const track: Track = { segments: [{ points: [from, to] }], hasTime: false }
  return { track, gap: detectGaps(track, 1)[0] }
}

describe('nearestAirport', () => {
  test('Coron 降落前缺口的終點對到 Busuanga（USU）', () => {
    expect(nearestAirport(airports, landing.to)?.iata).toBe('USU')
  })

  test('航程中途的缺口兩端都對不到機場', () => {
    for (const gap of coronGaps.filter((g) => g !== landing)) {
      expect(nearestAirport(airports, gap.from)).toBeNull()
      expect(nearestAirport(airports, gap.to)).toBeNull()
    }
  })

  test('10 km 邊界：9.9 km 對得到、10.1 km 對不到', () => {
    const eni = byCode('ENI')
    // El Nido 機場北方 10 km 內沒有其他有定期航班的機場
    expect(nearestAirport(airports, north(eni, 9.9))?.iata).toBe('ENI')
    expect(nearestAirport(airports, north(eni, 10.1))).toBeNull()
  })

  test('格式：「城市 (IATA)」與航段', () => {
    expect(formatAirport(byCode('USU'))).toBe('Coron (USU)')
    expect(formatLeg(byCode('USU'), byCode('ENI'))).toBe('Coron (USU) → El Nido (ENI)')
    expect(formatLeg(undefined, byCode('USU'))).toBe('→ Coron (USU)')
    expect(formatLeg(byCode('MNL'), undefined)).toBe('Manila (MNL) →')
    expect(formatLeg(undefined, undefined)).toBeUndefined()
  })
})

describe('throughAirports', () => {
  const pathKm = (path: [number, number][]) =>
    path.slice(1).reduce((sum, p, i) => sum + distanceKm({ lon: path[i][0], lat: path[i][1] }, { lon: p[0], lat: p[1] }), 0)

  test('航線經過對到的機場，長度為整條路徑長度', () => {
    const usu = byCode('USU')
    const eni = byCode('ENI')
    const { gap } = twoPointGap(north(usu, 2), north(eni, 3))
    const base: FlightFill = { gapId: gap.id, mode: 'flight', path: [], lengthKm: 0, remainders: [], basis: { kind: 'distance', distanceKm: gap.distanceKm } }
    const fill = throughAirports(base, gap, airports)
    expect(fill.airports).toEqual({ from: usu, to: eni })
    expect(fill.path[0]).toEqual([gap.from.lon, gap.from.lat])
    expect(fill.path[1]).toEqual([usu.lon, usu.lat])
    expect(fill.path.at(-2)).toEqual([eni.lon, eni.lat])
    expect(fill.path.at(-1)).toEqual([gap.to.lon, gap.to.lat])
    expect(fill.lengthKm).toBeCloseTo(pathKm(fill.path), 6)
  })

  test('跨換日線時經度連續', () => {
    const hnd = byCode('HND')
    const hnl = byCode('HNL')
    const { gap } = twoPointGap(north(hnd, 3), north(hnl, 3))
    const base: FlightFill = { gapId: gap.id, mode: 'flight', path: [], lengthKm: 0, remainders: [], basis: { kind: 'distance', distanceKm: gap.distanceKm } }
    const fill = throughAirports(base, gap, airports)
    for (let i = 1; i < fill.path.length; i++) expect(Math.abs(fill.path[i][0] - fill.path[i - 1][0])).toBeLessThan(10)
    expect(fill.airports).toEqual({ from: hnd, to: hnl })
  })

  test('兩端都對不到時維持原本的航線', () => {
    const gap = coronGaps.find((g) => g.distanceKm > 20 && g.distanceKm < 22)!
    const fill = flightBySpeed(gap)!
    expect(throughAirports(fill, gap, airports)).toBe(fill)
  })
})

describe('decideFill 與機場', () => {
  const list = async () => airports

  test('沒有時間、USU 2 km 外到 ENI 3 km 外的缺口判斷為飛機，航段 USU → ENI', async () => {
    const { track, gap } = twoPointGap(north(byCode('USU'), 2), north(byCode('ENI'), 3))
    expect(gap.distanceKm).toBeGreaterThan(100)
    const fill = (await decideFill(track, gap, noGraph, noGraph, list)) as FlightFill
    expect(fill.mode).toBe('flight')
    expect(fill.basis.kind).toBe('airports')
    expect(formatLeg(fill.airports?.from, fill.airports?.to)).toBe('Coron (USU) → El Nido (ENI)')
  })

  test('只有一端在機場的 150 km 缺口不判斷為飛機', async () => {
    const usu = byCode('USU')
    const { track, gap } = twoPointGap(north(usu, 2), north(usu, 152))
    expect(nearestAirport(airports, gap.to)).toBeNull()
    expect(await decideFill(track, gap, noGraph, noGraph, list)).toBeNull()
  })

  test('Coron 降落前的缺口經過 USU；機場資料取得失敗時 11 個缺口仍都是飛機', async () => {
    const landingFill = (await decideFill(coron, landing, noGraph, noGraph, list)) as FlightFill
    expect(landingFill.airports).toEqual({ from: undefined, to: byCode('USU') })
    const failing = async (): Promise<Airport[]> => {
      throw new Error('offline')
    }
    for (const gap of coronGaps) expect((await decideFill(coron, gap, noGraph, noGraph, failing))?.mode).toBe('flight')
  })
})
