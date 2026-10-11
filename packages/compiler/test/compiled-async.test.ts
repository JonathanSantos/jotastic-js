// Snapshot da parte 3 (18 §10): docs/spec/compiled/05-async-user-card.js a partir de `UserCard`/`Sidebar` de
// examples/06-async.tsx (recorte em inputs.ts, A-11), normalizado como em compiled.test.ts (ver snapshot.ts). Cada
// divergência conhecida está na allowlist, citando a pendência ou a seção da spec.
import { describe, test } from 'vitest'
import * as t from '@babel/types'
import { compile } from '../src/index'
import { spec } from './helpers'
import { asyncInput } from './inputs'
import { compareSnapshot, replaceStrings, traverse, type AllowEntry } from './snapshot'

const ALLOW_05: AllowEntry[] = [
  {
    ref: '18 §14 (dev: `data-jo` no elemento raiz do template de cada componente)',
    why: 'compiled/05 foi escrito antes do `data-jo` (como compiled/01)',
    side: 'actual',
    apply: (ast) => {
      let changed = false
      traverse(ast, {
        StringLiteral(p) {
          const v = p.node.value.replace(/ data-jo="[^"]*"/g, '')
          if (v !== p.node.value) {
            p.node.value = v
            delete p.node.extra
            changed = true
          }
        },
      })
      return changed
    },
  },
  {
    ref: '07-async §Boundary / 18 §14 (`Boundary` continua importado de `jotastic`)',
    why: 'compiled/05 mostra no fim do arquivo, como ilustração, a implementação de `Boundary` do pacote (`boundary` do runtime); o módulo compilado importa `Boundary` de `jotastic`, como a entrada',
    side: 'expected',
    apply: (ast) => {
      const body = ast.program.body
      const i = body.findIndex(
        (s) =>
          t.isExportNamedDeclaration(s) &&
          t.isFunctionDeclaration(s.declaration) &&
          s.declaration.id?.name === 'Boundary',
      )
      if (i < 0) return false
      body.splice(i, 1)
      const imp = body[0] as t.ImportDeclaration
      const before = imp.specifiers.length
      imp.specifiers = imp.specifiers.filter((s) => s.local.name !== 'boundary')
      body.splice(
        1,
        0,
        t.importDeclaration(
          [t.importSpecifier(t.identifier('Boundary'), t.identifier('Boundary'))],
          t.stringLiteral('jotastic'),
        ),
      )
      return imp.specifiers.length !== before
    },
  },
  {
    ref: '18 §14 (dev: `{ name, loc }` em todo `component`)',
    why: 'compiled/05 omite o metadado de dev em `component(Skeleton, {})` e `component(ErrorBox, …)` (props de `Boundary`) e o mantém em `UserCard`/`Boundary`; o compilador emite em todos',
    side: 'actual',
    apply: (ast) => {
      let n = 0
      traverse(ast, {
        CallExpression(p) {
          const [comp] = p.node.arguments
          if (!t.isIdentifier(p.node.callee, { name: 'component' }) || p.node.arguments.length !== 3) return
          if (!t.isIdentifier(comp) || !['Skeleton', 'ErrorBox'].includes(comp.name)) return
          p.node.arguments.pop()
          n++
        },
      })
      return n === 2
    },
  },
  {
    ref: 'loc de dev (A-7) medido na entrada recortada',
    why: 'o snapshot supõe um arquivo por componente (`Sidebar.tsx:3:5`); aqui `UserCard` e `Sidebar` estão em `UserCard.tsx` (o `loc` do recurso, `UserCard.tsx:6:9`, bate)',
    side: 'expected',
    apply: (ast) => replaceStrings(ast, { 'Sidebar.tsx:3:5': 'UserCard.tsx:17:5', 'Sidebar.tsx:4:7': 'UserCard.tsx:18:7' }),
  },
]

describe('compiled/ (snapshots de referência, parte 3)', () => {
  test('05-async-user-card', async () => {
    const actual = compile(asyncInput(), { filename: 'UserCard.tsx', dev: true }).code
    await compareSnapshot(actual, spec('compiled/05-async-user-card.js'), ALLOW_05)
  })
})
