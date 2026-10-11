/**
 * Passo 8: sourcemaps verificados em stack trace. O compilado roda via `node:vm` com um `filename` próprio (o stack
 * mostra linha/coluna do JS gerado, sem o remapeamento do Vitest) e a posição é traduzida pelo `SourceMap` do Node.
 */
import { SourceMap } from 'node:module'
import { runInThisContext } from 'node:vm'
import { describe, expect, test } from 'vitest'
import * as runtime from 'jotastic/runtime'
import { compile } from '../src/index'

const SOURCE = `import { onMount } from 'jotastic'

type Props = { label: string }

export function Boom({ label }: Props) {
  let count: number = 0
  onMount(() => {
    if (label === 'mount') explode('mount')
  })
  return (
    <button
      onClick={() => {
        count++
        throw new Error('boom ' + count)
      }}
    >
      {label}: {count}
    </button>
  )
}

function explode(why: string): never {
  throw new Error(why)
}
`
const FILE = '/app/src/Boom.tsx'
const GENERATED = 'jotastic-sourcemap-test://Boom.compiled.js'

/** Linha/coluna (1-based) da 1ª ocorrência de `needle` no fonte. */
function at(code: string, needle: string): { line: number; column: number } {
  const i = code.indexOf(needle)
  const before = code.slice(0, i).split('\n')
  return { line: before.length, column: before[before.length - 1]!.length + 1 }
}

/**
 * Avalia o compilado como script: `import {…} from 'jotastic/runtime'` vira desestruturação e `export ` vira espaços,
 * ambos sem mudar o número de linhas nem as colunas das linhas seguintes.
 */
function evaluate(code: string): Record<string, (props: any) => runtime.Rendered> {
  const lines = code.split('\n')
  const exported: string[] = []
  const body = lines.map((l) => {
    const imp = /^import \{([^}]*)\} from '(jotastic\/runtime|jotastic)';?$/.exec(l)
    if (imp) return `const {${imp[1]!.replace(/ as /g, ': ')}} = __rt;`
    const exp = /^export (function|const) ([\w$]+)/.exec(l)
    if (exp) {
      exported.push(exp[2]!)
      return '       ' + l.slice(7)
    }
    return l
  })
  // o wrapper fica na mesma linha 1 (coluna da linha 1 muda; nenhuma linha muda de número)
  const src = `(function (__rt) {${body.join('\n')}\nreturn { ${exported.join(', ')} } })`
  const fn = runInThisContext(src, { filename: GENERATED }) as (rt: unknown) => ReturnType<typeof evaluate>
  return fn({ ...runtime, onMount: runtime.onMount })
}

/** 1º frame do stack que está no arquivo gerado → posição (1-based). */
function generatedFrame(err: Error): { line: number; column: number } {
  const re = new RegExp(`${GENERATED.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}:(\\d+):(\\d+)`)
  const m = re.exec(err.stack ?? '')
  if (!m) throw new Error(`frame do compilado ausente no stack:\n${err.stack}`)
  return { line: Number(m[1]), column: Number(m[2]) }
}

function original(map: unknown, pos: { line: number; column: number }) {
  const sm = new SourceMap(map as ConstructorParameters<typeof SourceMap>[0])
  const e = sm.findEntry(pos.line - 1, pos.column - 1) as {
    originalSource?: string
    originalLine?: number
    originalColumn?: number
  }
  return { source: e.originalSource, line: e.originalLine! + 1, column: e.originalColumn! + 1 }
}

describe('sourcemaps em stack trace', () => {
  const { code, map } = compile(SOURCE, { filename: FILE })

  test('map aponta para o .tsx com o conteúdo original', () => {
    expect(map!.sources).toEqual([FILE])
    expect(map!.sourcesContent).toEqual([SOURCE])
  })

  test('erro lançado num handler mapeia para a linha/coluna do throw no .tsx', () => {
    const { Boom } = evaluate(code)
    const errors: unknown[] = []
    const target = document.createElement('div')
    const unmount = runtime.createRoot(target, () => runtime.component(Boom!, { label: 'x' }), {
      onError: (e) => errors.push(e),
    })
    target.querySelector('button')!.click()
    unmount()
    expect(errors).toHaveLength(1)
    const err = errors[0] as Error
    expect(err.message).toBe('boom 1')
    const pos = original(map, generatedFrame(err))
    expect(pos.source).toBe(FILE)
    expect({ line: pos.line, column: pos.column }).toEqual(at(SOURCE, "new Error('boom ' + count)"))
  })

  test('erro em função comum chamada no onMount mapeia para o .tsx (inclusive o frame do chamador)', () => {
    const { Boom } = evaluate(code)
    const errors: unknown[] = []
    const target = document.createElement('div')
    const unmount = runtime.createRoot(target, () => runtime.component(Boom!, { label: 'mount' }), {
      onError: (e) => errors.push(e),
    })
    unmount()
    expect(errors).toHaveLength(1)
    const err = errors[0] as Error
    expect(original(map, generatedFrame(err))).toMatchObject(at(SOURCE, 'new Error(why)'))
    // 2º frame: a chamada `explode('mount')` dentro do onMount
    const frames = [...(err.stack ?? '').matchAll(/Boom\.compiled\.js:(\d+):(\d+)/g)]
    expect(frames.length).toBeGreaterThanOrEqual(2)
    const caller = original(map, { line: Number(frames[1]![1]), column: Number(frames[1]![2]) })
    expect({ line: caller.line, column: caller.column }).toEqual(at(SOURCE, "explode('mount')"))
  })
})
