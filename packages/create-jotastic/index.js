#!/usr/bin/env node
// create-jotastic: `npm create jotastic@latest [dir]`. Sem dependências: só `node:*`.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const DEFAULT_DIR = 'jotastic-app'
const TEMPLATE = fileURLToPath(new URL('./template', import.meta.url))

/** Diretório inexistente ou vazio (um `.git` sozinho é aceito). */
function isEmptyDir(dir) {
  if (!existsSync(dir)) return true
  if (!statSync(dir).isDirectory()) return false
  return readdirSync(dir).every((f) => f === '.git')
}

/** Nome de pacote npm válido a partir do nome do diretório. */
export function toPackageName(dirName) {
  const name = dirName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]+/, '')
    .replace(/[^a-z0-9-~._]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return name || DEFAULT_DIR
}

function ask(question, fallback) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
    let answer
    rl.once('line', (line) => {
      answer = line.trim()
      rl.close()
    })
    // Fecha também em EOF/Ctrl+D: sem resposta, vale o padrão.
    rl.once('close', () => {
      if (answer === undefined) process.stdout.write('\n')
      done(answer || fallback)
    })
    rl.setPrompt(`${question} (${fallback}) `)
    rl.prompt()
  })
}

/** Copia o template para `targetDir` e ajusta o `name`. Lança se o diretório não estiver vazio. */
export function scaffold(targetDir) {
  const root = resolve(targetDir)
  if (!isEmptyDir(root)) throw new Error(`O diretório ${root} não está vazio.`)
  mkdirSync(root, { recursive: true })
  cpSync(TEMPLATE, root, { recursive: true })
  // npm não publica `.gitignore`; o template guarda como `_gitignore`.
  renameSync(join(root, '_gitignore'), join(root, '.gitignore'))
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.name = toPackageName(basename(root))
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  return { root, name: pkg.name }
}

async function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log('Uso: npm create jotastic@latest [diretório]')
    return 0
  }
  const arg = argv.find((a) => !a.startsWith('-'))
  const dir = arg ?? (await ask('Diretório do projeto:', DEFAULT_DIR))
  let result
  try {
    result = scaffold(dir)
  } catch (e) {
    console.error(`✖ ${e.message} Escolha outro diretório.`)
    return 1
  }
  const rel = relative(process.cwd(), result.root)
  console.log(`\n✔ Projeto ${result.name} criado em ${result.root}\n\nPróximos passos:\n`)
  if (rel) console.log(`  cd ${rel.includes(' ') ? JSON.stringify(rel) : rel}`)
  console.log('  npm install\n  npm run dev\n\nTambém: npm test · npm run lint · npm run build\n')
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2))
}
