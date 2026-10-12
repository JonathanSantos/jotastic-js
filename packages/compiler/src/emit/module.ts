/**
 * Orquestração por módulo (18 §13–§14): corpos reativos, rodadas de JSX, thunks para JSX fora de corpo reativo,
 * imports nomeados de `jotastic/runtime` e templates hoisted.
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { Analysis, Diagnostic } from '@jotastic/analyzer'
import { BodyContext, ModuleContext, gid, type CompileOptions } from '../context'
import { CompileError } from '../errors'
import { emitDeclarations, finishParams, markTwoWay, rewriteBody, setupRules } from './bindings'
import { checkBodyFlow, emitBodyFlow } from './flow'
import { compileJSX, place, thunk } from './template'
import { compileUseBody } from './use'

/** APIs de `jotastic` reescritas para helpers do runtime; o import some quando todas as chamadas foram reescritas. */
const REWRITTEN_APIS = new Set(['watch', 'on', 'external', 'inspect', 'useSlots'])

/** Nomes usados pelo código do usuário (bindings de qualquer escopo + globais referenciados). */
function collectNames(program: NodePath<t.Program>): Set<string> {
  const names = new Set<string>(Object.keys(program.scope.bindings))
  program.traverse({
    Scopable(p) {
      for (const n of Object.keys(p.scope.bindings)) names.add(n)
    },
    Identifier(p) {
      if (p.isReferencedIdentifier()) names.add(p.node.name)
    },
  })
  return names
}

function compileComponentBody(ctx: BodyContext): void {
  checkBodyFlow(ctx)
  setupRules(ctx)
  markTwoWay(ctx)
  // `data-jo` no elemento raiz do JSX retornado (18 §14)
  const fn = ctx.fn!.node
  for (const f of ctx.body!.flow) if (f.kind === 'final' && f.node.argument) ctx.dataJo.add(f.node.argument)
  if (!t.isBlockStatement(fn.body)) ctx.dataJo.add(fn.body)
  rewriteBody(ctx)
  emitDeclarations(ctx)
  emitBodyFlow(ctx)
  finishParams(ctx)
}

/**
 * Compila o JSX em rodadas até não sobrar nenhum: cada rodada compila o JSX mais externo; o JSX aninhado que ficou
 * cru dentro do código gerado (getters de props, arrays de filhos, callbacks) é pego na rodada seguinte.
 */
function compileAllJSX(mod: ModuleContext): void {
  for (let round = 0; ; round++) {
    if (round > 500) throw new Error('jotastic: compilação de JSX não convergiu')
    let found = false
    mod.program.traverse({
      'JSXElement|JSXFragment'(p) {
        found = true
        p.skip()
        const path = p as NodePath<t.JSXElement | t.JSXFragment>
        const owner = path.findParent((q) => q.isFunction() && (mod.bodies.has(q.node) || mod.thunks.has(q.node)))
        const ctx = owner
          ? (mod.bodies.get(owner.node) ?? mod.thunks.get(owner.node)!)
          : new BodyContext(mod, null, null)
        const compiled = compileJSX(path, ctx)
        if (owner) {
          // corpo de arrow virou bloco: irmãos na fila ficaram com paths velhos → próxima rodada (X-8)
          if (place(path, compiled)) p.stop()
        } else {
          // JSX fora de corpo reativo → thunk (18 §13)
          const th = thunk(compiled)
          mod.thunks.set(th, ctx)
          path.replaceWith(th)
        }
      },
    })
    if (!found) return
  }
}

/** Marcadores de `jotastic` que a compilação faz sumir: `<Slot>` (18 §12), `pending(x)`/`refresh(x)` de recurso (§10.6). */
const MARKER_APIS = new Set(['Slot', 'pending', 'refresh'])

/** Imports de marcadores (`Slot`, `pending`, `refresh`) sem uso depois da compilação. */
function unusedMarkerImports(program: NodePath<t.Program>): NodePath<t.ImportSpecifier>[] {
  const out: NodePath<t.ImportSpecifier>[] = []
  for (const s of program.get('body')) {
    if (!s.isImportDeclaration() || s.node.source.value !== 'jotastic') continue
    for (const spec of s.get('specifiers')) {
      if (!spec.isImportSpecifier()) continue
      const imported = t.isIdentifier(spec.node.imported) ? spec.node.imported.name : spec.node.imported.value
      if (!MARKER_APIS.has(imported)) continue
      const local = spec.node.local.name
      let used = false
      program.traverse({
        ImportDeclaration(p) {
          p.skip()
        },
        Identifier(p) {
          // chave de objeto/getter (`get pending()`) não é uso
          if (p.node.name === local && p.isReferencedIdentifier()) used = true
        },
        JSXIdentifier(p) {
          if (p.node.name === local && !p.parentPath.isJSXAttribute()) used = true
        },
      })
      if (!used) out.push(spec)
    }
  }
  return out
}

