// Snapshots da parte 2b (18 §11–§12): docs/spec/compiled/03-use-fetch.js e 06-slots-card.js, normalizados como em
// compiled.test.ts (ver snapshot.ts). Cada divergência conhecida está na allowlist, citando a pendência.
import { describe, test } from 'vitest'
import * as t from '@babel/types'
import { compile } from '../src/index'
import { spec } from './helpers'
import { SLOTS_INPUT, useFetchInput } from './inputs'
import { compareSnapshot, replaceStrings, traverse, type AllowEntry } from './snapshot'

/** `signal(` → `state(` nos declaradores `names` e acerta o import do runtime. */
function signalToState(ast: t.File, names: string[]): boolean {
  let changed = 0
  traverse(ast, {
    VariableDeclarator(p) {
      const { id, init } = p.node
      if (!t.isIdentifier(id) || !names.includes(id.name)) return
      if (!t.isCallExpression(init) || !t.isIdentifier(init.callee, { name: 'signal' })) return
      init.callee = t.identifier('state')
      changed++
    },
  })
  let stillUsed = false
  traverse(ast, {
    CallExpression(p) {
      if (t.isIdentifier(p.node.callee, { name: 'signal' })) stillUsed = true
    },
  })
  if (!stillUsed) {
    const imp = ast.program.body[0] as t.ImportDeclaration
    imp.specifiers = imp.specifiers.filter((s) => s.local.name !== 'signal')
  }
  return changed === names.length
}

const ALLOW_03: AllowEntry[] = [
  {
    ref: 'A-1 (`signal` vs `state`)',
    why: 'compiled/03 usa `signal` para `error` (`error = e`) e `matches` (`let matches = mql.matches`); o analyzer segue 18 §3 e classifica os dois como `state` (nenhuma regra sintática reproduz o snapshot)',
    side: 'expected',
    apply: (ast) => signalToState(ast, ['error', 'matches']),
  },
  {
    ref: 'loc de dev (A-7) medido na entrada recortada',
    why: 'o snapshot supõe um arquivo por função (`useMediaQuery.ts:2:9`); aqui os três estão em `useFetch.ts`. `loading`: o valor `data === null && …` está na linha 16, coluna 34 do recorte (o snapshot diz 15:30, que não bate com nenhuma versão do exemplo)',
    side: 'expected',
    apply: (ast) =>
      replaceStrings(ast, {
        'useFetch.ts:15:30': 'useFetch.ts:16:34',
        'useMediaQuery.ts:2:9': 'useFetch.ts:20:9',
        'useMediaQuery.ts:3:7': 'useFetch.ts:21:7',
      }),
  },
]

const ALLOW_06: AllowEntry[] = [
  {
    ref: '18 §14 (dev: `data-jo` no elemento raiz do template de cada componente)',
    why: 'compiled/06 foi escrito antes do `data-jo` (como compiled/01)',
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
    ref: 'K-8 (helper colidindo com variável do usuário)',
    why: 'o usuário chama a variável de `slots`; o compilador mantém o nome do usuário e importa `slots as _slots`. compiled/06 renomeia a variável (`const _slots = slots(…)`)',
    side: 'actual',
    apply: (ast) => {
      let changed = false
      traverse(ast, {
        Identifier(p) {
          if (p.node.name === 'slots' && !p.parentPath.isImportSpecifier()) {
            p.node.name = '_slots'
            changed = true
          } else if (p.node.name === '_slots') p.node.name = 'slots'
        },
      })
      return changed
    },
  },
  {
    ref: '18 §8 (`list(parent, marker, src, render, key?, dev)`)',
    why: 'compiled/06 omite o `dev` do `list`; o compilador (parte 2a) emite `{ loc }`',
    side: 'actual',
    apply: (ast) => {
      let changed = false
      traverse(ast, {
        CallExpression(p) {
          if (t.isIdentifier(p.node.callee, { name: 'list' }) && p.node.arguments.length === 6) {
            p.node.arguments.pop()
            changed = true
          }
        },
      })
      return changed
    },
  },
  {
    ref: '18 §5 (parte 1: elemento sem bindings vira `const _el = _tN(); return _el`)',
    why: 'compiled/06 escreve `() => _t5()` para template estático; o compilador gera o bloco. Equivalente; candidato a otimização em `place`',
    side: 'actual',
    apply: (ast) => {
      let changed = false
      traverse(ast, {
        ArrowFunctionExpression(p) {
          const b = p.node.body
          if (!t.isBlockStatement(b) || b.body.length !== 2) return
          const [d, r] = b.body
          if (!t.isVariableDeclaration(d) || !t.isReturnStatement(r) || d.declarations.length !== 1) return
          const { id, init } = d.declarations[0]!
          if (!t.isIdentifier(id) || !t.isIdentifier(r.argument, { name: id.name }) || !init) return
          if (!t.isCallExpression(init) || init.arguments.length || !t.isIdentifier(init.callee)) return
          p.node.body = init
          changed = true
        },
      })
      return changed
    },
  },
  {
    ref: '18 §14 (templates hoisted no topo, deduplicados)',
    why: 'compiled/06 declara os templates de `Page` no meio do módulo, numerados na ordem em que escreveu; o compilador os sobe para depois dos imports, na ordem da primeira compilação',
    side: 'expected',
    apply: (ast) => {
      const body = ast.program.body
      const isTemplate = (s: t.Statement) =>
        t.isVariableDeclaration(s) &&
        t.isCallExpression(s.declarations[0]?.init) &&
        t.isIdentifier((s.declarations[0]!.init as t.CallExpression).callee, { name: 'template' })
      const templates = body.filter(isTemplate) as t.VariableDeclaration[]
      const rest = body.filter((s) => !isTemplate(s))
      // ordem do compilador: primeira referência no código
      const order: string[] = []
      t.traverseFast(t.program(rest), (n) => {
        if (t.isIdentifier(n) && /^_t\d+$/.test(n.name) && !order.includes(n.name)) order.push(n.name)
      })
      const name = (d: t.VariableDeclaration) => (d.declarations[0]!.id as t.Identifier).name
      templates.sort((a, b) => order.indexOf(name(a)) - order.indexOf(name(b)))
      const imports = rest.filter((s) => t.isImportDeclaration(s))
      const others = rest.filter((s) => !t.isImportDeclaration(s))
      const before = body.map((s) => s)
      ast.program.body = [...imports, ...templates, ...others]
      return ast.program.body.some((s, i) => s !== before[i])
    },
  },
  {
    ref: 'loc de dev (A-7) medido na entrada',
    why: 'o snapshot supõe `Page` num arquivo próprio (`Page.tsx:2:5`); aqui `<Card>` de `Page` está na linha 23',
    side: 'expected',
    apply: (ast) => replaceStrings(ast, { 'Page.tsx:2:5': 'Page.tsx:23:5' }),
  },
]

describe('compiled/ (parte 2b)', () => {
  test('03-use-fetch', async () => {
    const actual = compile(useFetchInput(), { filename: 'useFetch.ts', dev: true }).code
    await compareSnapshot(actual, spec('compiled/03-use-fetch.js'), ALLOW_03)
  })

  test('06-slots-card', async () => {
    const actual = compile(SLOTS_INPUT, { filename: 'Page.tsx', dev: true }).code
    await compareSnapshot(actual, spec('compiled/06-slots-card.js'), ALLOW_06)
  })
})
