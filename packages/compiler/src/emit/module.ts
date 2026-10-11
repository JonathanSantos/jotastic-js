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
        if (owner) place(path, compiled)
        else {
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

function runtimeImport(mod: ModuleContext): t.ImportDeclaration {
  const order = [...mod.helpers.keys()].sort((a, b) => (a === 'template' ? -1 : b === 'template' ? 1 : 0))
  return t.importDeclaration(
    order.map((name) => t.importSpecifier(gid(mod.helpers.get(name)!), t.identifier(name))),
    t.stringLiteral('jotastic/runtime'),
  )
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
  const body = program.node.body
  let last = -1
  body.forEach((s, i) => {
    if (t.isImportDeclaration(s)) last = i
  })
  body.splice(last + 1, 0, ...mod.templateDecls)
  if (mod.helpers.size) body.unshift(runtimeImport(mod))
  return analysis.diagnostics
}
