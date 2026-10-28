import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// core 必須維持純 TypeScript，後續的補路、動畫都要重用這層
const FORBIDDEN = /from\s+['"](react|react-dom|maplibre-gl)(\/[^'"]*)?['"]/

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

test('src/core 不引用 React 或 MapLibre', () => {
  const violations = listSourceFiles(join(import.meta.dirname))
    .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
  expect(violations).toEqual([])
})
