#!/usr/bin/env node
/**
 * Benchmark local no formato do js-framework-benchmark (keyed): Jotastic vs Solid (19 §Tamanho e benchmark).
 *
 * Uso: node run.mjs [--runs 10] [--rounds 3] [--warmup 5] [--save-baseline] [--only create1k,select] [--headed]
 *
 * Os apps precisam estar buildados em dist/ (`npm run build`, feito pelo `prebench`). Cada amostra abre a página do
 * zero, faz o setup da operação (com warmup), e mede do clique até a próxima macrotarefa + layout forçado
 * (script + microtarefas + estilo + layout; pintura fica de fora). Mediana de N amostras, intercalando os dois frameworks.
 *
 * Critério (G-6): numa execução, uma operação falha se o Jotastic for > Solid + 10% **e** > Solid + 2 ms (mesma
 * execução). São `--rounds` execuções completas (padrão 3); a operação falha se falhar em pelo menos 2 de 3
 * (maioria: `floor(rounds / 2) + 1`). Com `--rounds 1` vale a execução única.
 *
 * Saída: tabela no console (razão por execução + veredito), results/latest.json. Com --save-baseline grava
 * results/solid-baseline.json (mediana de todas as amostras do Solid). Sai com código 1 se alguma operação falhar.
 */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, 'dist')
const resultsDir = join(here, 'results')
/** Margem relativa e absoluta: falha só se passar das duas (G-6). */
const THRESHOLD = 0.1
const THRESHOLD_MS = 2

// ---------- argumentos ----------
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const RUNS = Number(opt('runs', 10))
const ROUNDS = Math.max(1, Number(opt('rounds', 3)))
/** Execuções em que a operação precisa falhar para falhar no total (2 de 3). */
const NEEDED = Math.floor(ROUNDS / 2) + 1
const WARMUP = Number(opt('warmup', 5))
const only = opt('only', '').split(',').filter(Boolean)

// ---------- operações ----------
// setup: roda antes da medição (não medido). measure: seletor clicado. check: validação do DOM depois.
const rowCount = () => document.querySelectorAll('tbody > tr').length
const OPS = [
  {
    id: 'create1k',
    name: 'create rows (1k)',
    setup: async (p) => {
      for (let i = 0; i < WARMUP; i++) {
        await click(p, '#run')
        await click(p, '#clear')
      }
    },
    measure: '#run',
    expect: 1000,
  },
  {
    id: 'replace1k',
    name: 'replace all rows (1k)',
    setup: async (p) => {
      for (let i = 0; i < WARMUP; i++) await click(p, '#run')
    },
    measure: '#run',
    expect: 1000,
  },
  {
    id: 'update10th',
    name: 'partial update (every 10th of 1k)',
    setup: async (p) => {
      await click(p, '#run')
      for (let i = 0; i < WARMUP; i++) await click(p, '#update')
    },
    measure: '#update',
    expect: 1000,
    check: () => document.querySelector('tbody > tr:nth-child(1) td:nth-child(2) a').textContent.endsWith(' !!!'),
  },
  {
    id: 'select',
    name: 'select row',
    setup: async (p) => {
      await click(p, '#run')
      for (let i = 0; i < WARMUP; i++) await click(p, `tbody > tr:nth-child(${i + 5}) td:nth-child(2) a`)
    },
    measure: 'tbody > tr:nth-child(2) td:nth-child(2) a',
    expect: 1000,
    check: () =>
      document.querySelector('tbody > tr:nth-child(2)').className === 'danger' &&
      document.querySelectorAll('tr.danger').length === 1,
  },
  {
    id: 'swap',
    name: 'swap rows',
    setup: async (p) => {
      await click(p, '#run')
      for (let i = 0; i < WARMUP; i++) await click(p, '#swaprows')
    },
    measure: '#swaprows',
    expect: 1000,
    before: () => document.querySelector('tbody > tr:nth-child(999) td').textContent,
    check: (before) => document.querySelector('tbody > tr:nth-child(2) td').textContent === before,
  },
  {
    id: 'remove',
    name: 'remove row',
    setup: async (p) => {
      await click(p, '#run')
      for (let i = 0; i < WARMUP; i++) await click(p, `tbody > tr:nth-child(${WARMUP - i + 4}) td:nth-child(3) a`)
    },
    measure: 'tbody > tr:nth-child(4) td:nth-child(3) a',
    expect: 1000 - WARMUP - 1,
  },
  {
    id: 'create10k',
    name: 'create many rows (10k)',
    setup: async (p) => {
      for (let i = 0; i < WARMUP; i++) {
        await click(p, '#run')
        await click(p, '#clear')
      }
    },
    measure: '#runlots',
    expect: 10000,
  },
  {
    id: 'append1k',
    name: 'append rows (1k to 1k)',
    setup: async (p) => {
      for (let i = 0; i < WARMUP; i++) {
        await click(p, '#run')
        await click(p, '#clear')
      }
      await click(p, '#run')
    },
    measure: '#add',
    expect: 2000,
  },
  {
    id: 'clear',
    name: 'clear rows (1k)',
    setup: async (p) => {
      for (let i = 0; i < WARMUP; i++) {
        await click(p, '#run')
        await click(p, '#clear')
      }
      await click(p, '#run')
    },
    measure: '#clear',
    expect: 0,
  },
].filter((op) => !only.length || only.includes(op.id))

