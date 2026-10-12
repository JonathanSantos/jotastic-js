// Componentes e controle de fluxo: component, keyed, branches, list, children, slots, portal
// (ver docs/spec/contracts/runtime.d.ts §Componentes e controle de fluxo).
//
// Top-down: cada decisão (branch, key, lista) é um efeito de render criado ANTES do conteúdo que ela renderiza, então
// tem id menor que os bindings desse conteúdo. No flush a decisão roda primeiro; se descarta o owner do conteúdo, os
// bindings dele são pulados (owner `disposed`).

import { emitDevtools, emitDomWrite, devtoolsHook, warn } from './devtools'
import { collect, hasFunction, insertSlot, Slot } from './dom'
import { DEV } from './env'
import { createOwner, dispose, getOwner, handleError, onCleanup, runWithOwner, type DevMeta, type Owner } from './owner'
import { effect, isTracking, memo, signal, untrack, type Signal } from './reactive'

/** Resultado de um componente / de uma expressão de JSX (arrays recursivos, L-7). Funções são accessors (lazy). */
export type Rendered = Node | Rendered[] | string | number | boolean | null | undefined | (() => Rendered)

/** Roda `fn` sem rastrear dentro de `owner`. Erro → `handleError(owner, e, 'setup')` e null. */
function renderIn(owner: Owner, fn: () => Rendered): Rendered {
  try {
    return runWithOwner(owner, () => untrack(fn))
  } catch (e) {
    handleError(owner, e, 'setup')
    return null
  }
}

// ─── component ───────────────────────────────────────────────────────────────

/** Interno (dev, HMR): componente registrado por `__hmrComponents` monta por aqui (`undefined` → caminho normal). */
type AnyComponent = (props: any) => Rendered | Promise<never>
type HmrComponentHook = (Comp: AnyComponent, props: unknown, dev?: DevMeta) => Rendered | undefined
let hmrComponent: HmrComponentHook | null = null
export function setHmrComponentHook(hook: HmrComponentHook | null): void {
  hmrComponent = hook
}

/**
 * Invoca um componente dentro de um owner próprio (kind 'component', name = Comp.name em dev), sem rastrear.
 * Erro no setup → `handleError(owner, e, 'setup')`, descarta o owner e devolve null.
 */
export function component<P>(Comp: (props: P) => Rendered | Promise<never>, props: P, dev?: DevMeta): Rendered {
  if (DEV && hmrComponent) {
    const hot = hmrComponent(Comp as AnyComponent, props, dev)
    if (hot !== undefined) return hot
  }
  const owner = createOwner('component', getOwner(), DEV ? { name: dev?.name ?? Comp.name, loc: dev?.loc } : undefined)
  try {
    return runWithOwner(owner, () => untrack(() => Comp(props))) as Rendered
  } catch (e) {
    try {
      handleError(owner, e, 'setup')
    } finally {
      dispose(owner)
    }
    return null
  }
}

// ─── Decisões (branches / keyed) ─────────────────────────────────────────────

/**
 * Efeito de render que, a cada mudança de `select()`, descarta o owner anterior e roda `pick(v)` num owner novo
 * (kind 'branch'). Devolve o accessor estável que o `insert` lê.
 */
function decide<K>(select: { get(): K }, pick: (k: K) => (() => Rendered) | undefined): () => Rendered {
  const parent = getOwner()
  const value = signal<Rendered>(null)
  let current: Owner | null = null
  effect(
    () => {
      const k = select.get()
      untrack(() => {
        if (current) dispose(current)
        current = null
        const fn = pick(k)
        if (!fn) return value.set(null)
        current = createOwner('branch', parent)
        value.set(renderIn(current, fn))
      })
    },
    { kind: 'render' },
  )
  return () => value.get()
}

/** `key` em componente/elemento: recria `render()` (dispose do owner anterior) quando `key()` muda (`Object.is`). */
export function keyed(key: () => unknown, render: () => Rendered): () => Rendered {
  const k = memo(key, { equals: Object.is })
  return decide(k, () => render)
}

/**
 * Condicional com N casos + fallback. `index = memo(findIndex)`: só o CASO ativo importa. Ao mudar de caso, dispose
 * do owner anterior e `render` num owner novo (untracked). Mesmo índice → nada. Sem caso e sem fallback → null.
 */
