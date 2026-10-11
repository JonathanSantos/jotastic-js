// Integração: valida o template de verdade dentro do monorepo. A cópia fica DENTRO do repo para que
// `jotastic`/`@jotastic/*`, `vite`, `vitest` e `eslint` resolvam pelos symlinks de workspace do node_modules da raiz.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffold } from '../index.js'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const BIN = join(ROOT, 'node_modules/.bin')
const APP = fileURLToPath(new URL('./.tmp-app', import.meta.url))

const sh = (bin: string, args: string[]) =>
  execFileSync(join(BIN, bin), args, { cwd: APP, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CI: '1' } })

describe.skipIf(process.env.CREATE_JOTASTIC_E2E === '0')('template (e2e no monorepo)', () => {
  beforeAll(() => {
    rmSync(APP, { recursive: true, force: true })
    // Pacotes consumidos pelo template saem de `dist/`.
    execFileSync(
      'npm',
      [
        'run',
        'build',
        '-w',
        'jotastic',
        '-w',
        '@jotastic/analyzer',
        '-w',
        '@jotastic/compiler',
        '-w',
        '@jotastic/vite',
        '-w',
        '@jotastic/test',
        '-w',
        '@jotastic/devtools',
        '-w',
        '@jotastic/eslint-plugin',
      ],
      { cwd: ROOT, stdio: 'pipe' },
    )
    scaffold(APP)
  })
  afterAll(() => rmSync(APP, { recursive: true, force: true }))

  it('vite build gera dist/', () => {
    sh('vite', ['build', '--logLevel', 'warn'])
    expect(existsSync(join(APP, 'dist/index.html'))).toBe(true)
    expect(readdirSync(join(APP, 'dist/assets')).some((f) => f.endsWith('.js'))).toBe(true)
  })

  it('o teste do Counter passa (vitest + happy-dom + @jotastic/test)', () => {
    const out = sh('vitest', ['run', '--root', APP])
    expect(out).toMatch(/2 passed/)
  })

  it('eslint passa com jotastic.configs.recommended', () => {
    sh('eslint', ['.'])
  })

  it('tsc não acusa erros', () => {
    sh('tsc', ['-p', '.'])
  })
})
