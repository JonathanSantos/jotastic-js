// Snapshots da parte 2a (18 §7–§9): docs/spec/compiled/02-todos.js (a partir de examples/02-todos.tsx) e
// docs/spec/compiled/04-user-page.js (a partir do código do comentário do próprio snapshot), normalizados como em
// compiled.test.ts (ver snapshot.ts). Cada divergência conhecida está na allowlist, citando a pendência.
import { describe, test } from 'vitest'
import * as t from '@babel/types'
import { compile } from '../src/index'
import { spec } from './helpers'
import { compareSnapshot, replaceStrings, selectorToEquals, textToInsert, traverse, type AllowEntry } from './snapshot'

const dataJo: AllowEntry = {
  ref: '18 §14 (dev: `data-jo` no elemento raiz do template de cada componente)',
  why: 'compiled/02 e /04 foram escritos antes do `data-jo` (como compiled/01)',
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
}

/** `() => { const _el = _tN(); return _el }` → `() => _tN()` (o lado `actual` vira a forma curta do snapshot). */
const staticTemplateArrow: AllowEntry = {
  ref: '18 §5 (parte 1: elemento sem bindings vira `const _el = _tN(); return _el`)',
  why: 'os snapshots escrevem `() => _t1()` para template estático; o compilador gera o bloco. Equivalente; candidato a otimização em `place`',
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
}

const ALLOW_02: AllowEntry[] = [
  dataJo,
  staticTemplateArrow,
  {
    ref: '18 §5.1 (conteúdo único → `insert(el, read, null)`; `text` só com marcador) × compiled/02',
    why: 'compiled/02 emite `text(_sp.firstChild ?? _sp.appendChild(…), () => todo().text)` e `text(_b.appendChild(…), () => f())` para filho único; 18 §5.1 e compiled/01 (`<h2>{label}</h2>` → `insert`) mantêm `insert(el, read, null)`, e nem `todo.text` nem `f` (item) passam no critério de escalar de §5.1. Lacuna reportada',
    side: 'expected',
    apply: (ast) => textToInsert(ast, { singleChildOnly: true }),
  },
  {
    ref: 'D63 (`selector` na linha da lista) × compiled/02',
    why: 'compiled/02 foi atualizado com D58/D59/D60/D64, não com D63: `filter === f` na linha do filtro continua `===`; o compilador emite `const _sel0 = selector(() => filter.get())` e `_sel0(f())`',
    side: 'actual',
    apply: (ast) => selectorToEquals(ast),
  },
  {
    ref: 'loc 1-based (A-7) medido no exemplo',
    why: '`visible.map(` está na linha 46 de examples/02-todos.tsx; compiled/02 diz 41',
    side: 'expected',
    apply: (ast) => replaceStrings(ast, { 'Todos.tsx:41:10': 'Todos.tsx:46:10' }),
  },
  {
    ref: '18 §14 (dev: `{ name, loc }` em `list`)',
    why: 'compiled/02 dá `{ loc }` ao primeiro `list` e nada ao segundo; o compilador emite `undefined, { loc }` em todos (sem `key`)',
    side: 'expected',
    apply: (ast) => {
      let changed = false
      traverse(ast, {
        CallExpression(p) {
          if (!t.isIdentifier(p.node.callee, { name: 'list' }) || p.node.arguments.length !== 4) return
          p.node.arguments.push(
            t.identifier('undefined'),
            t.objectExpression([t.objectProperty(t.identifier('loc'), t.stringLiteral('Todos.tsx:60:12'))]),
          )
          changed = true
        },
      })
      return changed
    },
  },
]

/** Entrada do 04: o código do comentário de compiled/04 (spec 06 §Early return reativo), com os imports. */
export const USER_PAGE_INPUT = `import { useFetch } from './useFetch'
import { ErrorBox, Spinner, Tabs } from './components'

export function UserPage({ id }: { id: string }) {
  const user = useFetch<User>(\`/api/users/\${id}\`)
  if (user.error) return <ErrorBox message={user.error.message} />
  if (!user.data) return <Spinner />
  let tab = 'posts'
  const fullName = \`\${user.data.firstName} \${user.data.lastName}\`
  return <div><h1>{fullName}</h1><Tabs value={tab} onChange={t => (tab = t)} /></div>
}
`

const ALLOW_04: AllowEntry[] = [
  dataJo,
  {
    ref: 'loc 1-based (A-7) medido na entrada',
    why: 'o comentário de compiled/04 não traz imports nem indentação fixa; os `loc` medidos em USER_PAGE_INPUT diferem',
    side: 'expected',
    apply: (ast) =>
      replaceStrings(ast, {
        'UserPage.tsx:4:21': 'UserPage.tsx:6:26',
        'UserPage.tsx:5:22': 'UserPage.tsx:7:26',
        'UserPage.tsx:7:7': 'UserPage.tsx:8:7',
        'UserPage.tsx:8:9': 'UserPage.tsx:9:9',
        'UserPage.tsx:10:33': 'UserPage.tsx:10:34',
      }),
  },
]

describe('compiled/ (snapshots de referência, parte 2a)', () => {
  test('02-todos', async () => {
    const actual = compile(spec('examples/02-todos.tsx'), { filename: 'Todos.tsx', dev: true }).code
    await compareSnapshot(actual, spec('compiled/02-todos.js'), ALLOW_02)
  })

  test('04-user-page', async () => {
    const actual = compile(USER_PAGE_INPUT, { filename: 'UserPage.tsx', dev: true }).code
    await compareSnapshot(actual, spec('compiled/04-user-page.js'), ALLOW_04)
  })
})
