import { fileURLToPath } from 'node:url'
import { build, createServer, type Rollup } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import { SourceMap } from 'node:module'
import jotastic, {
  codeFrame,
  DEVTOOLS_URL,
  shouldCompile,
  storeExports,
  type JotasticPluginOptions,
} from '../src/index'

const COUNTER = `export function Counter() {
  let count: number = 0
  return <button onClick={() => count++}>{count}</button>
}
`

const LOOP_RETURN = `export function List({ items }: { items: string[] }) {
  for (const i of items) {
    return <p>{i}</p>
  }
  return <p />
}
`

const STORE = `import { createStore } from 'jotastic/store'

export const cart = createStore({ items: [] as string[] }, (set) => ({ add: (x: string) => set((s) => ({ items: [...s.items, x] })) }))
export const ui: Store<{ open: boolean }, {}> = createStore<{ open: boolean }>(() => ({ open: false }))
`

/** Contexto mínimo de plugin: `error` lança o objeto recebido, `warn` acumula. */
function setup(mode: 'serve' | 'build' = 'serve', options?: JotasticPluginOptions) {
  const plugin = jotastic(options)
  const configResolved = plugin.configResolved as (c: unknown) => void
  configResolved({ isProduction: mode === 'build', command: mode })
  const warnings: unknown[] = []
  const ctx = {
    warn: (w: unknown) => warnings.push(w),
    error: (e: unknown) => {
      throw e
    },
  }
  const transform = plugin.transform as unknown as (this: typeof ctx, code: string, id: string) => unknown
  return { plugin, warnings, run: (code: string, id: string) => transform.call(ctx, code, id) }
}