export function branches(
  cases: Array<[cond: () => boolean, render: () => Rendered]>,
  fallback?: () => Rendered,
): () => Rendered {
  const index = memo(() => {
    for (let i = 0; i < cases.length; i++) if (cases[i]![0]()) return i
    return -1
  })
  return decide(index, (i) => (i < 0 ? fallback : cases[i]![1]))
}

// ─── list ────────────────────────────────────────────────────────────────────

interface Row<T> {
  key: unknown
  /** Valor atual do item. O signal de `item()` só nasce na primeira leitura rastreada (D58). */
  item: T
  sig: Signal<T> | null
  /** Chave = índice (primitivo sem `key`): valor diferente na posição recria a linha. */
  byIndex: boolean
  owner: Owner
  /** Posição atual. O signal de `index()` só nasce na primeira leitura (render que não usa o índice não paga). */
  i: number
  index: Signal<number> | null
  /** Nós de um conteúdo estático. */
  nodes: Node[]
  /** Conteúdo dinâmico (accessor): intervalo antes de `end`. */
  end: Comment | null
  slot: Slot | null
  pending: Rendered
}

function rowNodes(row: Row<unknown>): Node[] {
  if (row.end === null) return row.nodes
  return row.slot ? [...row.slot.current, row.end] : [row.end]
}

function setIndex(row: Row<unknown>, i: number): void {
  row.i = i
  row.index?.set(i)
}

function isObject(v: unknown): v is Record<PropertyKey, unknown> {
  return (typeof v === 'object' && v !== null) || typeof v === 'function'
}

function keyLabel(k: unknown): string {
  return isObject(k) ? Object.prototype.toString.call(k) : String(k)
}

/**
 * `s[j]` = posição antiga da linha que vai para j (-1 = nova). Marca com -2 as posições de uma subsequência crescente
 * máxima (LIS): essas linhas ficam paradas, as outras são movidas. Empate: a que começa mais cedo (percorre da direita).
 */
function stablePositions(s: number[]): void {
  const tails: number[] = []
  const prev: number[] = []
  for (let i = s.length; i--;) {
    const x = s[i]!
    if (x < 0) continue
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (s[tails[mid]!]! > x) lo = mid + 1
      else hi = mid
    }
    prev[i] = tails[lo - 1]! // undefined encerra a cadeia abaixo
    tails[lo] = i
  }
  for (let i = tails.at(-1)!; i >= 0; i = prev[i]!) s[i] = -2
}

/**
 * Lista com chave sobre nós reais. `source()` é lido (e copiado) num efeito de render: assina só a estrutura do array.
 * Chave padrão: objeto → `item.id ?? item.key ?? item`; primitivo → índice. Reconciliação: prefixo/sufixo comum +
 * `Map<key, posição>`; novos criados, ausentes descartados, existentes movidos (`insertBefore`, mesma referência) só
 * se fora da maior subsequência crescente (LIS). Lista esvaziada que é todo o conteúdo do parent: `textContent = ''`.
 * `item` é lazy (D58): chave igual com referência nova → `set(novo)` no signal da linha; nós e bindings preservados.
 * `parent === null` (D64): o pai é `marker.parentNode`, lido a cada reconciliação.
 */
