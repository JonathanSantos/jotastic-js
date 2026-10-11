/** Estado compartilhado da emissão: módulo (imports, templates, nomes) e corpo reativo (regras de reescrita). */
import * as t from '@babel/types'
import _generate from '@babel/generator'
import type { NodePath } from '@babel/traverse'
import type { ReactiveBody } from '@jotastic/analyzer'
import { compileError, notImplemented } from './errors'

/** `@babel/generator` é CJS: o default pode vir embrulhado conforme o loader. */
const generate: typeof _generate = (_generate as unknown as { default?: typeof _generate }).default ?? _generate

export interface CompileOptions {
  /** Caminho do arquivo; o `basename` vai para os `loc` de dev (`Counter.tsx:5:7`). */
  filename: string
  /** Dev: metadados `{ name, loc }`, `data-jo`, `inspect`. Prod: nada disso. */
  dev: boolean
  /**
   * HMR (só com `dev`): `hash` do inicializador no meta de cada `let` (signal/state) e rodapé
   * `if (import.meta.hot) { … __hmrComponents(…) }` registrando os componentes exportados.
   * `preserveState` vai para o runtime; `reset` = `// @refresh reset` no topo do arquivo.
   */
  hmr?: { preserveState: boolean; reset: boolean } | null
}

/** Como ler/escrever um binding reescrito (18 §4). */
export interface Rule {
  read(): t.Expression
  /** Ausente: escrita não é reescrita (ex.: prop desestruturada vira escrita no objeto `props`). */
  write?(value: t.Expression): t.Expression
  /** Alvo de escrita quando não há `write` (prop desestruturada: `label = x` → `props.label = x`). */
  target?(): t.Expression
}

export type TwoWayKind = 'value' | 'number' | 'checked' | 'select' | 'multiple'

/** Nós criados pelo compilador: a reescrita de §4 não os toca (evita `x.get().get()`). */
const generatedNodes = new WeakSet<t.Node>()

export function isGenerated(n: t.Node): boolean {
  return generatedNodes.has(n)
}

/** Identificador gerado pelo compilador. */
export function gid(name: string): t.Identifier {
  const n = t.identifier(name)
  generatedNodes.add(n)
  return n
}

/** FNV-1a 32 bits (base 36) do código gerado de `node`, sem comentários. */
export function hashCode(node: t.Node): string {
  const code = generate(node, { comments: false, compact: true }).code
  let h = 0x811c9dc5
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function basename(filename: string): string {
  const parts = filename.split(/[\\/]/)
  return parts[parts.length - 1] || filename
}

export class ModuleContext {
  readonly opts: CompileOptions
  readonly file: string
  readonly program: NodePath<t.Program>
  /** Nomes que o código do usuário já usa (qualquer escopo): temporárias e helpers desviam deles. */
  readonly reserved: Set<string>
  /** Nomes alocados no nível do módulo (helpers, templates). */
  readonly moduleNames = new Set<string>()
  /** Nomes alocados dentro de corpos (helpers e templates desviam deles: `const _rest = _rest(…)` seria TDZ). */
  readonly bodyNames = new Set<string>()
  /** Helper do runtime → nome local (ordem = ordem de primeiro uso). */
  readonly helpers = new Map<string, string>()
  /** html+svg → nome do template hoisted. */
  readonly templates = new Map<string, string>()
  readonly templateDecls: t.VariableDeclaration[] = []
  /** Corpo reativo (nó da função) → contexto. */
  readonly bodies = new Map<t.Node, BodyContext>()
  /** Thunks criados para JSX fora de corpo reativo (18 §13) → contexto de nomes próprio. */
  readonly thunks = new WeakMap<t.Node, BodyContext>()
  /** Sentinelas de two-way (`_twoWay(read, write)`) → kind do `twoWay` (18 §5.5). */
  readonly twoWay = new WeakMap<t.Node, TwoWayKind>()

  constructor(program: NodePath<t.Program>, opts: CompileOptions, reserved: Set<string>) {
    this.program = program
    this.opts = opts
    this.file = basename(opts.filename)
    this.reserved = reserved
  }

  /** Identificador do helper `name` de `jotastic/runtime` (registra o import). */
  helper(name: string): t.Identifier {
    let local = this.helpers.get(name)
    if (!local) {
      const taken = this.reserved.has(name) || this.moduleNames.has(name) || this.bodyNames.has(name)
      local = taken ? this.allocate(`_${name}`, false, this.bodyNames) : name
      this.moduleNames.add(local)
      this.helpers.set(name, local)
    }
    return gid(local)
  }

  /** Chamada a um helper do runtime. */
  call(name: string, args: Array<t.Expression | t.SpreadElement>): t.CallExpression {
    return t.callExpression(this.helper(name), args)
  }

  /** Template hoisted, deduplicado por string (18 §14). */
  template(html: string, svg: boolean): t.Identifier {
    const key = `${svg ? 'svg:' : ''}${html}`
    let name = this.templates.get(key)
    if (!name) {
      name = this.allocate('_t', true, this.bodyNames)
      this.moduleNames.add(name)
      this.templates.set(key, name)
      const args: t.Expression[] = [t.stringLiteral(html)]
      if (svg) args.push(t.booleanLiteral(true))
      this.templateDecls.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(gid(name), t.callExpression(this.helper('template'), args)),
        ]),
      )
    }
    return gid(name)
  }

  /** `Arquivo.tsx:linha:coluna` (coluna 1-based, A-7). */
  loc(node: t.Node): string {
    const l = node.loc
    return l ? `${this.file}:${l.start.line}:${l.start.column + 1}` : this.file
  }

  /** Com HMR: `{ name, loc, hash }`, `hash` = FNV-1a do código de `init` (inicializador do `let`). */
  metaWithHash(name: string, node: t.Node, init: t.Node): t.ObjectExpression | null {
    const meta = this.meta(name, node)
    if (meta && this.opts.hmr)
      meta.properties.push(t.objectProperty(t.identifier('hash'), t.stringLiteral(hashCode(init))))
    return meta
  }

  /** `{ name, loc }` em dev; `null` em prod (o argumento é omitido). */
  meta(name: string | undefined, node: t.Node): t.ObjectExpression | null {
    if (!this.opts.dev) return null
    const props: t.ObjectProperty[] = []
    if (name !== undefined) props.push(t.objectProperty(t.identifier('name'), t.stringLiteral(name)))
    props.push(t.objectProperty(t.identifier('loc'), t.stringLiteral(this.loc(node))))
    return t.objectExpression(props)
  }

  /** Aloca um nome livre: `base`, `base2`… ou, numerado, `base0`, `base1`… */
  allocate(base: string, numbered: boolean, local?: Set<string>, reserved: Set<string> = this.reserved): string {
    const taken = (n: string) => reserved.has(n) || this.moduleNames.has(n) || !!local?.has(n)
    if (numbered) {
      for (let i = 0; ; i++) if (!taken(`${base}${i}`)) return `${base}${i}`
    }
    if (!taken(base)) return base
    for (let i = 2; ; i++) if (!taken(`${base}${i}`)) return `${base}${i}`
  }

  error(node: t.Node, id: string, message: string, suggestion?: string): never {
    return compileError(this.opts.filename, node, id, message, suggestion)
  }

  notImplemented(node: t.Node, feature: string): never {
    return notImplemented(this.opts.filename, node, feature)
  }
}

