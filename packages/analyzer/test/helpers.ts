import { parse } from '@babel/parser'
import { analyze } from '../src/index'
import type { Analysis, BindingKind, ReactiveBody } from '../src/index'

export function run(code: string, filename = 'Test.tsx', dev = true): Analysis {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  return analyze(ast, { filename, isTSX: filename.endsWith('.tsx'), dev, code })
}

export function body(a: Analysis, name: string): ReactiveBody {
  const b = a.bodies.find((x) => x.name === name)
  if (!b) throw new Error(`corpo ${name} não encontrado: ${a.bodies.map((x) => x.name).join(', ')}`)
  return b
}

export function kinds(b: ReactiveBody): Record<string, BindingKind> {
  return Object.fromEntries([...b.bindings].map(([k, v]) => [k, v.kind]))
}