/** Helpers internos de HMR vêm do subpath dev-only `jotastic/runtime/hmr` (D65); o resto, de `jotastic/runtime`. */
const isHmrHelper = (name: string): boolean => name.startsWith('__hmr')

function runtimeImports(mod: ModuleContext): t.ImportDeclaration[] {
  const names = [...mod.helpers.keys()]
  const runtime = names
    .filter((n) => !isHmrHelper(n))
    .sort((a, b) => (a === 'template' ? -1 : b === 'template' ? 1 : 0))
  const hmr = names.filter(isHmrHelper)
  const decl = (list: string[], source: string) =>
    t.importDeclaration(
      list.map((name) => t.importSpecifier(gid(mod.helpers.get(name)!), t.identifier(name))),
      t.stringLiteral(source),
    )
  const out: t.ImportDeclaration[] = []
  if (runtime.length) out.push(decl(runtime, 'jotastic/runtime'))
  if (hmr.length) out.push(decl(hmr, 'jotastic/runtime/hmr'))
  return out
}

/**
 * Exports do módulo para o HMR: componentes exportados (`nome exportado → identificador local`) e se há algum export
 * que não é componente (store, constante, `use*`, re-export…): aí o módulo não se auto-aceita e a atualização sobe
 * para os importadores (senão eles ficariam com o valor antigo).
 */
function hmrExports(
  program: NodePath<t.Program>,
  components: Set<t.Node>,
): { comps: Map<string, string>; other: boolean } {
  const comps = new Map<string, string>()
  let other = false
  const isComponentBinding = (local: string): boolean => {
    const b = program.scope.getBinding(local)
    if (!b) return false
    const n = b.path.node
    if (t.isFunctionDeclaration(n)) return components.has(n)
    return t.isVariableDeclarator(n) && !!n.init && components.has(n.init) && b.kind === 'const'
  }
  for (const s of program.node.body) {
    if (t.isExportAllDeclaration(s)) other = true
    else if (t.isExportDefaultDeclaration(s)) {
      const d = s.declaration
      if (t.isFunctionDeclaration(d) && d.id && components.has(d)) comps.set('default', d.id.name)
      else if (t.isIdentifier(d) && isComponentBinding(d.name)) comps.set('default', d.name)
      else other = true
    } else if (t.isExportNamedDeclaration(s)) {
      if (s.exportKind === 'type') continue
      const d = s.declaration
      if (t.isFunctionDeclaration(d)) {
        if (d.id && components.has(d)) comps.set(d.id.name, d.id.name)
        else other = true
      } else if (t.isVariableDeclaration(d)) {
        for (const v of d.declarations) {
          if (d.kind === 'const' && t.isIdentifier(v.id) && v.init && components.has(v.init))
            comps.set(v.id.name, v.id.name)
          else other = true
        }
      } else if (d) {
        // class, enum (TS já removido) …
        if (!t.isTSInterfaceDeclaration(d) && !t.isTSTypeAliasDeclaration(d) && !t.isTSDeclareFunction(d)) other = true
      } else if (s.source) other = true
      else {
        for (const spec of s.specifiers) {
          if (!t.isExportSpecifier(spec) || spec.exportKind === 'type') continue
          const exported = t.isIdentifier(spec.exported) ? spec.exported.name : spec.exported.value
          if (isComponentBinding(spec.local.name)) comps.set(exported, spec.local.name)
          else other = true
        }
      }
    }
  }
  return { comps, other }
}

/** `import.meta.hot` */
function importMetaHot(): t.MemberExpression {
  return t.memberExpression(t.metaProperty(t.identifier('import'), t.identifier('meta')), t.identifier('hot'))
}

/**
 * Rodapé de HMR (dev): `if (import.meta.hot) { import.meta.hot.accept(); __hmrComponents(file, { A, B }, opts) }`.
 * `accept()` literal (o Vite decide auto-aceitação pelo texto) só se todo export é componente.
 */
