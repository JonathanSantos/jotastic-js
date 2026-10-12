// HMR (dev, M6; docs/spec/13-tooling.md §HMR, D65). API interna, subpath `jotastic/runtime/hmr`, prefixo `__`: só o
// código que o compilador emite com `hmr` ligado chama `__hmrComponents` (no rodapé `if (import.meta.hot) {…}`).
//
// - Cada componente exportado de um módulo vira uma "família" (`arquivo#export`). Componente registrado monta por
//   aqui: owner próprio como em `component()`, mas devolve um accessor `() => value.get()` em vez dos nós; o `insert`
//   do pai vira efeito sobre ele. A instância lembra `{ parent, props, dev, owner }`.
// - Reexecução do módulo (hot update) registra as funções novas: as instâncias vivas são remontadas no lugar
//   (dispose do owner antigo, `Comp(props)` num owner novo sob o mesmo pai, `value.set(nós novos)`: o `Slot` do pai
//   troca só esse intervalo; vizinhos ficam).
// - `preserveState`: cada `let` (signal/state) criado direto no owner da instância com `dev.hash` é lembrado por nome;
//   ao remontar, o signal novo com o mesmo nome E o mesmo hash do inicializador nasce com o valor antigo. O console
//   lista o que foi preservado e o que resetou. `reset: true` (`// @refresh reset`) força reset.
// - Em prod (`DEV = false`) nada disso roda: `__hmrComponents` volta na primeira linha e os hooks nunca são ligados.

import { DEV } from './env'
import { setHmrComponentHook, type Rendered } from './flow'
import {
  createOwner,
  dispose,
  getOwner,
  handleError,
  registerDisposable,
  runWithOwner,
  type DevMeta,
  type Owner,
} from './owner'
import { batch, flush, setHmrSignalHook, signal, untrack, type Signal } from './reactive'

type AnyComponent = (props: any) => Rendered | Promise<never>

interface Family {
  readonly id: string
  readonly name: string
  Comp: AnyComponent
  readonly instances: Set<Instance>
}

interface Kept {
  hash: string
  signal: Signal<unknown>
}

interface Instance {
  readonly family: Family
  readonly props: unknown
  readonly dev: DevMeta | undefined
  readonly parent: Owner | null
  owner: Owner | null
  readonly value: Signal<Rendered>
  /** `let`s da última montagem (por nome). */
  signals: Map<string, Kept>
}

interface Capture {
  owner: Owner
  signals: Map<string, Kept>
  /** null: sem preserveState (tudo nasce com o inicializador). */
  restore: Map<string, { hash: string; value: unknown }> | null
  preserved: Set<string>
  reset: Set<string>
}

export interface HmrOptions {
  /** Preserva `let`s cujo inicializador não mudou (plugin Vite: `hmr: { preserveState: true }`). */
  preserveState?: boolean
  /** `// @refresh reset` no topo do arquivo: nada é preservado. */
  reset?: boolean
}

const families = new Map<string, Family>()
let byComp = new WeakMap<AnyComponent, Family>()
let capture: Capture | null = null
let installed = false

function isFragment(v: unknown): v is DocumentFragment {
  return typeof v === 'object' && v !== null && (v as Node).nodeType === 11
}

function signalHook(s: Signal<unknown>, dev: DevMeta): { value: unknown } | undefined {
  const c = capture
  // só `let` do corpo do componente (não de branches/continuações/componentes filhos)
  if (!c || getOwner() !== c.owner || !dev.name || dev.hash === undefined) return undefined
  c.signals.set(dev.name, { hash: dev.hash, signal: s })
  if (!c.restore) return undefined
  const old = c.restore.get(dev.name)
  if (old && old.hash === dev.hash) {
    c.preserved.add(dev.name)
    return { value: old.value }
  }
  c.reset.add(dev.name)
  return undefined
}

/** Roda a implementação atual da família num owner novo sob `inst.parent`. */
function render(inst: Instance, restore: Capture['restore'], report?: { preserved: Set<string>; reset: Set<string> }) {
  const f = inst.family
  const owner = createOwner('component', inst.parent, { name: inst.dev?.name ?? f.Comp.name, loc: inst.dev?.loc })
  inst.owner = owner
  const prev = capture
  const c: Capture = (capture = { owner, signals: new Map(), restore, preserved: new Set(), reset: new Set() })
  let out: Rendered
  try {
    out = runWithOwner(owner, () => untrack(() => f.Comp(inst.props))) as Rendered
  } catch (e) {
    try {
      handleError(owner, e, 'setup')
    } finally {
      dispose(owner)
    }
    out = null
  } finally {
    capture = prev
  }
  inst.signals = c.signals
  if (report) {
    for (const n of c.preserved) report.preserved.add(n)
    for (const n of c.reset) report.reset.add(n)
  }
  // fragmento esvazia ao ser inserido: guarda os filhos (reaplicar o Slot não perde os nós)
  return isFragment(out) ? Array.from(out.childNodes) : out
}

