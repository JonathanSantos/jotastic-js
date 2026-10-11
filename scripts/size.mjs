#!/usr/bin/env node
/**
 * Tamanho brotli do JS gerado por um build do Vite (19-plano-de-testes.md §Tamanho).
 * Uso: node scripts/size.mjs <dist> <limite-em-bytes> [nome]
 * Imprime o tamanho de cada .js e o total; sai com código 1 se o total passar do limite.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

const [distArg, limitArg, name = 'bundle'] = process.argv.slice(2)
if (!distArg || !limitArg) {
  console.error('uso: node scripts/size.mjs <dist> <limite-em-bytes> [nome]')
  process.exit(2)
}
const dist = resolve(distArg)
const limit = Number(limitArg)

function* jsFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* jsFiles(path)
    else if (/\.m?js$/.test(entry)) yield path
  }
}

const kb = (n) => `${(n / 1024).toFixed(2)} KB`
let total = 0
for (const file of jsFiles(dist)) {
  const raw = readFileSync(file)
  const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
  total += br
  console.log(`  ${relative(dist, file)}  ${kb(raw.length)} → brotli ${kb(br)} (${br} B)`)
}
const ok = total <= limit
console.log(`${ok ? '✓' : '✖'} ${name}: ${kb(total)} brotli (${total} B), limite ${kb(limit)}`)
if (!ok) process.exit(1)
