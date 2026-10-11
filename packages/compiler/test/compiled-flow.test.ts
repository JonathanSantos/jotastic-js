// Snapshots da parte 2a (18 §7–§9): docs/spec/compiled/02-todos.js (a partir de examples/02-todos.tsx) e
// docs/spec/compiled/04-user-page.js (a partir do código do comentário do próprio snapshot), normalizados como em
// compiled.test.ts (ver snapshot.ts). Cada divergência conhecida está na allowlist, citando a pendência.
import { describe, test } from 'vitest'
import * as t from '@babel/types'
import { compile, CompileError } from '../src/index'
import { spec } from './helpers'
import { compareSnapshot, replaceStrings, traverse, type AllowEntry } from './snapshot'

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

/** `signal(` → `state(` nos declaradores `names` (A-1). */
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
  const imp = ast.program.body.find(
    (s): s is t.ImportDeclaration => t.isImportDeclaration(s) && s.source.value === 'jotastic/runtime',
  )!
  let used = false
  traverse(ast, {
    CallExpression(p) {
      if (t.isIdentifier(p.node.callee, { name: 'signal' })) used = true
    },
  })
  if (!used) imp.specifiers = imp.specifiers.filter((s) => s.local.name !== 'signal')
  if (!imp.specifiers.some((s) => s.local.name === 'state'))
    imp.specifiers.push(t.importSpecifier(t.identifier('state'), t.identifier('state')))
  return changed === names.length
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
    ref: 'K-1(c) / 18 §14 (imports de `jotastic/runtime` gerados por uso)',
    why: 'compiled/02 importa `bool` sem usá-lo',
    side: 'expected',
    apply: (ast) => {
      const imp = ast.program.body[0] as t.ImportDeclaration
      const before = imp.specifiers.length
      imp.specifiers = imp.specifiers.filter((s) => s.local.name !== 'bool')
      return imp.specifiers.length !== before
    },
  },
  {
    ref: 'A-1 (`signal` vs `state`)',
    why: '`filter = f` (f é parâmetro, não "provavelmente primitivo"): o analyzer segue 18 §3 e emite `state`; compiled/02 usa `signal`',
    side: 'expected',
    apply: (ast) => signalToState(ast, ['filter']),
  },
  {
    ref: '18 §7 (`{a ? X : Y}` → `[() => !!a, …]`)',
    why: 'compiled/02 escreve `() => todo.editing`; o compilador segue a tabela de 18 §7 (`!!` quando a condição não é sintaticamente booleana, como `!!user.error` em compiled/04)',
    side: 'expected',
    apply: (ast) => {
      let changed = false
      traverse(ast, {
        ArrowFunctionExpression(p) {
          const b = p.node.body
          if (!t.isMemberExpression(b) || !t.isIdentifier(b.property, { name: 'editing' })) return
          if (!p.parentPath.isArrayExpression() || p.key !== 0) return
          p.node.body = t.unaryExpression('!', t.unaryExpression('!', b))
          changed = true
        },
      })
      return changed
    },
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
    ref: 'A-1 (`signal` vs `state`)',
    why: '`tab = t` (t é parâmetro): o analyzer segue 18 §3 e emite `state`; compiled/04 usa `signal`',
    side: 'expected',
    apply: (ast) => signalToState(ast, ['tab']),
  },
  {
    ref: '18 §11 (`useX(a, b)` → um getter por argumento escrito)',
    why: 'compiled/04 passa `() => undefined` para o `opts` omitido de `useFetch`; o compilador não conhece a aridade de uma função importada',
    side: 'expected',
    apply: (ast) => {
      let changed = false
      traverse(ast, {
        CallExpression(p) {
          if (!t.isIdentifier(p.node.callee, { name: 'useFetch' }) || p.node.arguments.length !== 2) return
          p.node.arguments.pop()
          changed = true
        },
      })
      return changed
    },
  },
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

/** O 04 depende de `use*` (parte 2b): enquanto `useFetch(…)` lançar `not-implemented`, o teste fica pendente. */
function compiles(code: string, filename: string): boolean {
  try {
    compile(code, { filename, dev: true })
    return true
  } catch (e) {
    if (e instanceof CompileError && e.id === 'not-implemented') return false
    throw e
  }
}

describe('compiled/ (snapshots de referência, parte 2a)', () => {
  test('02-todos', async () => {
    const actual = compile(spec('examples/02-todos.tsx'), { filename: 'Todos.tsx', dev: true }).code
    await compareSnapshot(actual, spec('compiled/02-todos.js'), ALLOW_02)
  })

  const ready04 = compiles(USER_PAGE_INPUT, 'UserPage.tsx')
  ;(ready04 ? test : test.todo)('04-user-page (precisa de `use*`, parte 2b)', async () => {
    const actual = compile(USER_PAGE_INPUT, { filename: 'UserPage.tsx', dev: true }).code
    await compareSnapshot(actual, spec('compiled/04-user-page.js'), ALLOW_04)
  })
})