export class BodyContext {
  readonly mod: ModuleContext
  /** `null` = código fora de corpo reativo (JSX de módulo). */
  readonly body: ReactiveBody | null
  readonly fn: NodePath<t.Function> | null
  /** Identificador de declaração (binding) → regra de reescrita. */
  readonly rules = new Map<t.Node, Rule>()
  /** Bindings que são props do componente (two-way nunca se aplica a elas, 18 §5.5). */
  readonly propBindings = new Set<t.Node>()
  /** Nomes locais já alocados neste corpo. */
  readonly names = new Set<string>()
  /** Elementos JSX raiz do template do componente (recebem `data-jo` em dev, 18 §14). */
  readonly dataJo = new WeakSet<t.Node>()
  /**
   * Dentro de branch/item de lista/continuação (parte 2 liga isto): `ref` ganha `onCleanup` e `autofocus` ganha
   * `autofocus(el)` (18 §5.3, §5.6).
   */
  inFlow = false
  /**
   * Dentro de `children`/slot de componente (X-9): quem recebe decide quando os nós morrem (ex.: corpo de modal com
   * early return), então `ref` também ganha `onCleanup`. `autofocus` não muda.
   */
  inChildren = false
  /** Bindings vindos de `await` (identificador da declaração) → nome do recurso (`_r0`), para `pending`/`refresh`. */
  readonly resources = new Map<t.Node, string>()
  /** Nome do parâmetro de props quando o compilador o criou (props desestruturadas). */
  propsName: string | null = null
  /** Statements inseridos no início do corpo (`const _rest = rest(props, […])`). */
  readonly prelude: t.Statement[] = []

  /** Nomes que o código do usuário usa dentro deste corpo, mais os do escopo do módulo e globais. */
  private readonly reserved: Set<string>

  constructor(mod: ModuleContext, body: ReactiveBody | null, fn: NodePath<t.Function> | null) {
    this.mod = mod
    this.body = body
    this.fn = fn
    if (fn) {
      const program = mod.program.scope
      this.reserved = new Set([
        ...Object.keys(program.bindings),
        ...Object.keys((program as unknown as { globals: Record<string, unknown> }).globals ?? {}),
      ])
      t.traverseFast(fn.node, (n) => {
        if (t.isIdentifier(n)) this.reserved.add(n.name)
      })
    } else this.reserved = mod.reserved
  }

  /** Nome local livre neste corpo. */
  name(base: string, numbered = false): string {
    const n = this.mod.allocate(base, numbered, this.names, this.reserved)
    this.names.add(n)
    this.mod.bodyNames.add(n)
    return n
  }

  /** Regra do binding a que `name` se refere a partir de `path` (respeita sombreamento). */
  ruleFor(path: NodePath, name: string): Rule | undefined {
    const b = path.scope.getBinding(name)
    return b ? this.rules.get(b.identifier) : undefined
  }

  isProp(path: NodePath, name: string): boolean {
    const b = path.scope.getBinding(name)
    return !!b && this.propBindings.has(b.identifier)
  }
}