function hmrFooter(mod: ModuleContext, comps: Map<string, string>, accept: boolean): t.Statement {
  const hmr = mod.opts.hmr!
  const opts: t.ObjectProperty[] = []
  if (hmr.preserveState) opts.push(t.objectProperty(t.identifier('preserveState'), t.booleanLiteral(true)))
  if (hmr.reset) opts.push(t.objectProperty(t.identifier('reset'), t.booleanLiteral(true)))
  const register = mod.call('__hmrComponents', [
    t.stringLiteral(mod.opts.filename),
    t.objectExpression(
      [...comps].map(([exported, local]) =>
        t.objectProperty(t.identifier(exported), t.identifier(local), false, exported === local),
      ),
    ),
    ...(opts.length ? [t.objectExpression(opts)] : []),
  ])
  const body: t.Statement[] = []
  if (accept)
    body.push(t.expressionStatement(t.callExpression(t.memberExpression(importMetaHot(), t.identifier('accept')), [])))
  body.push(t.expressionStatement(register))
  return t.ifStatement(importMetaHot(), t.blockStatement(body))
}

/** Transforma o programa. Lança `CompileError` se o analyzer achou erros; devolve os avisos/dicas. */
export function transformProgram(program: NodePath<t.Program>, analysis: Analysis, opts: CompileOptions): Diagnostic[] {
  const errors = analysis.diagnostics.filter((d) => d.level === 'error')
  if (errors.length) throw new CompileError(opts.filename, errors)

  const bodyNodes = new Set<t.Node>(analysis.bodies.map((b) => b.node))
  const inBody = (p: NodePath) => !!p.findParent((q) => bodyNodes.has(q.node))

  // imports de `jotastic` que serão totalmente reescritos (todas as referências são chamadas dentro de corpos)
  const removable: NodePath<t.ImportSpecifier>[] = []
  const exempt = new Set<string>()
  for (const s of program.get('body')) {
    if (!s.isImportDeclaration() || s.node.source.value !== 'jotastic' || s.node.importKind === 'type') continue
    for (const spec of s.get('specifiers')) {
      if (!spec.isImportSpecifier()) continue
      const imported = t.isIdentifier(spec.node.imported) ? spec.node.imported.name : spec.node.imported.value
      if (!REWRITTEN_APIS.has(imported)) continue
      const binding = program.scope.getBinding(spec.node.local.name)
      if (!binding) continue
      const all = binding.referencePaths.every(
        (r) => r.parentPath?.isCallExpression() && r.key === 'callee' && inBody(r),
      )
      if (!all) continue
      removable.push(spec)
      exempt.add(spec.node.local.name)
    }
  }

  const hot =
    opts.dev && opts.hmr
      ? hmrExports(program, new Set(analysis.bodies.filter((b) => b.kind === 'component').map((b) => b.node)))
      : null

  const reserved = collectNames(program)
  for (const n of exempt) reserved.delete(n)
  const mod = new ModuleContext(program, opts, reserved)

  const paths = new Map<t.Node, NodePath<t.Function>>()
  program.traverse({
    Function(p) {
      if (bodyNodes.has(p.node)) paths.set(p.node, p)
    },
  })
  for (const body of analysis.bodies) {
    const fn = paths.get(body.node)
    if (!fn) continue
    mod.bodies.set(body.node, new BodyContext(mod, body, fn))
  }
  for (const ctx of mod.bodies.values()) {
    if (ctx.body!.kind === 'use') compileUseBody(ctx)
    else compileComponentBody(ctx)
  }

  compileAllJSX(mod)

  removable.push(...unusedMarkerImports(program))
  for (const spec of removable) {
    const decl = spec.parentPath as NodePath<t.ImportDeclaration>
    spec.remove()
    if (decl.node.specifiers.length === 0) decl.remove()
  }
  if (hot && hot.comps.size) program.node.body.push(hmrFooter(mod, hot.comps, !hot.other))
  const body = program.node.body
  let last = -1
  body.forEach((s, i) => {
    if (t.isImportDeclaration(s)) last = i
  })
  body.splice(last + 1, 0, ...mod.templateDecls)
  if (mod.helpers.size) body.unshift(...runtimeImports(mod))
  return analysis.diagnostics
}
