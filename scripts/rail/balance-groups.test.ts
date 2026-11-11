import { expect, test } from 'vitest'
import { balanceGroups, splitBySize } from './balance-groups.ts'

const GB = 1e9

test('各組總大小接近，組內維持原本順序', () => {
  const sizes = new Map([
    ['a', 5 * GB],
    ['b', 1 * GB],
    ['c', 4 * GB],
    ['d', 2 * GB],
    ['e', 3 * GB],
  ])
  const parts = splitBySize(['a', 'b', 'c', 'd', 'e'], sizes, 2)
  const totals = parts.map((part) => part.reduce((sum, r) => sum + sizes.get(r)!, 0))
  expect(Math.abs(totals[0] - totals[1])).toBeLessThanOrEqual(1 * GB)
  for (const part of parts) expect(part).toEqual([...part].sort())
  expect(parts.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
})

test('只拆超過上限的洲，命名為 <洲>-<序號>', () => {
  const sizes = new Map([
    ['europe/germany', 4 * GB],
    ['europe/france', 4 * GB],
    ['europe/italy', 2 * GB],
    ['asia/japan', 2 * GB],
  ])
  const result = balanceGroups(
    { groups: { europe: ['europe/germany', 'europe/france', 'europe/italy'], asia: ['asia/japan'] } },
    sizes,
    6 * GB,
  )
  expect(Object.keys(result.groups)).toEqual(['europe-1', 'europe-2', 'asia'])
  expect(result.groups.asia).toEqual(['asia/japan'])
  expect(Object.values(result.groups).flat().sort()).toEqual(['asia/japan', 'europe/france', 'europe/germany', 'europe/italy'])
})
