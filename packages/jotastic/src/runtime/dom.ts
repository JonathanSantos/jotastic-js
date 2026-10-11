// Templates e bindings de DOM (ver docs/spec/contracts/runtime.d.ts §Templates e bindings de DOM).
//
// Cada binding é um efeito de render mínimo com referência direta ao nó. A lógica de escrita de cada tipo vive num
// "applier" (função com estado que recebe o valor novo e escreve só o que mudou); a função pública embrulha o applier
// num efeito. `spread` reusa os mesmos appliers, um por chave.

import { emitDomWrite } from './devtools'
import { DEV } from './env'
import { getOwner, handleError, registerDisposable, runWithOwner, type Owner } from './owner'
import { effect, signal, untrack } from './reactive'

const SVG_NS = 'http://www.w3.org/2000/svg'

// ─── template ────────────────────────────────────────────────────────────────

/**
 * Compila `html` uma vez (no primeiro uso, via `<template>`) e devolve uma fábrica que clona o elemento raiz.
 * `svg=true` parseia dentro de `<svg>` para que os elementos fiquem no namespace SVG.
 */
export function template(html: string, svg?: boolean): () => Element {
  let node: Element | null = null
  return () => {
    if (node === null) {
      const t = document.createElement('template')
      t.innerHTML = svg ? `<svg>${html}</svg>` : html
      const root = svg ? t.content.firstChild!.firstChild : t.content.firstChild
      // Adota no documento principal uma vez: os clones já nascem nele (custom elements atualizam ao inserir).
      node = document.importNode(root as Element, true)
    }
    return node.cloneNode(true) as Element
  }
}

// ─── insert ──────────────────────────────────────────────────────────────────

/** Text nodes criados pelo `insert` (só esses são reutilizados; um Text do usuário nunca é reescrito). */
const ownTexts = new WeakSet<Node>()

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && typeof (v as Node).nodeType === 'number'
}

/**
 * Interno (também usado por `flow.ts`): normaliza um valor renderizável em uma lista plana de strings e nós.
 * Funções são chamadas (accessors aninhados).
 */
export function collect(v: unknown, out: (string | Node)[]): void {
  if (v == null || typeof v === 'boolean') return
  if (typeof v === 'function') return collect(v(), out)
  if (Array.isArray(v)) {
    for (const x of v) collect(x, out)
    return
  }
  if (isNode(v)) {
    // Fragmento: os filhos são o conteúdo (o fragmento esvazia ao ser inserido).
    if (v.nodeType === 11) out.push(...Array.from(v.childNodes))
    else out.push(v)
    return
  }
  out.push(String(v))
}

/** Interno (também usado por `flow.ts`): o valor contém accessor (precisa de efeito)? */
export function hasFunction(v: unknown): boolean {
  if (typeof v === 'function') return true
  if (Array.isArray(v)) for (const x of v) if (hasFunction(x)) return true
  return false
}

/** Interno: um intervalo de conteúdo dinâmico em `parent`, antes de `marker` (ou no fim, se null). */
export class Slot {
  current: Node[] = []
  declare readonly parent: Node
  declare readonly marker: Node | null
  constructor(parent: Node, marker: Node | null) {
    this.parent = parent
    this.marker = marker
  }

  apply(value: unknown): void {
    const items: (string | Node)[] = []
    collect(value, items)
    const prev = this.current
    const parent = this.parent

    // Caso texto: um único Text nosso → só `.data` (e só se mudou).
    if (items.length === 1 && typeof items[0] === 'string' && prev.length === 1 && ownTexts.has(prev[0]!)) {
      setText(prev[0] as Text, items[0])
      return
    }

    const next: Node[] = new Array(items.length)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      if (typeof item !== 'string') next[i] = item
      else {
        const old = prev[i]
        if (old !== undefined && ownTexts.has(old)) {
          setText(old as Text, item)
          next[i] = old
        } else {
          const t = document.createTextNode(item)
          ownTexts.add(t)
          next[i] = t
        }
      }
    }

    if (prev.length) {
      const keep = next.length ? new Set(next) : null
      for (const n of prev) {
        if ((keep === null || !keep.has(n)) && n.parentNode === parent) {
          parent.removeChild(n)
          emitDomWrite(n, 'remove')
        }
      }
    }