describe('@jotastic/vite', () => {
  test('metadados: enforce pre e esbuild sem transformar JSX', () => {
    const plugin = jotastic()
    expect(plugin.name).toBe('jotastic')
    expect(plugin.enforce).toBe('pre')
    expect((plugin.config as () => unknown)()).toEqual({ esbuild: { jsx: 'preserve' } })
  })

  test('transform de .tsx importa jotastic/runtime, remove tipos e devolve sourcemap', () => {
    const { run } = setup()
    const out = run(COUNTER, '/app/src/Counter.tsx') as { code: string; map: { sources: string[] } }
    expect(out.code).toMatch(/from 'jotastic\/runtime'/)
    expect(out.code).not.toContain(': number')
    expect(out.code).not.toContain('<button onClick')
    expect(out.map.sources[0]).toContain('Counter.tsx')
  })

  test('.ts sem corpo reativo passa intacto (null)', () => {
    const { run } = setup()
    expect(run('export const add = (a: number, b: number) => a + b\n', '/app/src/math.ts')).toBeNull()
    expect(run('export function x() {}', '/app/node_modules/lib/Comp.tsx')).toBeNull()
    expect(run('export function x() {}', '\0virtual.tsx')).toBeNull()
  })

  test('shouldCompile: .ts com use* compila; .d.ts e outros não', () => {
    expect(shouldCompile('/a/useCounter.ts', 'export function useCounter() {}')).toBe(true)
    expect(shouldCompile('/a/x.ts', 'export const useX = () => {}')).toBe(true)
    expect(shouldCompile('/a/x.ts', 'import { useX } from "./x"\nuseX()')).toBe(false)
    expect(shouldCompile('/a/x.d.ts', 'export function useX(): void')).toBe(false)
    expect(shouldCompile('/a/x.tsx?v=123', '')).toBe(true)
    expect(shouldCompile('/a/x.css', '')).toBe(false)
    // pacotes do workspace chegam pelo caminho real (fora de node_modules): .js nunca compila
    expect(shouldCompile('/repo/packages/jotastic/dist/index.js', 'function useSlots() {}')).toBe(false)
  })

  test('erro de compilação vira erro do Vite com loc, frame e mensagem do diagnóstico', () => {
    const { run } = setup()
    let err: { message: string; id: string; loc: { file: string; line: number; column: number }; frame: string }
    try {
      run(LOOP_RETURN, '/app/src/List.tsx')
      expect.unreachable()
    } catch (e) {
      err = e as typeof err
    }
    expect(err!.message).toContain('jotastic/return-in-loop-or-try')
    expect(err!.id).toBe('/app/src/List.tsx')
    expect(err!.loc).toEqual({ file: '/app/src/List.tsx', line: 3, column: 4 })
    expect(err!.frame).toContain('> 3 |     return <p>{i}</p>')
  })

  test('dev segue isProduction', () => {
    const dev = setup('serve').run(COUNTER, '/a/C.tsx') as { code: string }
    const prod = setup('build').run(COUNTER, '/a/C.tsx') as { code: string }
    expect(dev.code).toContain('data-jo=')
    expect(prod.code).not.toContain('data-jo=')
  })

  test('codeFrame marca a coluna', () => {
    expect(codeFrame('a\nbcd\ne', 2, 3)).toBe('  1 | a\n> 2 | bcd\n    |   ^\n  3 | e')
  })

  test('vite build de ponta a ponta', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = (await build({
      root: fileURLToPath(new URL('./fixtures/app', import.meta.url)),
      configFile: false,
      logLevel: 'silent',
      plugins: [jotastic()],
      build: { write: false, minify: false, rollupOptions: { external: [/^jotastic/] } },
    })) as Rollup.RollupOutput
    warn.mockRestore()
    const js = res.output.find((o) => o.type === 'chunk')!
    expect(js.type === 'chunk' && js.code).toMatch(/from "jotastic\/runtime"/)
    // Build de produção: nada de devtools no HTML nem no bundle.
    const html = res.output.find((o) => o.fileName === 'index.html')!
    expect(html.type === 'asset' && String(html.source)).not.toContain('devtools')
    expect(js.type === 'chunk' && js.code).not.toContain('installDevtools')
  })

  describe('devtools', () => {
    function hooks(mode: 'serve' | 'build', options?: Parameters<typeof jotastic>[0]) {
      const plugin = jotastic(options)
      ;(plugin.configResolved as (c: unknown) => void)({ isProduction: mode === 'build', command: mode })
      return {
        html: () => (plugin.transformIndexHtml as () => unknown)(),
        resolveId: (id: string) => (plugin.resolveId as (id: string) => unknown)(id),
        load: (id: string) => (plugin.load as (id: string) => unknown)(id),
      }
    }

    test('dev (padrão): injeta o script do devtools no head e serve o módulo virtual', () => {
      const h = hooks('serve')
      expect(h.html()).toEqual([
        { tag: 'script', attrs: { type: 'module', src: DEVTOOLS_URL }, injectTo: 'head-prepend' },
      ])
      const id = h.resolveId(DEVTOOLS_URL) as string
      expect(id).toMatch(/^\0/)
      expect(h.load(id)).toBe(`import { installDevtools } from '@jotastic/devtools'\ninstallDevtools()\n`)
    })

    test('devtools: false em dev e qualquer valor em build de produção: nada é injetado', () => {
      for (const h of [hooks('serve', { devtools: false }), hooks('build'), hooks('build', { devtools: true })]) {
        expect(h.html()).toBeUndefined()
        expect(h.resolveId(DEVTOOLS_URL)).toBeNull()
      }
    })

    test('dev server: o HTML transformado carrega o devtools antes do app', async () => {
      const server = await createServer({
        root: fileURLToPath(new URL('./fixtures/app', import.meta.url)),
        configFile: false,
        logLevel: 'silent',
        plugins: [jotastic()],
        server: { middlewareMode: true, hmr: false },
        optimizeDeps: { noDiscovery: true, include: [] },
      })
      try {
        const out = await server.transformIndexHtml(
          '/index.html',
          '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>',
        )
        const at = out.indexOf(`src="${DEVTOOLS_URL}"`)
        expect(at).toBeGreaterThan(-1)
        expect(at).toBeLessThan(out.indexOf('/src/main.ts'))
        const resolved = await server.pluginContainer.resolveId(DEVTOOLS_URL)
        const loaded = await server.pluginContainer.load(resolved!.id)
        expect(String(typeof loaded === 'string' ? loaded : loaded?.code)).toContain('installDevtools()')
      } finally {
        await server.close()
      }
    })
  })

  describe('sourcemap', () => {
    test('map do transform é válido, aponta para o arquivo de origem e traz o conteúdo original', () => {
      const { run } = setup()
      const out = run(COUNTER, '/app/src/Counter.tsx?t=1') as {
        code: string
        map: ConstructorParameters<typeof SourceMap>[0]
      }
      expect(out.map.sources).toEqual(['/app/src/Counter.tsx'])
      expect(out.map.sourcesContent).toEqual([COUNTER])
      // `count++` do handler: posição no gerado → posição no .tsx
      const lines = out.code.split('\n')
      const genLine = lines.findIndex((l) => l.includes('count.set('))
      expect(genLine).toBeGreaterThan(-1)
      const entry = new SourceMap(out.map).findEntry(genLine, lines[genLine]!.indexOf('count.set(')) as {
        originalSource: string
        originalLine: number
        originalColumn: number
      }
      expect(entry.originalSource).toBe('/app/src/Counter.tsx')
      expect(entry.originalLine).toBe(2)
      expect(COUNTER.split('\n')[2]!.slice(entry.originalColumn)).toMatch(/^count\+\+/)
    })
  })

  describe('HMR', () => {
    test('dev server: componente exportado ganha rodapé import.meta.hot com accept e registro no runtime', () => {
      const { run } = setup('serve')
      const out = run(COUNTER, '/app/src/Counter.tsx') as { code: string }
      expect(out.code).toContain('if (import.meta.hot) {')
      expect(out.code).toContain('import.meta.hot.accept()')
      expect(out.code).toMatch(/__hmrComponents\('\/app\/src\/Counter\.tsx', \{\s*Counter\s*\}\)/)
      expect(out.code).toMatch(/import \{[^}]*__hmrComponents[^}]*\} from 'jotastic\/runtime\/hmr'/)
      // hash do inicializador do `let` (preserveState decide no runtime)
      expect(out.code).toMatch(/hash: '[0-9a-z]+'/)
    })

    test('preserveState vai para o runtime; // @refresh reset força reset', () => {
      const { run } = setup('serve', { hmr: { preserveState: true } })
      const out = run(COUNTER, '/app/src/Counter.tsx') as { code: string }
      expect(out.code).toMatch(/\{\s*preserveState: true\s*\}/)
      const reset = run('// @refresh reset\n' + COUNTER, '/app/src/Counter.tsx') as { code: string }
      expect(reset.code).toMatch(/\{\s*preserveState: true,\s*reset: true\s*\}/)
    })

    test('módulo com export que não é componente não se auto-aceita (a atualização sobe)', () => {
      const { run } = setup('serve')
      const out = run(COUNTER + 'export const VERSION = 1\n', '/app/src/Counter.tsx') as { code: string }
      expect(out.code).toContain('__hmrComponents(')
      expect(out.code).not.toContain('accept(')
    })

    test('build (prod): sem import.meta.hot, sem hash, sem rodapé de store', () => {
      const { run } = setup('build')
      const out = run(COUNTER, '/app/src/Counter.tsx') as { code: string }
      expect(out.code).not.toContain('import.meta.hot')
      expect(out.code).not.toContain('__hmr')
      expect(out.code).not.toContain('hash')
      expect(run(STORE, '/app/src/cart.ts')).toBeNull()
    })

    test('dev server: store exportado ganha rodapé que preserva o estado, sem mexer no código', () => {
      const { run } = setup('serve')
      const out = run(STORE, '/app/src/cart.ts') as { code: string; map: null }
      expect(out.code.startsWith(STORE)).toBe(true)
      expect(out.map).toBeNull()
      expect(out.code).toContain("import { __hmrStores as __jotasticHmrStores } from 'jotastic/store'")
      expect(out.code).toContain(
        'if (import.meta.hot && import.meta.hot.data) __jotasticHmrStores(import.meta.hot.data, { cart, ui })',
      )
      expect(out.code).not.toContain('accept(')
      const reset = run('// @refresh reset\n' + STORE, '/app/src/cart.ts') as { code: string }
      expect(reset.code).toContain('{ cart, ui }, true)')
      expect(run('export const x = 1\n', '/app/src/x.ts')).toBeNull()
      expect(run(STORE, '/app/node_modules/lib/cart.ts')).toBeNull()
    })

    test('storeExports: só `export const x = createStore(`', () => {
      expect(storeExports(STORE)).toEqual(['cart', 'ui'])
      expect(storeExports('const s = createStore(() => ({}))\nexport { s }')).toEqual([])
    })
  })
})
