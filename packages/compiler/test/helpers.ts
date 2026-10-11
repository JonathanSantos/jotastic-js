import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'
import { compile } from '../src/index'

// `import.meta.url` é string: o `URL` global é o do happy-dom, que não aceita `file:`
const here = dirname(fileURLToPath(import.meta.url))
export const root = resolve(here, '../../..') + '/'
export const tmpDir = resolve(here, '.tmp') + '/'

/** Lê um arquivo de `docs/spec` (nunca copiado para o pacote). */
export function spec(path: string): string {
  return readFileSync(`${root}docs/spec/${path}`, 'utf8')
}

/** Formata como o resto do repositório (prettier sem ponto e vírgula, aspas simples, 120 colunas). */
export function pretty(code: string): Promise<string> {
  return format(code, { parser: 'babel', semi: false, singleQuote: true, printWidth: 120 })
}

let n = 0
/**
 * Compila `code` e importa o resultado: o JS vai para `test/.tmp/` e é carregado por `import()` dinâmico, então os
 * imports (`jotastic/runtime`, `jotastic`) passam pelos aliases e mocks do Vitest.
 */
export async function load<T = Record<string, unknown>>(code: string, filename: string): Promise<T> {
  const out = compile(code, { filename }).code
  mkdirSync(tmpDir, { recursive: true })
  const file = `${tmpDir}${filename.replace(/\W/g, '_')}-${process.pid}-${n++}.js`
  writeFileSync(file, out)
  try {
    return (await import(/* @vite-ignore */ file)) as T
  } finally {
    rmSync(file, { force: true })
  }
}
