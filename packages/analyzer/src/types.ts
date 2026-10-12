/**
 * Tipos de `@jotastic/analyzer`, copiados de `docs/spec/contracts/analyzer.d.ts`.
 * Ajustes (todos compatíveis com o contrato):
 * - `AnalyzeOptions.code?`: fonte original, opcional, usada só para montar o texto de `fix` que precisa copiar código
 *   (`inner-html-object`, `state-read-in-setup`). Sem ela, esses diagnósticos saem sem `fix`.
 * - `Analysis.topLevelJSX` aceita também `JSXFragment` (ex.: `mount(<>…</>, …)`).
 * - `FlowNode` de `await` tem `hoisted` (W-5, 18 §10): o compilador precisa saber se iça o `await`.
 * - `isProbablyPrimitive(node, isPrimitiveId?)`: predicado opcional para identificadores de `let` signal (D60).
 */
import type {
  AwaitExpression,
  Function as FunctionNode,
  JSXElement,
  JSXFragment,
  Node,
  ReturnStatement,
  VariableDeclarator,
} from '@babel/types'

export interface AnalyzeOptions {
  filename: string
  /** `.tsx` habilita componentes; `use*` vale em ambos. */
  isTSX: boolean
  dev: boolean
  /** Fonte original (opcional): habilita fixes que copiam trechos do código. */
  code?: string
}

export interface Analysis {
  bodies: ReactiveBody[]
  diagnostics: Diagnostic[]
  /** JSX fora de corpos reativos (ex.: argumento de `mount`). Compila para thunk. */
  topLevelJSX: Array<JSXElement | JSXFragment>
}

export interface ReactiveBody {
  kind: 'component' | 'use'
  name: string
  node: FunctionNode
  /** Parâmetros: componente → `props` (único objeto); use* → posicionais. */
  params: ParamInfo[]
  /** declarações do escopo raiz, por nome */
  bindings: Map<string, BindingInfo>
  /** Pontos de decisão em ordem do código (early returns e awaits), com a continuação de cada um. */
  flow: FlowNode[]
  /** Leituras de `let`/`const` reativos que acontecem em contexto vivo (JSX, watch, memo…). */
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
  | 'signal' // let, lido em contexto vivo, provavelmente primitivo
  | 'state' // let, lido em contexto vivo, pode ser objeto
  | 'plain' // let nunca lido em contexto vivo (variável comum) | const provavelmente constante
  | 'stateLiteral' // const com literal de objeto/array sem leituras reativas → reactive(literal)
  | 'memo' // const derivado (candidato ou provado)
  | 'memoLiteral' // const literal de objeto com getters → cada getter vira memo
  | 'function' // const arrow/função
  | 'jsx' // const JSX
  | 'list' // const expr.map(JSX)
  | 'resource' // const/let await
  | 'external' // const external(...)
  | 'useResult' // const useAlgo(...)
  | 'ref' // let usado em ref={x}
  | 'continuation' // declarado depois de um ponto de decisão (pertence à continuação)

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
  | { kind: 'return'; node: ReturnStatement; cond: Node; branchIndex: number; prelude: Node[] }
  | {
      kind: 'await'
      node: AwaitExpression
      declarator?: VariableDeclarator
      reads: Set<string>
      /**
       * W-5: `true` quando o `await` está aninhado no inicializador (`const x = f(await e)`, `(await e).y`) e deve
       * ser içado para `_rN`, substituído por `_rN.value.get()` no inicializador. `false`: `await` é o inicializador
       * inteiro ou o statement inteiro.
       */
      hoisted: boolean
    }
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
