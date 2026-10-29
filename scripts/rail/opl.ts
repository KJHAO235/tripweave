export interface OplNode {
  id: number
  lon: number
  lat: number
}

export interface OplWay {
  id: number
  tags: Record<string, string>
  /** 缺少座標的節點會被略過 */
  nodes: OplNode[]
}

/** OPL 以 %<十六進位碼位>% 表示特殊字元 */
export function unescapeOpl(text: string): string {
  return text.replace(/%([0-9a-f]+)%/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
}

/** 解析一行 OPL；不是 way 的行回傳 null */
export function parseOplWay(line: string): OplWay | null {
  if (!line.startsWith('w')) return null
  const fields = line.trim().split(' ')
  const id = Number(fields[0].slice(1))
  const tags: Record<string, string> = {}
  const nodes: OplNode[] = []
  for (const field of fields.slice(1)) {
    if (field.startsWith('T') && field.length > 1) {
      for (const pair of field.slice(1).split(',')) {
        const eq = pair.indexOf('=')
        if (eq > 0) tags[unescapeOpl(pair.slice(0, eq))] = unescapeOpl(pair.slice(eq + 1))
      }
    } else if (field.startsWith('N') && field.length > 1) {
      for (const ref of field.slice(1).split(',')) {
        const match = /^n(\d+)x(-?[\d.]+)y(-?[\d.]+)$/.exec(ref)
        if (match) nodes.push({ id: Number(match[1]), lon: Number(match[2]), lat: Number(match[3]) })
      }
    }
  }
  return { id, tags, nodes }
}
