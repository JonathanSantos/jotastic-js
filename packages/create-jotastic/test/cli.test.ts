import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const CLI = fileURLToPath(new URL('../index.js', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'create-jotastic-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const run = (args: string[], input = '') =>
  spawnSync(process.execPath, [CLI, ...args], { cwd: tmp, input, encoding: 'utf8' })

const FILES = [
  '.gitignore',
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'eslint.config.js',
  'index.html',
  'src/main.tsx',
  'src/Counter.tsx',
  'src/Counter.test.tsx',
]

describe('create-jotastic', () => {
  it('copia o template, renomeia _gitignore e ajusta o name', () => {
    const r = run(['My App'])
    expect(r.status).toBe(0)
    const dir = join(tmp, 'My App')
    for (const f of FILES) expect(existsSync(join(dir, f)), f).toBe(true)
    expect(existsSync(join(dir, '_gitignore'))).toBe(false)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('my-app')
    expect(Object.keys(pkg.scripts)).toEqual(expect.arrayContaining(['dev', 'build', 'preview', 'test', 'lint']))
    expect(r.stdout).toContain('cd "My App"')
    expect(r.stdout).toContain('npm install')
    expect(r.stdout).toContain('npm run dev')
  })

  it('pergunta o diretório quando não informado', () => {
    const r = run([], 'perguntado\n')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('Diretório do projeto:')
    expect(JSON.parse(readFileSync(join(tmp, 'perguntado/package.json'), 'utf8')).name).toBe('perguntado')
  })

  it('usa jotastic-app como padrão (resposta vazia)', () => {
    const r = run([], '\n')
    expect(r.status).toBe(0)
    expect(JSON.parse(readFileSync(join(tmp, 'jotastic-app/package.json'), 'utf8')).name).toBe('jotastic-app')
  })

  it('aceita diretório existente vazio', () => {
    mkdirSync(join(tmp, 'vazio'))
    expect(run(['vazio']).status).toBe(0)
    expect(existsSync(join(tmp, 'vazio/src/Counter.tsx'))).toBe(true)
  })

  it('recusa diretório não vazio sem tocar nele', () => {
    const dir = join(tmp, 'ocupado')
    mkdirSync(dir)
    writeFileSync(join(dir, 'arquivo.txt'), 'x')
    const r = run(['ocupado'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('não está vazio')
    expect(existsSync(join(dir, 'package.json'))).toBe(false)
  })
})