function mount(f: Family, props: unknown, dev: DevMeta | undefined): Rendered {
  const value = signal<Rendered>(null)
  const inst: Instance = { family: f, props, dev, parent: getOwner(), owner: null, value, signals: new Map() }
  f.instances.add(inst)
  // a instância vive enquanto o pai (o owner do componente é trocado a cada remontagem)
  if (inst.parent) registerDisposable(inst.parent, () => f.instances.delete(inst))
  value.set(render(inst, null))
  return () => value.get()
}

function componentHook(Comp: AnyComponent, props: unknown, dev?: DevMeta): Rendered | undefined {
  const f = byComp.get(Comp)
  return f ? mount(f, props, dev) : undefined
}

function remount(inst: Instance, preserve: boolean, report: { preserved: Set<string>; reset: Set<string> }): void {
  if (!inst.family.instances.has(inst) || inst.parent?.disposed) return
  const restore = preserve
    ? new Map([...inst.signals].map(([n, k]) => [n, { hash: k.hash, value: k.signal.peek() }]))
    : null
  if (inst.owner) dispose(inst.owner)
  inst.value.set(render(inst, restore, report))
}

function depth(inst: Instance): number {
  return inst.parent ? inst.parent.depth : -1
}

/**
 * Interno (dev, HMR): registra os componentes exportados de `file` (`{ Nome: Comp }`). Na primeira execução só
 * registra; numa reexecução (hot update) troca a implementação e remonta as instâncias vivas, de fora para dentro.
 */
export function __hmrComponents<T extends Record<string, unknown>>(
  file: string,
  comps: T,
  options: HmrOptions = {},
): T {
  if (!DEV) return comps
  if (!installed) {
    installed = true
    setHmrComponentHook(componentHook)
    setHmrSignalHook(signalHook)
  }
  const preserve = !!options.preserveState && !options.reset
  const pending: Array<[Family, Instance[]]> = []
  for (const [name, Comp] of Object.entries(comps)) {
    if (typeof Comp !== 'function') continue
    const id = `${file}#${name}`
    const f = families.get(id)
    if (!f) {
      const nf: Family = { id, name, Comp: Comp as AnyComponent, instances: new Set() }
      families.set(id, nf)
      byComp.set(nf.Comp, nf)
      continue
    }
    if (f.Comp === Comp) continue
    f.Comp = Comp as AnyComponent
    // a função antiga continua apontando para a família: importadores não reexecutados montam a versão nova
    byComp.set(f.Comp, f)
    pending.push([f, [...f.instances]])
  }
  if (!pending.length) return comps
  const all = pending.flatMap(([f, list]) => list.map((inst) => [f, inst] as const))
  all.sort((a, b) => depth(a[1]) - depth(b[1]))
  const reports = new Map<Family, { preserved: Set<string>; reset: Set<string>; count: number }>()
  batch(() => {
    for (const [f, inst] of all) {
      let r = reports.get(f)
      if (!r) reports.set(f, (r = { preserved: new Set(), reset: new Set(), count: 0 }))
      if (!inst.family.instances.has(inst) || inst.parent?.disposed) continue
      r.count++
      remount(inst, preserve, r)
    }
  })
  flush()
  for (const [f, r] of reports) {
    if (!r.count) continue
    const what = !preserve
      ? options.reset
        ? 'estado local resetado (@refresh reset)'
        : 'estado local resetado'
      : `preservado: ${[...r.preserved].join(', ') || '—'}; resetado: ${[...r.reset].join(', ') || '—'}`
    console.info(`[jotastic] HMR ${f.name} (${r.count}×): ${what}`)
  }
  return comps
}

/** Interno (testes): esquece as famílias registradas e desliga os hooks. */
export function __hmrResetRegistry(): void {
  families.clear()
  byComp = new WeakMap()
  installed = false
  setHmrComponentHook(null)
  setHmrSignalHook(null)
}
