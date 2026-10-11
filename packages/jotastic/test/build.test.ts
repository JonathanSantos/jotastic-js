// Build de prod (21-pendencias V-1/V-2): ramos de dev eliminados e runtime sem efeitos colaterais de topo.
//
// Reproduz o caminho real em duas etapas: (1) empacota o fonte como o tsup faz (`__DEV__` = false/true, um arquivo
// só, sem minificar); (2) empacota com o Rollup um app do tamanho do counter contra esse resultado, fora do pacote (sem
// `sideEffects: false` ajudando). O que sobrar de proxy/devtools na etapa 2 é efeito de topo ou dependência estática.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { rollup } from 'rollup'
import { afterAll, describe, expect, test } from 'vitest'

const src = (p: string) => resolve(dirname(fileURLToPath(import.meta.url)), '../src', p)
const dir = mkdtempSync(join(tmpdir(), 'jotastic-build-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const COUNTER = `
import { mount } from './index.js'
import { template, signal, memo, insert, classList, bool, listen, component } from './runtime.js'
const t = template('<p><!><button></button></p>')
function Counter() {
  const count = signal(0)
  const even = memo(() => count.get() % 2 === 0)
  const el = t(), b = el.lastChild
  insert(el, () => count.get(), el.firstChild)
  classList(el, () => ({ even: even.get() }))
  listen(b, 'click', () => count.set(count.get() + 1))
  bool(b, 'disabled', () => count.get() > 9)
  return el
}
mount(() => component(Counter, {}), '#app')
`

async function bundle(dev: boolean): Promise<string> {
  const out = join(dir, dev ? 'dev' : 'prod')
  // Etapa 1: o pacote (como o tsup.config.ts).
  await build({
    entryPoints: { index: src('index.ts'), runtime: src('runtime/index.ts') },
    outdir: out,
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2022',
    define: { __DEV__: String(dev) },
    minifySyntax: !dev,
    logLevel: 'silent',
  })
  // Etapa 2: o app do usuário, com o Rollup (o que o Vite usa em build). Tree-shaking padrão, sem minificar.
  writeFileSync(join(out, 'app.js'), COUNTER)
  const b = await rollup({ input: join(out, 'app.js'), onwarn: () => {} })
  const { output } = await b.generate({ format: 'es' })
  await b.close()
  return output[0].code
}

describe('build', () => {
  test('prod: sem avisos, devtools, readonly nem mensagens de dev', async () => {
    const code = await bundle(false)
    for (const s of [
      '__JOTASTIC_DEVTOOLS__',
      'console.warn',
      'derived-mutated',
      'derived-recreates-instance',
      'emit(',
    ]) {
      expect(code, s).not.toContain(s)
    }
    expect(code).not.toContain('process.env')
    expect(code).not.toContain('efeito executou')
  })

  test('prod: counter não puxa proxy, arrayMethods nem store/async', async () => {
    const code = await bundle(false)
    for (const s of ['new Proxy', 'toSorted', 'lastIndexOf', 'reduceRight', 'AbortController', 'getOwnPropertyNames']) {
      expect(code, s).not.toContain(s)
    }
  })

  test('dev: mantém avisos e devtools', async () => {
    const code = await bundle(true)
    expect(code).toContain('__JOTASTIC_DEVTOOLS__')
    expect(code).toContain('console.warn')
  })
})
