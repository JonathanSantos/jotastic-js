import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DevtoolsEvent, DevtoolsHook } from 'jotastic/runtime'
import { installDevtools, installHook, type Devtools } from '../src/index'

type Global = { __JOTASTIC_DEVTOOLS__?: DevtoolsHook }
const g = globalThis as Global

const emit = (e: DevtoolsEvent) => g.__JOTASTIC_DEVTOOLS__!.emit(e)
const shadow = () => document.getElementById('__jotastic_devtools__')!.shadowRoot!
const flashes = () => shadow().querySelectorAll('.flash')

let dt: Devtools | undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
})

afterEach(() => {
  dt?.dispose()
  dt = undefined
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('@jotastic/devtools', () => {
  test('encadeia com um hook pré-existente: eventos seguem e o registry é compartilhado', async () => {
    // Módulo novo: o hook ainda não foi instalado nesta instância do módulo.
    vi.resetModules()
    const prevEvents: DevtoolsEvent[] = []
    const prev: DevtoolsHook = { emit: (e) => prevEvents.push(e), registry: { owners: new Map() } }
    g.__JOTASTIC_DEVTOOLS__ = prev
    const fresh = await import('../src/hook')
    const hook = fresh.installHook()
    expect(g.__JOTASTIC_DEVTOOLS__).toBe(hook)
    expect(hook.registry).toBe(prev.registry)
    const seen: DevtoolsEvent[] = []
    const off = hook.subscribe((e) => seen.push(e))
    const ev: DevtoolsEvent = { type: 'warn', id: 'x', message: 'y' }
    emit(ev)
    expect(seen).toEqual([ev])
    expect(prevEvents).toEqual([ev])
    off()
    emit(ev)
    expect(seen).toHaveLength(1)
    expect(prevEvents).toHaveLength(2)
  })

  test('instalar duas vezes é idempotente (hook e UI únicos)', () => {
    dt = installDevtools()
    const hook = g.__JOTASTIC_DEVTOOLS__
    expect(installDevtools()).toBe(dt)
    expect(installHook()).toBe(hook)
    expect(g.__JOTASTIC_DEVTOOLS__).toBe(hook)
    expect(document.querySelectorAll('#__jotastic_devtools__')).toHaveLength(1)
    expect(shadow().querySelectorAll('.badge')).toHaveLength(1)
  })

  test('dom:write desenha um retângulo que some após 300 ms', () => {
    dt = installDevtools()
    const el = document.createElement('p')
    document.body.appendChild(el)
    emit({ type: 'dom:write', node: el, op: 'class', flush: 1 })
    expect(flashes()).toHaveLength(0) // desenha no próximo frame
    vi.advanceTimersToNextFrame()
    expect(flashes()).toHaveLength(1)
    const rect = flashes()[0] as HTMLElement
    expect(rect.style.position === '' || rect.style.position === 'fixed').toBe(true) // vem da folha no shadow
    expect(rect.dataset.op).toBe('class')
    vi.advanceTimersByTime(299)
    expect(flashes()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(flashes()).toHaveLength(0)
  })

  test('vários writes no mesmo nó no mesmo frame viram um retângulo; Text usa Range; nó solto é ignorado', () => {
    dt = installDevtools()
    const p = document.createElement('p')
    const text = document.createTextNode('1')
    p.appendChild(text)
    document.body.appendChild(p)
    const detached = document.createElement('span')
    emit({ type: 'dom:write', node: text, op: 'text', flush: 2 })
    emit({ type: 'dom:write', node: text, op: 'text', flush: 2 })
    emit({ type: 'dom:write', node: p, op: 'class', flush: 2 })
    emit({ type: 'dom:write', node: p, op: 'attr', flush: 2 })
    emit({ type: 'dom:write', node: detached, op: 'remove', flush: 2 })
    vi.advanceTimersToNextFrame()
    const ops = [...flashes()].map((f) => (f as HTMLElement).dataset.op)
    expect(ops.sort()).toEqual(['class attr', 'text'])
  })

  test('contadores atualizam no flush:end (efeitos e escritas do evento, memos pelos memo:run)', () => {
    dt = installDevtools()
    const badge = shadow().querySelector('.badge')!
    expect(badge.textContent).toContain('aguardando')
    emit({ type: 'flush:start', flush: 7 })
    emit({ type: 'memo:run', id: 1, prev: 0, next: 10, changed: true, flush: 7 })
    emit({ type: 'memo:run', id: 2, prev: true, next: false, changed: true, flush: 7 })
    expect(badge.textContent).toContain('aguardando') // só muda no flush:end
    emit({ type: 'flush:end', flush: 7, effects: 4, writes: 4, durationMs: 0.2 })
    expect(dt.counters!.last).toEqual({ flush: 7, effects: 4, memos: 2, writes: 4, durationMs: 0.2 })
    expect(badge.textContent).toContain('flush #7 · 4 efeitos · 2 memos · 4 escritas')
    emit({ type: 'flush:start', flush: 8 })
    emit({ type: 'flush:end', flush: 8, effects: 1, writes: 0, durationMs: 0.1 })
    expect(dt.counters!.total).toEqual({ flushes: 2, effects: 5, memos: 2, writes: 4 })
    expect(badge.textContent).toContain('flush #8 · 1 efeitos · 0 memos · 0 escritas')
  })

  test('Alt+J alterna o badge', () => {
    dt = installDevtools()
    const badge = shadow().querySelector('.badge') as HTMLElement
    expect(badge.hidden).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyJ', key: '∆' }))
    expect(badge.hidden).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyJ', key: '∆' }))
    expect(badge.hidden).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', key: 'j' }))
    expect(badge.hidden).toBe(false)
  })

  test('dispose remove a UI e para de ouvir', () => {
    dt = installDevtools()
    dt.dispose()
    dt = undefined
    expect(document.getElementById('__jotastic_devtools__')).toBeNull()
    expect(() => emit({ type: 'flush:end', flush: 1, effects: 0, writes: 0, durationMs: 0 })).not.toThrow()
  })
})
