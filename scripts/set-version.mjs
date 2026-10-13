#!/usr/bin/env node
/**
 * Aplica uma versão a todos os pacotes publicáveis de `packages/` (release por tag, .github/workflows/release.yml):
 * `version`, dependências internas (exatas; peers com `^`) e o template do `create-jotastic` (`^`).
 *
 *   node scripts/set-version.mjs 0.1.0
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`versão inválida: ${version ?? '(vazia)'} (ex.: 0.1.0, 0.2.0-beta.1)`)
  process.exit(1)
}

const root = join(import.meta.dirname, '..', 'packages')
const files = readdirSync(root)
  .map((d) => join(root, d, 'package.json'))
  .filter(existsSync)
const read = (f) => JSON.parse(readFileSync(f, 'utf8'))
const write = (f, pkg) => writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n')
const names = new Set(files.map((f) => read(f).name))

function pin(pkg, field, range) {
  for (const name of Object.keys(pkg[field] ?? {})) if (names.has(name)) pkg[field][name] = range
}

for (const f of files) {
  const pkg = read(f)
  pkg.version = version
  pin(pkg, 'dependencies', version)
  pin(pkg, 'devDependencies', version)
  pin(pkg, 'peerDependencies', `^${version}`)
  write(f, pkg)
  console.log(`${pkg.name}@${version}`)
}

const template = join(root, 'create-jotastic', 'template', 'package.json')
const app = read(template)
pin(app, 'dependencies', `^${version}`)
pin(app, 'devDependencies', `^${version}`)
write(template, app)
