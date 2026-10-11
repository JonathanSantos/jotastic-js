/**
 * Contrato de `@jotastic/analyzer`: função pura AST → análise.
 * Consumido por `@jotastic/compiler` (transformação) e `@jotastic/eslint-plugin` (diagnósticos + fixes).
 * AST: Babel (`@babel/parser` com plugins `jsx`, `typescript`). Nenhuma informação de tipos.
 */
import type { File, Node, Function as FunctionNode, Identifier, VariableDeclarator, JSXElement, AwaitExpression, ReturnStatement, CallExpression } from '@babel/types'

export interface AnalyzeOptions {
  filename: string
  /** `.tsx` habilita componentes; `use*` vale em ambos. */
  isTSX: boolean
  dev: boolean
}

export interface Analysis {
  bodies: ReactiveBody[]
  diagnostics: Diagnostic[]
  /** JSX fora de corpos reativos (ex.: argumento de `mount`). Compila para thunk. */
  topLevelJSX: JSXElement[]
}

export interface ReactiveBody {
  kind: 'component' | 'use'
  name: string
  node: FunctionNode
  /** Parâmetros: componente → `props` (único objeto); use* → posicionais. */
  params: ParamInfo[]
  bindings: Map<string, BindingInfo>      // declarações do escopo raiz, por nome
  /** Pontos de decisão em ordem do código (early returns e awaits), com a continuação de cada um. */
  flow: FlowNode[]
  /** Leituras de `let`/`const` reativos que acontecem em contexto vivo (JSX, watch, memo…) — usado para decidir `signal` vs variável comum. */
  liveReads: Set<string>
  returnsJSX: boolean
  isAsync: boolean
}

export interface ParamInfo {
  name: string
  /** destructured → propriedade de props; rest → `rest(props, keys)`; positional → `use*` lazy. */
  kind: 'destructured' | 'rest' | 'positional' | 'propsObject'
  defaultValue?: Node
}

export type BindingKind =
  | 'signal'          // let, lido em contexto vivo, provavelmente primitivo
  | 'state'           // let, lido em contexto vivo, pode ser objeto
  | 'plain'           // let nunca lido em contexto vivo (variável comum) | const provavelmente constante
  | 'stateLiteral'    // const com literal de objeto/array sem leituras reativas → reactive(literal)
  | 'memo'            // const derivado (candidato ou provado)
  | 'memoLiteral'     // const literal de objeto com getters → cada getter vira memo
  | 'function'        // const arrow/função
  | 'jsx'             // const JSX
  | 'list'            // const expr.map(JSX)
  | 'resource'        // const/let await
  | 'external'        // const external(...)
  | 'useResult'       // const useAlgo(...)
  | 'ref'             // let usado em ref={x}
  | 'continuation'    // declarado depois de um ponto de decisão (pertence à continuação)

export interface BindingInfo {
  name: string
  kind: BindingKind
  declarator: VariableDeclarator
  isLet: boolean
  /** true se alguma atribuição/update ao identificador existe no corpo (qualquer profundidade). */
  reassigned: boolean
  /** Índice do FlowNode que a contém, ou -1 se está no setup. */
  flowIndex: number
  /** Para 'signal': prova de primitivo. Para 'memo': se foi provado (todas as leituras conhecidas) ou é candidato. */
  proven: boolean
  /** Identificadores reativos lidos no inicializador (para diagnósticos e devtools). */
  reads: Set<string>
}

export type FlowNode =
  | { kind: 'return'; node: ReturnStatement; cond: Node; branchIndex: number; prelude: Node[] }   // if (cond) { prelude; return X }
  | { kind: 'await'; node: AwaitExpression; declarator?: VariableDeclarator; reads: Set<string> }
  | { kind: 'final'; node: ReturnStatement }

export type DiagnosticLevel = 'error' | 'warning' | 'hint'

export interface Diagnostic {
  /** ID estável de 12-diagnosticos.md, ex.: 'return-in-loop-or-try'. */
  id: string
  level: DiagnosticLevel
  message: string
  suggestion?: string
  loc: { line: number; column: number; endLine: number; endColumn: number }
  /** Fix mecânico (ESLint `fixer`): substituir um intervalo por texto. */
  fix?: { range: [number, number]; text: string }
}

export function analyze(ast: File, options: AnalyzeOptions): Analysis

// ── Helpers expostos (usados pelo compiler e testados isoladamente) ────────────

/** Nome de evento DOM a partir da prop: `onClick` → ['click', false]; `onClickCapture` → ['click', true]; `on:x-y` → ['x-y', false]; não-evento → null. */
export function eventName(prop: string): [type: string, capture: boolean] | null

/** Decide como um atributo dinâmico é aplicado. Tabela em 18-transformacoes.md §5. */
export function attributeKind(tag: string, name: string): 'attr' | 'prop' | 'bool' | 'class' | 'style' | 'ref' | 'event' | 'innerHTML' | 'children' | 'key' | 'ignore'

/** Normaliza nomes: `className` → `class`, `htmlFor` → `for`, `tabindex` → `tabIndex` (propriedade) etc. */
export function normalizeAttribute(name: string): string

/** `true` se a expressão é sintaticamente "provavelmente primitiva" (literal, template, aritmética, comparação, `!`, `typeof`, concat). */
export function isProbablyPrimitive(node: Node): boolean

/** `true` se a expressão é atribuível (Identifier, MemberExpression, OptionalMember não) — para two-way. */
export function isAssignable(node: Node): boolean
