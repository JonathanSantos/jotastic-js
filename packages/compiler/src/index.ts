/**
 * `@jotastic/compiler`: TSX → JS que chama `jotastic/runtime` (docs/spec/18-transformacoes.md).
 *
 * - `compile(code, { filename, dev })` → `{ code, map, diagnostics }`: parse, remoção de tipos, análise, emissão.
 * - Plugin Babel (export default): mesma transformação dentro de um pipeline Babel (espera o TS já removido ou
 *   tolerado pelo pipeline; `compile` é a entrada recomendada).
 */
import { parse } from '@babel/parser'
import { transformFromAstSync, type PluginObj, type PluginPass } from '@babel/core'
import _generate from '@babel/generator'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import tsPlugin from '@babel/plugin-transform-typescript'
import { analyze, type Diagnostic } from '@jotastic/analyzer'
import type { CompileOptions } from './context'
import { transformProgram } from './emit/module'

export { CompileError } from './errors'
export type { CompileOptions } from './context'
export type { Diagnostic } from '@jotastic/analyzer'

/** `@babel/traverse` e `@babel/generator` são CJS: o default pode vir embrulhado conforme o loader. */
const traverse: typeof _traverse = (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse
const generate: typeof _generate = (_generate as unknown as { default?: typeof _generate }).default ?? _generate

export interface CompileResult {
  code: string
  map: ReturnType<typeof _generate>['map']
  /** Avisos e dicas do analyzer (erros viram `CompileError`). */
  diagnostics: Diagnostic[]
}

function programPath(ast: t.File): NodePath<t.Program> {
  let program: NodePath<t.Program> | undefined
  traverse(ast, {
    Program(p) {
      program = p
      p.stop()
    },
  })
  return program!
}

/** `// @refresh reset` entre os comentários do topo do arquivo (antes de qualquer código). */
export function hasRefreshReset(code: string): boolean {
  const head = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/.exec(code)![0]
  return /(?:\/\/|\*)\s*@refresh reset\b/.test(head)
}

export interface CompileCallOptions {
  filename: string
  /** Padrão: true. */
  dev?: boolean
  /**
   * HMR (dev): `true` ou `{ preserveState }`. Emite `hash` do inicializador nos `let` e o rodapé
   * `if (import.meta.hot) { … }` que registra os componentes exportados no runtime (`__hmrComponents`).
   */
  hmr?: boolean | { preserveState?: boolean }
}

export function compile(code: string, options: CompileCallOptions): CompileResult {
  const dev = options.dev ?? true
  const hmr =
    dev && options.hmr
      ? {
          preserveState: typeof options.hmr === 'object' && !!options.hmr.preserveState,
          reset: hasRefreshReset(code),
        }
      : null
  const opts: CompileOptions = { filename: options.filename, dev, hmr }
  const isTS = /\.[mc]?tsx?$/.test(opts.filename)
  const isJSX = /\.[jt]sx$/.test(opts.filename)
  let ast: t.File = parse(code, {
    sourceType: 'module',
    sourceFilename: opts.filename,
    plugins: isTS ? ['jsx', 'typescript'] : ['jsx'],
  })
  if (isTS) {
    const res = transformFromAstSync(ast, code, {
      ast: true,
      code: false,
      configFile: false,
      babelrc: false,
      cloneInputAst: false,
      filename: opts.filename,
      plugins: [[tsPlugin, { isTSX: isJSX, allExtensions: true }]],
    })
    ast = res!.ast!
  }
  // escopos novos depois da remoção de tipos (o analyzer e a emissão compartilham este cache)
  traverse.cache.clear()
  const analysis = analyze(ast, { filename: opts.filename, isTSX: isJSX, dev: opts.dev, code })
  const diagnostics = transformProgram(programPath(ast), analysis, opts)
  const out = generate(
    ast,
    { sourceMaps: true, sourceFileName: opts.filename, jsescOption: { minimal: true, quotes: 'single' } },
    code,
  )
  return { code: out.code, map: out.map, diagnostics }
}

/** Plugin Babel. Opções: `{ dev?: boolean, filename?: string }` (padrão: o arquivo do pipeline, dev ligado). */
export default function jotasticBabelPlugin(
  _api: unknown,
  options: { dev?: boolean; filename?: string } = {},
): PluginObj<PluginPass> {
  return {
    name: 'jotastic',
    visitor: {
      Program(path, state) {
        const filename = options.filename ?? state.filename ?? 'unknown.tsx'
        const opts: CompileOptions = { filename, dev: options.dev ?? true }
        const analysis = analyze(path.parent as t.File, {
          filename,
          isTSX: /\.[jt]sx$/.test(filename),
          dev: opts.dev,
          code: state.file.code,
        })
        transformProgram(path, analysis, opts)
      },
    },
  }
}