    // Coloca de trás para frente; nó já no lugar certo não é tocado.
    let ref = this.marker
    for (let i = next.length - 1; i >= 0; i--) {
      const n = next[i]!
      if (n.parentNode !== parent || n.nextSibling !== ref) {
        const moved = DEV && n.parentNode === parent
        parent.insertBefore(n, ref)
        emitDomWrite(n, moved ? 'move' : 'insert')
      }
      ref = n
    }
    this.current = next
  }

  /** Remove os nós atuais do DOM. */
  clear(): void {
    for (const n of this.current) {
      if (n.parentNode === this.parent) {
        this.parent.removeChild(n)
        emitDomWrite(n, 'remove')
      }
    }
    this.current = []
  }
}

function setText(t: Text, s: string): void {
  if (t.data !== s) {
    t.data = s
    emitDomWrite(t, 'text')
  }
}

/** Interno (para `createRoot`): como `insert`, mas devolve o `Slot` para remover os nós depois. */
export function insertSlot(parent: Node, value: unknown, marker?: Node | null): Slot {
  const slot = new Slot(parent, marker ?? null)
  if (hasFunction(value)) effect(() => slot.apply(value), { kind: 'render' })
  else slot.apply(value)
  return slot
}

/**
 * Insere/atualiza o conteúdo de `{expr}` antes de `marker` (`null` → `parent` só tem este conteúdo).
 * Valor função = accessor → efeito de render. Text reutilizado; troca remove os nós atuais e insere os novos.
 */
export function insert(parent: Node, value: unknown, marker?: Node | null): void {
  insertSlot(parent, value, marker)
}

// ─── Appliers ────────────────────────────────────────────────────────────────

type Applier = (v: unknown) => void
const UNSET = Symbol()

function attrApplier(el: Element, name: string): Applier {
  let prev: string | null | typeof UNSET = UNSET
  return (v) => {
    const s = v == null || v === false ? null : v === true ? '' : String(v)
    if (s === prev) return
    prev = s
    if (s === null) el.removeAttribute(name)
    else el.setAttribute(name, s)
    emitDomWrite(el, 'attr', name)
  }
}

function propApplier(el: Element, name: string): Applier {
  const target = el as unknown as Record<string, unknown>
  if (name === 'value') {
    return (v) => {
      if (Array.isArray(v) && el instanceof HTMLSelectElement && el.multiple) {
        let wrote = false
        const set = new Set(v.map(String))
        for (const o of Array.from(el.options)) {
          const sel = set.has(o.value)
          if (o.selected !== sel) {
            o.selected = sel
            wrote = true
          }
        }
        if (wrote) emitDomWrite(el, 'prop', name)
        return
      }
      const s = v == null ? '' : String(v)
      // Compara como string e não escreve se igual: o caret não pula.
      if (target.value !== s) {
        target.value = s
        emitDomWrite(el, 'prop', name)
      }
    }
  }
  return (v) => {
    if (target[name] !== v) {
      target[name] = v
      emitDomWrite(el, 'prop', name)
    }
  }
}

function boolApplier(el: Element, name: string): Applier {
  let prev: boolean | typeof UNSET = UNSET
  return (v) => {
    const on = !!v
    if (on === prev) return
    prev = on
    if (on) el.setAttribute(name, '')
    else el.removeAttribute(name)
    emitDomWrite(el, 'attr', name)
  }
}

export type ClassValue = string | null | undefined | false | Record<string, unknown> | ClassValue[]

function addClasses(s: string, out: Set<string>): void {
  for (const c of s.split(/\s+/)) if (c) out.add(c)
}

function normalizeClass(v: unknown, out: Set<string>): void {
  if (!v) return
  if (typeof v === 'string') addClasses(v, out)
  else if (Array.isArray(v)) for (const x of v) normalizeClass(x, out)
  else if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of Object.keys(o)) if (o[k]) addClasses(k, out)
  }
}