// Clica e espera o frame seguinte; devolve o tempo em ms (medido dentro da página).
function click(page, selector) {
  return page.evaluate(
    (sel) =>
      new Promise((resolve, reject) => {
        const el = document.querySelector(sel)
        if (!el) return reject(new Error(`não achei ${sel}`))
        const t0 = performance.now()
        el.click()
        // próxima macrotarefa: todo flush em microtarefa já rodou; offsetHeight força estilo + layout.
        // (rAF + setTimeout esperaria o vsync e quantizaria tudo em ~16 ms.)
        const ch = new MessageChannel()
        ch.port1.onmessage = () => {
          void document.body.offsetHeight
          resolve(performance.now() - t0)
        }
        ch.port2.postMessage(0)
      }),
    selector,
  )
}

// ---------- servidor estático ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    let file = join(dist, path)
    if (file.endsWith('/')) file += 'index.html'
    try {
      const body = await readFile(file)
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        // isolamento cross-origin: performance.now() com resolução de µs em vez de 100 µs
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'require-corp',
      })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

// ---------- execução ----------
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const r2 = (n) => Math.round(n * 100) / 100

async function sample(browser, base, fw, op) {
  const page = await browser.newPage()
  try {
    page.on('pageerror', (e) => console.error(`[${fw}] erro na página:`, e.message))
    await page.goto(`${base}/${fw}/`)
    await page.waitForSelector('#run')
    await op.setup(page)
    const before = op.before ? await page.evaluate(op.before) : undefined
    const ms = await click(page, op.measure)
    const count = await page.evaluate(rowCount)
    if (count !== op.expect) throw new Error(`${fw}/${op.id}: ${count} linhas, esperava ${op.expect}`)
    if (op.check && !(await page.evaluate(op.check, before))) throw new Error(`${fw}/${op.id}: DOM incorreto`)
    return ms
  } finally {
    await page.close()
  }
}

