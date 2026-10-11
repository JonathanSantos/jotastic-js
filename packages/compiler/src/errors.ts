/** Erros de compilação no formato de 12-diagnosticos.md §Formato. */
import type * as t from '@babel/types'
import { formatDiagnostic, type Diagnostic } from '@jotastic/analyzer'

export interface CompileErrorLoc {
  line: number
  /** 1-based (como os diagnósticos do analyzer, pendência A-7). */
  column: number
}

/**
 * Erro que impede a emissão do arquivo: diagnósticos de nível `error` do analyzer (18 §15) ou uma construção que o
 * compilador ainda não sabe emitir. `loc` aponta para o primeiro problema; `diagnostics` traz todos.
 */
export class CompileError extends Error {
  readonly id: string
  readonly loc: CompileErrorLoc
  readonly filename: string
  readonly diagnostics: Diagnostic[]

  constructor(filename: string, diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => formatDiagnostic(d, filename)).join('\n\n'))
    this.name = 'CompileError'
    this.filename = filename
    this.diagnostics = diagnostics
    this.id = diagnostics[0]?.id ?? 'unknown'
    this.loc = { line: diagnostics[0]?.loc.line ?? 0, column: diagnostics[0]?.loc.column ?? 0 }
  }
}

function locOf(node: t.Node): Diagnostic['loc'] {
  const l = node.loc
  if (!l) return { line: 0, column: 0, endLine: 0, endColumn: 0 }
  return { line: l.start.line, column: l.start.column + 1, endLine: l.end.line, endColumn: l.end.column + 1 }
}

/** Erro de emissão (não vem do analyzer): construção válida que o compilador não emite. */
export function compileError(filename: string, node: t.Node, id: string, message: string, suggestion?: string): never {
  const d: Diagnostic = { id, level: 'error', message, loc: locOf(node) }
  if (suggestion) d.suggestion = suggestion
  throw new CompileError(filename, [d])
}

/**
 * Gancho da parte 2 do passo 5 (condicionais, listas, early return, `use*`, slots, `await`): lança com a `loc` do nó.
 * Cada ponto que chama isto é o lugar exato onde a parte 2 pluga a emissão.
 */
export function notImplemented(filename: string, node: t.Node, feature: string): never {
  return compileError(
    filename,
    node,
    'not-implemented',
    `${feature}: ainda não implementado no compilador (passo 5, parte 2).`,
  )
}