function classApplier(el: Element): Applier {
  // Classes do template ficam intactas: nunca são removidas por um diff. O Set só é montado na primeira remoção.
  const initial = el.getAttribute('class')
  let fixed: Set<string> | null = null
  let prev: Set<string> | null = null
  return (v) => {
    // Nada antes e nada agora (caso comum na criação): sem alocar.
    if (!v && prev === null) return
    const next = new Set<string>()
    normalizeClass(v, next)
    let changed = false
    if (prev !== null) {
      for (const c of prev) {
        if (!next.has(c)) {
          if (fixed === null) {
            fixed = new Set()
            if (initial) addClasses(initial, fixed)
          }
          if (!fixed.has(c)) {
            el.classList.remove(c)
            changed = true
          }
        }
      }
    }
    for (const c of next) {
      if ((prev === null || !prev.has(c)) && !el.classList.contains(c)) {
        el.classList.add(c)
        changed = true
      }
    }
    prev = next
    if (changed) emitDomWrite(el, 'class')
  }
}

export type StyleValue = string | null | undefined | Record<string, string | number | null | undefined>

const kebabCache = new Map<string, string>()
function kebab(k: string): string {
  if (k.startsWith('--')) return k
  let r = kebabCache.get(k)
  if (r === undefined) {
    r = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    if (r.startsWith('ms-')) r = '-' + r
    kebabCache.set(k, r)
  }
  return r
}

