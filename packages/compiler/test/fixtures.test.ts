// Um fixture mínimo por regra de 18-transformacoes.md: `fixtures/<caso>/input.tsx` → `output.js` (comparados depois
// do prettier). `options.json` opcional: `{ "dev": false }`. `UPDATE_FIXTURES=1` regrava as saídas (revise o diff!).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { compile } from '../src/index'
import { pretty } from './helpers'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const update = !!process.env.UPDATE_FIXTURES

describe('fixtures', () => {
  for (const name of readdirSync(dir).sort()) {
    test(name, async () => {
      const base = `${dir}/${name}`
      const inputFile = existsSync(`${base}/input.tsx`) ? 'input.tsx' : 'input.ts'
      const input = readFileSync(`${base}/${inputFile}`, 'utf8')
      const opts = existsSync(`${base}/options.json`) ? JSON.parse(readFileSync(`${base}/options.json`, 'utf8')) : {}
      const actual = await pretty(compile(input, { filename: inputFile, dev: opts.dev ?? true }).code)
      const outFile = `${base}/output.js`
      if (update || !existsSync(outFile)) writeFileSync(outFile, actual)
      expect(actual).toBe(await pretty(readFileSync(outFile, 'utf8')))
    })
  }
})