async function main() {
  for (const fw of ['jotastic', 'solid'])
    if (!existsSync(join(dist, fw, 'index.html'))) {
      console.error(`dist/${fw} não existe: rode \`npm run build -w bench\``)
      process.exit(2)
    }

  const server = await serve()
  const base = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: !flag('headed'),
      args: ['--js-flags=--expose-gc', '--disable-background-timer-throttling'],
    })
  } catch (e) {
    console.error('Não consegui abrir o Chrome do sistema (channel: chrome).', e.message)
    server.close()
    process.exit(2)
  }

  const browserVersion = browser.version()
  /** `rounds[r][op.id]` = { jotastic, solid, ratio, failed, samples } da execução r. */
  const rounds = []
  try {
    for (let r = 0; r < ROUNDS; r++) {
      if (ROUNDS > 1) process.stdout.write(`execução ${r + 1}/${ROUNDS}\n`)
      const round = {}
      for (const op of OPS) {
        const samples = { jotastic: [], solid: [] }
        for (let i = 0; i < RUNS; i++) {
          // alterna a ordem para não favorecer quem roda primeiro
          const order = i % 2 ? ['solid', 'jotastic'] : ['jotastic', 'solid']
          for (const fw of order) samples[fw].push(await sample(browser, base, fw, op))
        }
        const j = median(samples.jotastic)
        const s = median(samples.solid)
        round[op.id] = {
          jotastic: r2(j),
          solid: r2(s),
          ratio: r2(j / s),
          failed: j > s * (1 + THRESHOLD) && j - s > THRESHOLD_MS,
          samples: { jotastic: samples.jotastic.map(r2), solid: samples.solid.map(r2) },
        }
        process.stdout.write(`  ${op.name}: jotastic ${r2(j)} ms · solid ${r2(s)} ms\n`)
      }
      rounds.push(round)
    }
  } finally {
    await browser.close()
    server.close()
  }

  const meta = {
    date: new Date().toISOString(),
    browser: `chrome ${browserVersion}`,
    cpu: os.cpus()[0]?.model,
    runs: RUNS,
    rounds: ROUNDS,
    warmup: WARMUP,
    metric: 'mediana ms, clique → próxima macrotarefa + layout forçado (sem pintura)',
    criterion: `falha se > solid + ${THRESHOLD * 100}% e > solid + ${THRESHOLD_MS} ms em ${NEEDED} de ${ROUNDS} execuções`,
  }

  // Resumo por operação: medianas de todas as amostras, razão e veredito por execução.
  const results = {}
  for (const op of OPS) {
    const per = rounds.map((round) => round[op.id])
    const all = (fw) => per.flatMap((x) => x.samples[fw])
    const j = median(all('jotastic'))
    const s = median(all('solid'))
    const fails = per.filter((x) => x.failed).length
    results[op.id] = {
      name: op.name,
      jotastic: r2(j),
      solid: r2(s),
      ratio: r2(j / s),
      rounds: per.map(({ samples, ...x }) => x),
      fails,
      failed: fails >= NEEDED,
      samples: { jotastic: all('jotastic'), solid: all('solid') },
    }
  }

  // tabela
  let baseline = null
  try {
    baseline = JSON.parse(await readFile(join(resultsDir, 'solid-baseline.json'), 'utf8'))
  } catch {}
  const rows = Object.entries(results).map(([id, r]) => ({
    operação: r.name,
    'jotastic (ms)': r.jotastic,
    'solid (ms)': r.solid,
    'jotastic/solid': `${r.ratio.toFixed(2)}x`,
    ...(ROUNDS > 1 ? { execuções: r.rounds.map((x) => `${x.ratio.toFixed(2)}x${x.failed ? '✗' : ''}`).join(' ') } : {}),
    ...(baseline ? { 'solid salvo (ms)': baseline.results?.[id]?.solid ?? '-' } : {}),
    status: r.failed ? 'FALHA' : 'ok',
  }))
  console.log()
  console.table(rows)

  await mkdir(resultsDir, { recursive: true })
  await writeFile(join(resultsDir, 'latest.json'), JSON.stringify({ meta, results }, null, 2) + '\n')
  if (flag('save-baseline')) {
    const solidOnly = Object.fromEntries(
      Object.entries(results).map(([id, r]) => [id, { name: r.name, solid: r.solid, samples: r.samples.solid }]),
    )
    await writeFile(
      join(resultsDir, 'solid-baseline.json'),
      JSON.stringify({ meta, results: solidOnly }, null, 2) + '\n',
    )
    console.log('baseline do Solid gravado em results/solid-baseline.json')
  }

  const failed = rows.filter((r) => r.status === 'FALHA')
  if (failed.length) {
    console.error(
      `\n${failed.length} operação(ões) reprovada(s) (${meta.criterion}): ${failed.map((r) => r.operação).join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`\nok: nenhuma operação reprovada (${meta.criterion})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