/** Propriedades de comprimento que recebem `px` quando o valor é número. */
const LENGTH =
  /^(width|height|(min|max)-(width|height)|top|right|bottom|left|inset(-.+)?|(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?|font-size|border(-(top|right|bottom|left))?-width|border(-(top|bottom)-(left|right))?-radius|gap|row-gap|column-gap|letter-spacing|word-spacing|text-indent|outline-width|outline-offset|flex-basis)$/

function styleApplier(el: HTMLElement | SVGElement): Applier {
  const st = el.style
  let prevStr: string | null = null
  let prevObj: Record<string, string> | null = null
  return (v) => {
    if (v == null || typeof v === 'string') {
      const s = v ?? ''
      if (prevObj === null && s === (prevStr ?? '')) {
        prevStr = s
        return
      }
      prevObj = null
      prevStr = s
      st.cssText = s
      emitDomWrite(el, 'style')
      return
    }
    if (prevObj === null) {
      if (prevStr) st.cssText = ''
      prevStr = null
      prevObj = {}
    }
    const o = v as Record<string, unknown>
    const next: Record<string, string> = {}
    for (const k of Object.keys(o)) {
      const val = o[k]
      if (val == null || val === '' || val === false) continue
      const name = kebab(k)
      next[name] = typeof val === 'number' && val !== 0 && LENGTH.test(name) ? val + 'px' : String(val)
    }
    let changed = false
    for (const name in prevObj) {
      if (!(name in next)) {
        st.removeProperty(name)
        changed = true
      }
    }
    for (const name in next) {
      const s = next[name]!
      if (prevObj[name] !== s) {
        const i = s.indexOf('!important')
        if (i >= 0) st.setProperty(name, s.slice(0, i).trim(), 'important')
        else st.setProperty(name, s)
        changed = true
      }
    }
    prevObj = next
    if (changed) emitDomWrite(el, 'style')
  }
}

function bind(apply: Applier, read: () => unknown): void {
  effect(() => apply(read()), { kind: 'render' })
}

/** `setAttribute(name, String(v))`; `null | undefined | false` → `removeAttribute`; `true` → `""`. */
export function attr(el: Element, name: string, read: () => unknown): void {
  bind(attrApplier(el, name), read)
}

/** `el[name] = v`, só se `el[name] !== v`. `value` compara como string (caret preservado). */
export function prop(el: Element, name: string, read: () => unknown): void {
  bind(propApplier(el, name), read)
}

/** Atributo booleano: `v ? setAttribute(name, '') : removeAttribute(name)`. */
export function bool(el: Element, name: string, read: () => unknown): void {
  bind(boolApplier(el, name), read)
}

/** Classes dinâmicas por diff, sem tocar nas classes estáticas do template. */
export function classList(el: Element, read: () => ClassValue): void {
  bind(classApplier(el), read)
}

/** Objeto: diff por propriedade (camelCase → kebab, `--var` intacto, número → px em comprimentos). String: `cssText`. */
export function style(el: HTMLElement | SVGElement, read: () => StyleValue): void {
  bind(styleApplier(el), read)
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

/** Adiciona o listener embrulhado (owner, untrack, try/catch, Promise) e devolve a função que o remove. */
function addListener(
  el: EventTarget,
  type: string,
  handler: (e: Event) => unknown,
  owner: Owner | null,
  opts?: AddEventListenerOptions,
): () => void {
  const wrapped = (e: Event) => {
    try {
      const r = untrack(() => runWithOwner(owner, () => handler.call(el, e)))
      if (r && typeof (r as Promise<unknown>).then === 'function') {
        ;(r as Promise<unknown>).then(undefined, (err) => handleError(owner, err, 'handler'))
      }
    } catch (err) {
      handleError(owner, err, 'handler')
    }
  }
  el.addEventListener(type, wrapped, opts)
  return () => el.removeEventListener(type, wrapped, opts)
}

/**
 * `addEventListener` direto. Handler roda no owner atual (sem rastrear), erro síncrono ou Promise rejeitada →
 * `handleError(owner, e, 'handler')`. Removido no dispose do owner.
 */
export function listen(
  el: EventTarget,
  type: string,
  handler: (e: Event) => unknown,
  opts?: AddEventListenerOptions,
): void {
  const owner = getOwner()
  const off = addListener(el, type, handler, owner, opts)
  if (owner) registerDisposable(owner, off)
}

type TwoWayKind = 'value' | 'number' | 'checked' | 'select' | 'multiple'

function twoWayEvent(kind: TwoWayKind): string {
  return kind === 'value' || kind === 'number' ? 'input' : 'change'
}

function twoWayRead(el: Element, kind: TwoWayKind): unknown {
  switch (kind) {
    case 'number': {
      const n = (el as HTMLInputElement).valueAsNumber
      return Number.isNaN(n) ? null : n
    }
    case 'checked':
      return (el as HTMLInputElement).checked
    case 'multiple': {
      const s = el as HTMLSelectElement
      return s.selectedOptions
        ? Array.from(s.selectedOptions, (o) => o.value)
        : Array.from(s.options)
            .filter((o) => o.selected)
            .map((o) => o.value)
    }
    default:
      return (el as HTMLInputElement).value
  }
}

/** Two-way para `value`/`checked` sem handler: o evento e a coerção vêm de `kind`. */
export function twoWay(el: Element, kind: TwoWayKind, write: (v: unknown) => void): void {
  listen(el, twoWayEvent(kind), () => write(twoWayRead(el, kind)))
}

/** `.focus()` no próximo flush (depois da inserção) se o elemento tem `autofocus`. */
export function autofocus(el: Element): void {
  effect(() => {
    if (el.hasAttribute('autofocus')) (el as HTMLElement).focus()
  })
}

// ─── spread ──────────────────────────────────────────────────────────────────

const PROPS = new Set([
  'value',
  'checked',
  'selected',
  'muted',
  'volume',
  'currentTime',
  'playbackRate',
  'indeterminate',
  'defaultValue',
  'defaultChecked',
  'innerHTML',
  'textContent',
])

const BOOLS = new Set([
  'disabled',
  'hidden',
  'required',
  'readonly',
  'multiple',
  'autofocus',
  'open',
  'inert',
  'novalidate',
  'autoplay',
  'controls',
  'loop',
  'playsinline',
  'default',
  'reversed',
  'ismap',
  'nomodule',
  'allowfullscreen',
  'async',
  'defer',
])

/** Nome do evento de uma chave `on*` / `on:*` (18-transformacoes.md §5.4), ou null. */
function eventOf(key: string): { type: string; capture: boolean } | null {
  if (key.startsWith('on:')) return { type: key.slice(3), capture: false }
  if (key.length > 2 && key[0] === 'o' && key[1] === 'n' && key[2]! >= 'A' && key[2]! <= 'Z') {
    const capture = key.endsWith('Capture')
    return { type: (capture ? key.slice(2, -7) : key.slice(2)).toLowerCase(), capture }
  }
  return null
}

function hasSetter(obj: object, key: string): boolean {
  for (let o: object | null = obj; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key)
    if (d) return typeof d.set === 'function'
  }
  return false
}

/** `kind` de two-way pelo elemento (17-contratos.md §Two-way), ou null se o campo nunca é two-way. */
function twoWayKindOf(el: Element, key: string): TwoWayKind | null {
  const tag = el.localName
  if (key === 'value') {
    if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'multiple' : 'select'
    if (tag === 'textarea') return 'value'
    if (tag === 'input') {
      const type = (el as HTMLInputElement).type
      if (type === 'radio' || type === 'file' || type === 'checkbox') return null
      return type === 'number' || type === 'range' ? 'number' : 'value'
    }
    return null
  }
  if (key === 'checked' && tag === 'input' && (el as HTMLInputElement).type === 'checkbox') return 'checked'
  return null
}

interface KeyBinding {
  /** Desliga listeners/efeitos. */
  off(): void
  /** Limpa o que o binding escreveu no DOM (chave sumiu). */
  reset(): void
}

const NOOP = () => {}

function bindKey(
  el: Element,
  key: string,
  src: { get(): Record<string, unknown>; peek(): Record<string, unknown> },
  owner: Owner | null,
): KeyBinding {
  if (key === 'key') return { off: NOOP, reset: NOOP }

  if (key === 'children') {
    const slot = new Slot(el, null)
    const stop = effect(() => slot.apply(src.get()[key]), { kind: 'render' })
    return { off: stop, reset: () => slot.clear() }
  }

  if (key === 'ref') {
    let last: unknown
    const stop = effect(
      () => {
        const r = src.get()[key]
        if (r !== last) {
          last = r
          if (typeof r === 'function') untrack(() => r(el))
        }
      },
      { kind: 'render' },
    )
    return { off: stop, reset: NOOP }
  }

  const ev = eventOf(key)
  if (ev) {
    // Listener estável que chama o handler atual do objeto.
    const off = addListener(
      el,
      ev.type,
      (e) => {
        const fn = src.peek()[key]
        if (typeof fn === 'function') return fn.call(el, e)
      },
      owner,
      ev.capture ? { capture: true } : undefined,
    )
    return { off, reset: NOOP }
  }

  const svg = el.namespaceURI === SVG_NS
  let apply: Applier
  if (key === 'class' || key === 'className') apply = classApplier(el)
  else if (key === 'style') apply = styleApplier(el as HTMLElement)
  else if (svg) apply = attrApplier(el, key)
  else if (PROPS.has(key)) apply = propApplier(el, key)
  else if (BOOLS.has(key.toLowerCase())) apply = boolApplier(el, key.toLowerCase())
  else apply = attrApplier(el, key === 'htmlFor' ? 'for' : key)

  const kind = svg ? null : twoWayKindOf(el, key)
  let twoWayOff: (() => void) | null = null
  const stop = effect(
    () => {
      const obj = src.get()
      apply(obj[key])
      if (kind === null) return
      const want = hasSetter(obj, key) && !('onInput' in obj) && !('onChange' in obj)
      if (want && twoWayOff === null) {
        twoWayOff = addListener(
          el,
          twoWayEvent(kind),
          () => {
            src.peek()[key] = twoWayRead(el, kind)
          },
          owner,
        )
      } else if (!want && twoWayOff !== null) {
        twoWayOff()
        twoWayOff = null
      }
    },
    { kind: 'render' },
  )
  return {
    off: () => {
      stop()
      if (twoWayOff) twoWayOff()
      twoWayOff = null
    },
    reset: () => apply(null),
  }
}

/**
 * Espalha um objeto de props no elemento: um binding por chave (tabela de 18-transformacoes.md §5.3).
 * Chaves que somem são removidas. `value`/`checked` com setter e sem `onInput`/`onChange` → two-way.
 */
export function spread(el: Element, read: () => Record<string, unknown>): void {
  const owner = getOwner()
  const src = signal<Record<string, unknown>>({})
  const bindings = new Map<string, KeyBinding>()
  effect(
    () => {
      const obj = read() ?? {}
      src.set(obj)
      const keys = Object.keys(obj)
      untrack(() => {
        if (bindings.size) {
          const seen = new Set(keys)
          for (const [k, b] of bindings) {
            if (!seen.has(k)) {
              b.off()
              b.reset()
              bindings.delete(k)
            }
          }
        }
        for (const k of keys) if (!bindings.has(k)) bindings.set(k, bindKey(el, k, src, owner))
      })
    },
    { kind: 'render' },
  )
  if (owner) {
    registerDisposable(owner, () => {
      for (const b of bindings.values()) b.off()
      bindings.clear()
    })
  }
}
