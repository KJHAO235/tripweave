import { describe, expect, test } from 'vitest'
import { loadTestTrack, parseXmlForTest } from '../../test/parseXml'
import { parseTrackFile } from './trackFile'

const KML_NS = 'xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"'
const GPX_NS = 'xmlns="http://www.topografix.com/GPX/1/1"'

function parse(fileName: string, text: string) {
  return parseTrackFile(fileName, text, parseXmlForTest)
}

function parseOk(fileName: string, text: string) {
  const result = parse(fileName, text)
  if (!result.ok) throw new Error(`預期成功，實際失敗：${result.message}`)
  return result.track
}

describe('KML', () => {
  test('Google 我的地圖匯出的 Day1+2.kml：2 段、捨棄地標點、沒有時間', () => {
    const track = loadTestTrack('Day1+2.kml')
    expect(track.segments.map((s) => s.points.length)).toEqual([17033, 29845])
    expect(track.hasTime).toBe(false)
    expect(track.name).toBe('Day1+2')
    // 第一段起點在上野附近；地標「上野」本身（139.77436, 35.711001）不應被當成軌跡點
    const first = track.segments[0].points[0]
    expect(first.lat).toBeCloseTo(35.71, 1)
    expect(first.lon).toBeCloseTo(139.77, 1)
  })

  test('gx:Track 的每個點帶有對應的時間與海拔', () => {
    const track = parseOk(
      'track.kml',
      `<kml ${KML_NS}><Placemark><gx:Track>
        <when>2024-08-14T03:00:00Z</when><when>2024-08-14T03:00:05Z</when>
        <gx:coord>141.36 43.06 20</gx:coord><gx:coord>141.37 43.07 21</gx:coord>
      </gx:Track></Placemark></kml>`,
    )
    expect(track.hasTime).toBe(true)
    expect(track.segments[0].points).toEqual([
      { lat: 43.06, lon: 141.36, ele: 20, time: Date.parse('2024-08-14T03:00:00Z') },
      { lat: 43.07, lon: 141.37, ele: 21, time: Date.parse('2024-08-14T03:00:05Z') },
    ])
  })

  test('gx:MultiTrack 的每一段各自對應自己的時間', () => {
    const track = parseOk(
      'multi.kml',
      `<kml ${KML_NS}><Placemark><gx:MultiTrack>
        <gx:Track><when>2024-01-01T10:00:00Z</when><when>2024-01-01T10:00:05Z</when><gx:coord>2 1</gx:coord><gx:coord>2 1.1</gx:coord></gx:Track>
        <gx:Track><when>2024-01-01T11:00:00Z</when><when>2024-01-01T11:00:05Z</when><gx:coord>4 3</gx:coord><gx:coord>4 3.1</gx:coord></gx:Track>
      </gx:MultiTrack></Placemark></kml>`,
    )
    expect(track.segments.map((s) => s.points[0].time)).toEqual([
      Date.parse('2024-01-01T10:00:00Z'),
      Date.parse('2024-01-01T11:00:00Z'),
    ])
  })

  test('沒有副檔名時依內容辨識為 KML', () => {
    const track = parseOk('export', `<?xml version="1.0"?><kml ${KML_NS}><Placemark><LineString><coordinates>2,1 2,1.1</coordinates></LineString></Placemark></kml>`)
    expect(track.segments).toHaveLength(1)
  })
})

describe('GPX', () => {
  test('含時間與海拔的 GPX：每點都有時間與海拔', () => {
    const track = parseOk(
      'ride.gpx',
      `<gpx ${GPX_NS}><trk><trkseg>
        <trkpt lat="43.06" lon="141.35"><ele>18</ele><time>2024-08-14T10:00:00Z</time></trkpt>
        <trkpt lat="43.07" lon="141.36"><ele>19</ele><time>2024-08-14T10:00:10Z</time></trkpt>
      </trkseg></trk></gpx>`,
    )
    expect(track.hasTime).toBe(true)
    expect(track.segments[0].points).toEqual([
      { lat: 43.06, lon: 141.35, ele: 18, time: Date.parse('2024-08-14T10:00:00Z') },
      { lat: 43.07, lon: 141.36, ele: 19, time: Date.parse('2024-08-14T10:00:10Z') },
    ])
  })

  test('2 個 trkseg 解析成 2 段', () => {
    const track = parseOk(
      'two.gpx',
      `<gpx ${GPX_NS}><trk>
        <trkseg><trkpt lat="1" lon="2"/><trkpt lat="1.1" lon="2"/></trkseg>
        <trkseg><trkpt lat="3" lon="4"/><trkpt lat="3.1" lon="4"/></trkseg>
      </trk></gpx>`,
    )
    expect(track.segments.map((s) => s.points.length)).toEqual([2, 2])
  })

  test('只有部分段落有時間時，整份軌跡視為沒有時間', () => {
    const track = parseOk(
      'mixed.gpx',
      `<gpx ${GPX_NS}><trk>
        <trkseg><trkpt lat="1" lon="2"><time>2024-01-01T10:00:00Z</time></trkpt><trkpt lat="1.1" lon="2"><time>2024-01-01T10:00:05Z</time></trkpt></trkseg>
        <trkseg><trkpt lat="3" lon="4"/><trkpt lat="3.1" lon="4"/></trkseg>
      </trk></gpx>`,
    )
    expect(track.hasTime).toBe(false)
  })

  test('沒有 trk 時改讀 rte，wpt 不算軌跡', () => {
    const track = parseOk(
      'route.gpx',
      `<gpx ${GPX_NS}><wpt lat="9" lon="9"/><rte><rtept lat="1" lon="2"/><rtept lat="1.2" lon="2"/></rte></gpx>`,
    )
    expect(track.segments).toHaveLength(1)
    expect(track.segments[0].points).toHaveLength(2)
  })

  test('同時有 trk 與 rte 時只讀 trk', () => {
    const track = parseOk(
      'both.gpx',
      `<gpx ${GPX_NS}><rte><rtept lat="5" lon="5"/><rtept lat="5.1" lon="5"/></rte><trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="1.1" lon="2"/></trkseg></trk></gpx>`,
    )
    expect(track.segments).toEqual([{ points: [{ lat: 1, lon: 2 }, { lat: 1.1, lon: 2 }] }])
  })
})

describe('錯誤處理', () => {
  test('PDF 檔回報不支援的格式，並列出支援的格式', () => {
    const result = parse('ticket.pdf', '%PDF-1.4 binary...')
    expect(result).toMatchObject({ ok: false, code: 'unsupported-format' })
    if (!result.ok) {
      expect(result.message).toContain('不支援的檔案格式')
      expect(result.message).toContain('KML')
      expect(result.message).toContain('GPX')
    }
  })

  test('只有地標點的 KML 回報找不到軌跡', () => {
    const result = parse('points.kml', `<kml ${KML_NS}><Placemark><name>上野</name><Point><coordinates>139.77,35.71</coordinates></Point></Placemark></kml>`)
    expect(result).toMatchObject({ ok: false, code: 'no-track', message: '檔案中找不到軌跡' })
  })

  test('內容被截斷的 KML 回報檔案損毀', () => {
    const result = parse('broken.kml', `<kml ${KML_NS}><Placemark><LineString><coordinates>2,1`)
    expect(result).toMatchObject({ ok: false, code: 'corrupt' })
  })

  test('副檔名是 .gpx 但內容不是 XML 時回報檔案損毀', () => {
    const result = parse('fake.gpx', 'hello')
    expect(result).toMatchObject({ ok: false, code: 'corrupt' })
  })
})