export function list<T>(
  parent: Node | null,
  marker: Node | null,
  source: () => readonly T[],
  render: (item: () => T, index: () => number) => Rendered,
  key?: (item: T, index: number) => unknown,
  dev?: DevMeta,
): void {
  const listOwner = getOwner()
  const parent0 = parent
  let rows: Row<T>[] = []
  /** Chaves sintéticas estáveis para duplicadas: `dups.get(k)[n - 1]` é a n-ésima repetição de `k`. */
  const dups = new Map<unknown, object[]>()

  const createRow = (item: T, k: unknown, i: number, byIndex: boolean): Row<T> => {
    const owner = createOwner('item', listOwner)
    const row: Row<T> = {
      key: k,
      item,
      sig: null,
      byIndex,
      owner,
      i,
      index: null,
      nodes: [],
      end: null,
      slot: null,
      pending: null,
    }
    // Signals da linha nascem no owner dela (devtools); fora de rastreamento basta o valor atual.
    const own: <V>(v: V) => Signal<V> = DEV ? (v) => runWithOwner(owner, () => signal(v)) : signal
    const value = renderIn(owner, () =>
      render(
        () => (isTracking() ? (row.sig ??= own(row.item)).get() : row.item),
        () => (row.index ??= own(row.i)).get(),
      ),
    )
    if (hasFunction(value)) {
      row.end = document.createComment('')
      row.pending = value
    } else {
      const parts: (string | Node)[] = []
      collect(value, parts)
      row.nodes = parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p))
    }
    return row
  }

  const removeRow = (row: Row<T>, parent: Node): void => {
    dispose(row.owner)
    for (const n of rowNodes(row as Row<unknown>)) {
      if (n.parentNode === parent) {
        parent.removeChild(n)
        emitDomWrite(n, 'remove')
      }
    }
  }

  const reconcile = (items: T[]): void => {
    const parent = parent0 ?? marker!.parentNode!
    const n = items.length
    const old = rows

    // Chaves (com sufixo estável para duplicadas).
    const keys: unknown[] = new Array(n)
    const byIndex: boolean[] = new Array(n)
    const seen = new Map<unknown, number>()
    for (let i = 0; i < n; i++) {
      const item: unknown = items[i]
      let k: unknown
      if (key) {
        k = key(item as T, i)
        byIndex[i] = false
      } else if (isObject(item)) {
        k = item.id ?? item.key ?? item
        byIndex[i] = false
      } else {
        k = i
        byIndex[i] = true
      }
      const count = seen.get(k)
      if (count === undefined) seen.set(k, 1)
      else {
        if (DEV) warn('list-duplicate-key', `chave duplicada na lista: ${keyLabel(k)}`, dev?.loc)
        seen.set(k, count + 1)
        let tokens = dups.get(k)
        if (!tokens) dups.set(k, (tokens = []))
        k = tokens[count - 1] ??= { duplicateOf: k }
      }
      keys[i] = k
    }

    const fits = (row: Row<T>, j: number): boolean =>
      Object.is(row.key, keys[j]) && (!row.byIndex || Object.is(row.item, items[j]))

    const next: Row<T>[] = new Array(n)
    let reused = 0
    /** Linha reaproveitada na posição j: referência nova do item vai para o signal dela (Object.is → nada). */
    const reuse = (row: Row<T>, j: number): Row<T> => {
      const item = items[j]!
      if (!Object.is(row.item, item)) {
        row.item = item
        row.sig?.set(item)
      }
      reused++
      return row
    }
    let start = 0
    let oldEnd = old.length - 1
    let newEnd = n - 1

    // Prefixo e sufixo comuns.
    while (start <= oldEnd && start <= newEnd && fits(old[start]!, start)) {
      next[start] = reuse(old[start]!, start)
      start++
    }
    while (start <= oldEnd && start <= newEnd && fits(old[oldEnd]!, newEnd)) {
      const r = old[oldEnd--]!
      setIndex(r as Row<unknown>, newEnd)
      next[newEnd] = reuse(r, newEnd)
      newEnd--
    }

    // Meio: Map<key, posição antiga>; `from[j - start]` = de onde veio a linha (-1 = nova).
    const map = new Map<unknown, number>()
    const from: number[] = []
    if (n || marker) for (let i = start; i <= oldEnd; i++) map.set(old[i]!.key, i)
    for (let j = start; j <= newEnd; j++) {
      const i = map.get(keys[j])
      const r = i === undefined ? undefined : old[i]!
      const keep = r && fits(r, j)
      from.push(keep ? i! : -1)
      if (keep) {
        map.delete(keys[j])
        setIndex(r as Row<unknown>, j)
        next[j] = reuse(r, j)
      } else next[j] = createRow(items[j]!, keys[j], j, byIndex[j]!)
    }
    if (parent0 !== null && marker === null && old.length && !reused) {
      // Todas as linhas saem e a lista é todo o conteúdo de `parent` (marker null, 17 §Convenções): de uma vez.
      for (const r of old) {
        dispose(r.owner)
        if (DEV) for (const node of rowNodes(r as Row<unknown>)) emitDomWrite(node, 'remove')
      }
      parent.textContent = ''
    } else for (const i of map.values()) removeRow(old[i]!, parent)
    rows = next

    // Posiciona o intervalo alterado de trás para frente; linhas da LIS e nós já no lugar não são tocados.
    let ref: Node | null = marker
    for (let j = newEnd + 1; j < n; j++) {
      const ns = rowNodes(next[j]! as Row<unknown>)
      if (ns.length) {
        ref = ns[0]!
        break
      }
    }
    stablePositions(from)
    for (let j = newEnd; j >= start; j--) {
      const ns = rowNodes(next[j]! as Row<unknown>)
      if (from[j - start] === -2) ref = ns[0] ?? ref
      else
        for (let k = ns.length - 1; k >= 0; k--) {
          const node = ns[k]!
          if (node.parentNode !== parent || node.nextSibling !== ref) {
            const moved = node.parentNode === parent
            parent.insertBefore(node, ref)
            emitDomWrite(node, moved ? 'move' : 'insert')
          }
          ref = node
        }
    }

    // Conteúdo dinâmico das linhas novas: agora que o marcador está no lugar.
    for (let j = start; j <= newEnd; j++) {
      const r = next[j]!
      if (r.end !== null && r.slot === null) {
        const value = r.pending
        r.pending = null
        r.slot = runWithOwner(r.owner, () => insertSlot(parent, value, r.end))
      }
    }

    if (DEV && old.length > 0 && reused === 0 && n > 0 && devtoolsHook()) {
      emitDevtools({ type: 'list:recreated', owner: listOwner ? listOwner.id : 0, loc: dev?.loc, count: old.length })
    }
  }

  effect(
    () => {
      const src = source()
      // Copiar pelo iterador assina só a estrutura (`$iter`) de um array reativo, não cada índice.
      const items = src == null ? [] : Array.from(src)
      untrack(() => reconcile(items))
    },
    { kind: 'render', name: dev?.name, loc: dev?.loc },
  )
}

