/**
 * `@jotastic/vite`: integra o compilador ao Vite (docs/spec/13-tooling.md §Vite).
 *
 * - `enforce: 'pre'`: roda antes do `vite:esbuild`; o compilador já remove os tipos e o JSX, então o esbuild só vê JS.
 * - `.tsx`/`.jsx` sempre passam pelo compilador; `.ts` só se declara um `use*` (único corpo reativo possível
 *   sem JSX, 18 §1). O resto segue intacto para o esbuild.
 * - `dev` = `!config.isProduction` (serve ou `--mode development`).
 * - `devtools` (padrão: ligado em dev): no dev server injeta no HTML um `<script type="module">` que carrega o módulo
 *   virtual `/@jotastic/devtools`, que chama `installDevtools()` de `@jotastic/devtools`. Em prod não injeta nada.
 * - `CompileError` vira erro do Rollup/Vite com `loc` e `frame` (o overlay mostra a mensagem do diagnóstico);
 *   avisos do analyzer vão para `this.warn`.
 */
import type { Plugin, ResolvedConfig } from 'vite'
import { compile, CompileError } from '@jotastic/compiler'
import { formatDiagnostic } from '@jotastic/analyzer'

export interface JotasticPluginOptions {
  /**
   * Devtools em dev (padrão: ligado em dev): injeta `installDevtools()` de `@jotastic/devtools` no HTML (o app precisa
   * ter `@jotastic/devtools` instalado). Ignorado em `vite build`.
   */
  devtools?: boolean
  /** Importa `watch`, `on`, `external`, `onMount`, `inspect` automaticamente. Desligado; ainda não implementado. */
  autoImport?: boolean
  /** HMR (passo 8). `preserveState` ainda não implementado. */
  hmr?: { preserveState?: boolean }
}

/** URL do módulo virtual que instala o devtools (injetado no HTML em dev). */
export const DEVTOOLS_URL = '/@jotastic/devtools'
const DEVTOOLS_ID = '\0jotastic:devtools'
const DEVTOOLS_CODE = `import { installDevtools } from '@jotastic/devtools'\ninstallDevtools()\n`

const JSX_FILE = /\.[jt]sx$/
const SCRIPT_FILE = /\.[mc]?ts$/
/** Declaração de `use*` (18 §1): `function useX`, `const useX =`, `useX = function`. */
const USE_DECL = /\b(?:function\s+use[A-Z0-9_$]|(?:const|let|var)\s+use[A-Z0-9_$][\w$]*\s*=)/

/** Decide, sem parsear, se o arquivo pode ter corpo reativo. */
export function shouldCompile(id: string, code: string): boolean {
  if (id.startsWith('\0') || id.includes('/node_modules/')) return false
  const file = id.split('?', 1)[0]!
  if (JSX_FILE.test(file)) return true
  if (SCRIPT_FILE.test(file) && !file.endsWith('.d.ts')) return USE_DECL.test(code)
  return false
}

/** Trecho do código ao redor de `line` (1-based) com marcador em `column` (1-based), no estilo do Babel. */
export function codeFrame(code: string, line: number, column: number): string {
  const lines = code.split(/\r?\n/)
  const from = Math.max(1, line - 2)
  const to = Math.min(lines.length, line + 2)
  const width = String(to).length
  const out: string[] = []
  for (let n = from; n <= to; n++) {
    const gutter = String(n).padStart(width)
    out.push(`${n === line ? '>' : ' '} ${gutter} | ${lines[n - 1]}`)
    if (n === line) out.push(`  ${' '.repeat(width)} | ${' '.repeat(Math.max(0, column - 1))}^`)
  }
  return out.join('\n')
}

export default function jotastic(options: JotasticPluginOptions = {}): Plugin {
  let dev = true
  let devtools = false

  return {
    name: 'jotastic',
    enforce: 'pre',

    config() {
      // O compilador já entrega JS sem JSX; `preserve` impede o esbuild de injetar um jsx-runtime.
      return { esbuild: { jsx: 'preserve' } }
    },

    configResolved(config: ResolvedConfig) {
      dev = !config.isProduction
      // Devtools só no dev server, mesmo com `devtools: true` explícito: nunca entra num bundle de `vite build`
      // (o runtime de prod nem emite eventos). `autoImport` e `hmr.preserveState` ainda não existem.
      devtools = config.command === 'serve' && dev && (options.devtools ?? true)
    },

    resolveId(id) {
      if (devtools && id === DEVTOOLS_URL) return DEVTOOLS_ID
      return null
    },

    load(id) {
      if (id === DEVTOOLS_ID) return DEVTOOLS_CODE
      return null
    },

    transformIndexHtml() {
      if (!devtools) return
      // `head-prepend`: scripts de módulo rodam em ordem; o hook fica instalado antes do app montar.
      return [{ tag: 'script', attrs: { type: 'module', src: DEVTOOLS_URL }, injectTo: 'head-prepend' }]
    },

    transform(code, id) {
      if (!shouldCompile(id, code)) return null
      const filename = id.split('?', 1)[0]!
      try {
        const result = compile(code, { filename, dev })
        for (const d of result.diagnostics) {
          if (d.level !== 'warning') continue
          this.warn({
            message: formatDiagnostic(d, filename),
            id: filename,
            loc: { line: d.loc.line, column: d.loc.column - 1 },
          })
        }
        return { code: result.code, map: result.map }
      } catch (err) {
        if (err instanceof CompileError) {
          const { line, column } = err.loc
          this.error({
            message: err.message,
            id: filename,
            plugin: 'jotastic',
            pluginCode: err.id,
            // Rollup/Vite: linha 1-based, coluna 0-based; o diagnóstico usa coluna 1-based.
            loc: { file: filename, line, column: Math.max(0, column - 1) },
            frame: codeFrame(code, line, column),
          })
        }
        // Erro de sintaxe do Babel: `loc` com coluna 0-based.
        const e = err as Error & { loc?: { line: number; column: number } }
        if (e && e.loc && typeof e.loc.line === 'number') {
          this.error({
            message: e.message,
            id: filename,
            loc: { file: filename, line: e.loc.line, column: e.loc.column },
            frame: codeFrame(code, e.loc.line, e.loc.column + 1),
          })
        }
        throw err
      }
    },
  }
}