// ─── children / slots ────────────────────────────────────────────────────────

/** Resolve accessors (funções sem parâmetros) até nós/arrays. Render props (com parâmetros) ficam como estão. */
function resolveChildren(v: unknown): Rendered {
  while (typeof v === 'function' && v.length === 0) v = v()
  if (Array.isArray(v)) {
    const out: unknown[] = []
    for (const x of v) {
      const r = resolveChildren(x)
      if (Array.isArray(r)) out.push(...r)
      else out.push(r)
    }
    return out as Rendered
  }
  return v as Rendered
}

/** Memoiza os children resolvidos: `props.children` lido mais de uma vez não cria os nós de novo. */
export function children(read: () => Rendered): () => Rendered {
  const m = memo(() => resolveChildren(read()))
  return () => m.get()
}

export const SLOTS: unique symbol = Symbol(DEV ? 'slots' : '')

/** Objeto de slots gerado pelo compilador. `default` sempre existe (pode devolver null). */
export interface Slots {
  readonly [SLOTS]: true
  default: () => Rendered
  [name: string]: (() => Rendered) | ((...args: any[]) => Rendered) | true
}

/** `children` já é `Slots` → devolve. Senão `{ default: children(…) }`. */
export function slots(childrenValue: unknown): Slots {
  if (isObject(childrenValue) && childrenValue[SLOTS] === true) return childrenValue as unknown as Slots
  const read = children(() => childrenValue as Rendered)
  return { [SLOTS]: true, default: () => read() ?? null } as Slots
}

// ─── portal ──────────────────────────────────────────────────────────────────

/**
 * Renderiza `render()` dentro de `target()` num owner filho do atual (kind 'portal'): contexto e erros seguem a
 * origem. Os nós ficam antes de um marcador no fim do alvo; trocar de alvo os leva junto; dispose os remove.
 */
export function portal(target: () => Element, render: () => Rendered): null {
  const owner = createOwner('portal', getOwner())
  const content = renderIn(owner, render)
  runWithOwner(owner, () => {
    let slot: Slot | null = null
    const detach = () => {
      if (!slot) return
      slot.clear()
      const end = slot.marker!
      if (end.parentNode) end.parentNode.removeChild(end)
      slot = null
    }
    effect(
      () => {
        const t = target()
        if (!slot || slot.parent !== t) {
          detach()
          if (t) {
            const end = document.createComment('')
            t.appendChild(end)
            slot = new Slot(t, end)
          }
        }
        if (slot) slot.apply(content)
      },
      { kind: 'render' },
    )
    onCleanup(detach)
  })
  return null
}
