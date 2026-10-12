import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  abortSignal,
  batch,
  createOwner,
  dispose,
  effect,
  flush,
  getOwner,
  handleError,
  isTracking,
  memo,
  onCleanup,
  runWithOwner,
  signal,
  state,
  tick,
  untrack,
  type BoundaryHandle,
  type ErrorInfo,
  type Owner,
} from '../src/runtime/index'
import { __setTestMode, setOnError } from '../src/runtime/owner'
import { observerCount, withAbortSignal } from '../src/runtime/reactive'

/** Roda `fn` dentro de um owner raiz (efeitos exigem owner em dev). */
function inRoot<T>(fn: (root: Owner) => T): T {
  const root = createOwner('root', null)
  return runWithOwner(root, () => fn(root))
}

afterEach(() => {
  flush()
  vi.restoreAllMocks()
})

describe('núcleo reativo (R1–R20)', () => {
  test('R1 set com valor igual não executa efeitos', () => {
    const a = signal(1)
    let runs = 0
    inRoot(() => effect(() => void (a.get(), runs++)))
    flush()
    expect(runs).toBe(1)
    a.set(1)
    flush()
    expect(runs).toBe(1)
    const o = {}
    const b = signal(o)
    inRoot(() => effect(() => void (b.get(), runs++)))
    flush()
    runs = 0
    b.set(o)
    a.set(1)
    flush()
    expect(runs).toBe(0)
  })

  test('R2 leitura devolve o novo valor antes do flush', () => {
    const count = signal(0)
    count.set(count.get() + 1)
    expect(count.get()).toBe(1)
    expect(count.peek()).toBe(1)
  })

  test('R3 memo lido depois de set, antes do flush, já recalculado', () => {
    const a = signal(1)
    const double = memo(() => a.get() * 2)
    expect(double.get()).toBe(2)
    a.set(5)
    expect(double.get()).toBe(10)
  })

  test('R4 memo com resultado igual não roda o efeito dependente', async () => {
    const a = signal(2)
    const isEven = memo(() => a.get() % 2 === 0)
    let runs = 0
    inRoot(() => effect(() => void (isEven.get(), runs++)))
    flush()
    expect(runs).toBe(1)
    a.set(4)
    await tick()
    expect(runs).toBe(1)
    a.set(5)
    await tick()
    expect(runs).toBe(2)
  })

  test('R5 memo devolvendo array shallow-igual não roda o efeito dependente', () => {
    const a = signal(1)
    const list = memo(() => [1, 2, a.get() > 0])
    const first = list.get()
    let runs = 0
    inRoot(() => effect(() => void (list.get(), runs++)))
    flush()
    a.set(2)
    flush()
    expect(runs).toBe(1)
    expect(list.get()).toBe(first)
    // POJO também; `equals: false` desliga a comparação
    const obj = memo(() => ({ pos: a.get() > 0 }))
    const always = memo(() => [a.get() > 0], { equals: false })
    let objRuns = 0
    let alwaysRuns = 0
    inRoot(() => {
      effect(() => void (obj.get(), objRuns++))
      effect(() => void (always.get(), alwaysRuns++))
    })
    flush()
    a.set(3)
    flush()
    expect(objRuns).toBe(1)
    expect(alwaysRuns).toBe(2)
  })

  test('R6 memo sem leituras reativas vira constante', () => {
    const fn = vi.fn(() => 42)
    const m = memo(fn)
    expect((m as unknown as { constant: boolean }).constant).toBe(true)
    for (let i = 0; i < 1000; i++) expect(m.get()).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
    const a = signal(1)
    expect((memo(() => a.get()) as unknown as { constant: boolean }).constant).toBe(false)
  })

  test('R7 memo executa na criação', () => {
    const log: string[] = []
    const a = signal(1)
    memo(() => {
      log.push('run')
      return a.get()
    })
    expect(log).toEqual(['run'])
  })

  test('R8 duas escritas no mesmo tick: 1 flush, efeito roda 1 vez', async () => {
    const a = signal(0)
    const b = signal(0)
    const seen: number[][] = []
    inRoot(() => effect(() => void seen.push([a.get(), b.get()])))
    await tick()
    expect(seen).toEqual([[0, 0]])
    a.set(1)
    b.set(2)
    await tick()
    expect(seen).toEqual([
      [0, 0],
      [1, 2],
    ])
  })

  test('R9 diamante sem glitch', () => {
    const a = signal(1)
    const b = memo(() => a.get() * 2)
    const c = memo(() => a.get() * 3)
    const seen: [number, number][] = []
    inRoot(() => effect(() => void seen.push([b.get(), c.get()])))
    flush()
    a.set(2)
    flush()
    expect(seen).toEqual([
      [2, 3],
      [4, 6],
    ])
    // d como memo: recalcula 1 vez e nunca vê b novo com c velho
    const dRuns: [number, number][] = []
    const d = memo(() => {
      const v: [number, number] = [b.get(), c.get()]
      dRuns.push(v)
      return v[0] + v[1]
    })
    a.set(3)
    expect(d.get()).toBe(15)
    expect(dRuns).toEqual([
      [4, 6],
      [6, 9],
    ])
  })

  test('R10 efeito que escreve no que lê: effect-loop após 100 execuções, sem travar', async () => {
    const count = signal(0)
    const errors: unknown[] = []
    let runs = 0
    inRoot((root) => {
      setOnError(root, (e) => errors.push(e))
      effect(() => {
        runs++
        count.set(count.get() + 1)
      })
    })
    flush()
    expect(runs).toBe(100)
    expect(errors).toHaveLength(1)
    expect((errors[0] as { code: string }).code).toBe('effect-loop')
    // não reagenda sozinho: o próximo tick está ocioso
    await tick()
    expect(runs).toBe(100)
  })

  test('R11 efeito de render roda síncrono na criação', () => {
    const a = signal('x')
    let seen = ''
    inRoot(() => effect(() => void (seen = a.get()), { kind: 'render' }))
    expect(seen).toBe('x')
    a.set('y')
    expect(seen).toBe('x')
    flush()
    expect(seen).toBe('y')
  })

  test('R12 efeito user não roda na criação; roda no primeiro flush', async () => {
    let runs = 0
    inRoot(() => effect(() => void runs++))
    expect(runs).toBe(0)
    await tick()
    expect(runs).toBe(1)
  })

  test('R13 ordem no flush: render por id, depois user por id', () => {
    const a = signal(0)
    const log: string[] = []
    inRoot(() => {
      effect(() => void (a.get(), log.push('u1')))
      effect(() => void (a.get(), log.push('r1')), { kind: 'render' })
      effect(() => void (a.get(), log.push('u2')))
      effect(() => void (a.get(), log.push('r2')), { kind: 'render' })
    })
    flush()
    log.length = 0
    a.set(1)
    flush()
    expect(log).toEqual(['r1', 'r2', 'u1', 'u2'])
  })

  test('R14 efeito criado durante o flush roda no mesmo flush', () => {
    const log: string[] = []
    inRoot(() => {
      effect(() => {
        log.push('outer')
        effect(() => void log.push('inner'))
      })
    })
    flush()
    expect(log).toEqual(['outer', 'inner'])
  })

  test('R15 dispose de owner no meio do flush pula os efeitos pendentes dele', () => {
    const a = signal(0)
    const log: string[] = []
    inRoot((root) => {
      let child!: Owner
      effect(() => {
        if (a.get() === 1) dispose(child)
        log.push('parent')
      })
      child = createOwner('branch', root)
      runWithOwner(child, () => effect(() => void (a.get(), log.push('child'))))
    })
    flush()
    expect(log).toEqual(['parent', 'child'])
    log.length = 0
    a.set(1)
    flush()
    expect(log).toEqual(['parent'])
  })

  test('R16 cleanup roda antes da reexecução e no dispose, em ordem reversa', () => {
    const a = signal(0)
    const log: string[] = []
    const root = inRoot((root) => {
      effect(() => {
        const v = a.get()
        log.push(`run1:${v}`)
        return () => log.push(`clean1:${v}`)
      })
      onCleanup(() => log.push('onCleanup'))
      effect(() => {
        const v = a.get()
        log.push(`run2:${v}`)
        return () => log.push(`clean2:${v}`)
      })
      return root
    })
    flush()
    a.set(1)
    flush()
    expect(log).toEqual(['run1:0', 'run2:0', 'clean1:0', 'run1:1', 'clean2:0', 'run2:1'])
    log.length = 0
    dispose(root)
    expect(log).toEqual(['clean2:1', 'onCleanup', 'clean1:1'])
    log.length = 0
    dispose(root)
    a.set(2)
    flush()
    expect(log).toEqual([])
  })

  test('R17 dependências recoletadas', () => {
    const cond = signal(true)
    const b = signal(0)
    let runs = 0
    inRoot(() =>
      effect(() => {
        runs++
        if (cond.get()) b.get()
      }),
    )
    flush()
    cond.set(false)
    flush()
    expect(runs).toBe(2)
    b.set(1)
    flush()
    expect(runs).toBe(2)
  })

  test('R18 untrack: leitura dentro não assina', () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    let tracking: boolean[] = []
    inRoot(() =>
      effect(() => {
        runs++
        a.get()
        untrack(() => {
          tracking.push(isTracking())
          return b.get()
        })
        tracking.push(isTracking())
      }),
    )
    flush()
    b.set(1)
    flush()
    expect(runs).toBe(1)
    expect(tracking).toEqual([false, true])
    expect(isTracking()).toBe(false)
    a.set(1)
    flush()
    expect(runs).toBe(2)
  })

  test('R19 tick resolve depois do flush', async () => {
    const a = signal(0)
    let seen = -1
    inRoot(() => effect(() => void (seen = a.get())))
    await tick()
    a.set(7)
    expect(seen).toBe(0)
    await tick()
    expect(seen).toBe(7)
    // nada agendado → resolve imediatamente
    await expect(tick()).resolves.toBeUndefined()
  })

  test('R20 abortSignal em efeito aborta no cleanup; fora de efeito nunca aborta', () => {
    const a = signal(0)
    const signals: AbortSignal[] = []
    const root = inRoot((root) => {
      effect(() => {
        a.get()
        signals.push(abortSignal())
      })
      return root
    })
    flush()
    expect(signals[0]!.aborted).toBe(false)
    a.set(1)
    flush()
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
    dispose(root)
    expect(signals[1]!.aborted).toBe(true)
    const outside = abortSignal()
    expect(outside.aborted).toBe(false)
    // o signal ambiente de um recurso tem prioridade durante a parte síncrona
    const ctrl = new AbortController()
    expect(withAbortSignal(ctrl.signal, () => abortSignal())).toBe(ctrl.signal)
    expect(abortSignal()).toBe(outside)
  })
})

describe('núcleo reativo: extras', () => {
  test('state passa o valor por toReactive e usa Object.is', () => {
    const s = state({ a: 1 })
    expect(s.get()).toEqual({ a: 1 })
    let runs = 0
    inRoot(() => effect(() => void (s.get(), runs++)))
    flush()
    s.set(s.peek())
    flush()
    expect(runs).toBe(1)
  })

  test('batch adia flush() manual até o fim', () => {
    const a = signal(0)
    const seen: number[] = []
    inRoot(() => effect(() => void seen.push(a.get())))
    flush()
    batch(() => {
      a.set(1)
      flush()
      expect(seen).toEqual([0])
      a.set(2)
    })
    expect(seen).toEqual([0, 2])
  })

  test('memo: exceção na criação propaga; no recálculo propaga para get() e se recupera', () => {
    expect(() =>
      memo(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    const a = signal(0)
    const m = memo(() => {
      if (a.get() === 1) throw new Error('um')
      return a.get()
    })
    a.set(1)
    expect(() => m.get()).toThrow('um')
    a.set(2)
    expect(m.get()).toBe(2)
  })

  test('memo é lazy: só recalcula quando lido', () => {
    const a = signal(0)
    const fn = vi.fn(() => a.get())
    const m = memo(fn)
    a.set(1)
    a.set(2)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(m.get()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('efeito fora de owner: use-outside-owner em dev (sem lançar), continua vivo', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    let runs = 0
    const stop = effect(() => void runs++)
    expect(String(err.mock.calls[0]![0])).toContain('use-outside-owner')
    flush()
    expect(runs).toBe(1)
    stop()
  })

  test('erro em efeito vai para handleError e o efeito continua vivo', () => {
    const a = signal(0)
    const errors: [unknown, ErrorInfo][] = []
    let runs = 0
    inRoot((root) => {
      setOnError(root, (e, info) => errors.push([e, info]))
      effect(() => {
        runs++
        if (a.get() === 1) throw new Error('x')
      })
      effect(
        () =>
          void (
            a.get() === 1 &&
            (() => {
              throw new Error('y')
            })()
          ),
        { kind: 'render' },
      )
    })
    flush()
    a.set(1)
    flush()
    expect(errors.map(([e, i]) => [(e as Error).message, i.phase])).toEqual([
      ['y', 'binding'],
      ['x', 'effect'],
    ])
    a.set(2)
    flush()
    expect(runs).toBe(3)
  })
})

describe('efeito é escopo (N-4/N-5/M-4)', () => {
  test('onCleanup dentro de watch roda antes da reexecução e não acumula no componente', () => {
    const a = signal(0)
    const log: string[] = []
    const root = inRoot((r) => {
      effect(() => {
        const v = a.get()
        onCleanup(() => log.push(`cleanup:${v}`))
      })
      return r
    })
    flush()
    for (let i = 1; i <= 3; i++) {
      a.set(i)
      flush()
    }
    expect(log).toEqual(['cleanup:0', 'cleanup:1', 'cleanup:2'])
    dispose(root)
    expect(log).toEqual(['cleanup:0', 'cleanup:1', 'cleanup:2', 'cleanup:3'])
  })

  test('efeito interno é descartado na reexecução do externo (não duplica) e no dispose', () => {
    const outer = signal(0)
    const inner = signal('x')
    const runs: string[] = []
    const root = inRoot((r) => {
      effect(() => {
        const o = outer.get()
        effect(() => void runs.push(`${o}:${inner.get()}`))
      })
      return r
    })
    flush()
    expect(runs).toEqual(['0:x'])
    outer.set(1)
    flush()
    expect(runs).toEqual(['0:x', '1:x'])
    inner.set('y')
    flush()
    // só o efeito interno da execução corrente reage
    expect(runs).toEqual(['0:x', '1:x', '1:y'])
    dispose(root)
    inner.set('z')
    flush()
    expect(runs).toEqual(['0:x', '1:x', '1:y'])
  })

  test('memo e owner criados na execução saem junto; getOwner() dentro do efeito tem o owner de criação como pai', () => {
    const a = signal(0)
    const b = signal(1)
    let m!: ReturnType<typeof memo<number>>
    let child!: Owner
    let parent: Owner | null = null
    const root = inRoot((r) => {
      effect(
        () => {
          a.get()
          m = memo(() => b.get() * 2)
          child = createOwner('branch')
          parent = getOwner()!.parent
        },
        { kind: 'render' },
      )
      return r
    })
    expect(parent).toBe(root)
    const first = m
    const firstChild = child
    expect(observerCount(b)).toBe(1)
    a.set(1)
    flush()
    expect(firstChild.disposed).toBe(true)
    expect(m).not.toBe(first)
    expect(observerCount(b)).toBe(1) // o memo anterior largou a fonte
    dispose(root)
    expect(child.disposed).toBe(true)
    expect(observerCount(b)).toBe(0)
  })

  test('ordem: cleanup devolvido, depois o escopo (reverso); useContext/handleError sobem pelo pai', () => {
    const a = signal(0)
    const log: string[] = []
    const errors: [unknown, ErrorInfo][] = []
    const root = inRoot((r) => {
      setOnError(r, (e, info) => errors.push([e, info]))
      effect(() => {
        a.get()
        onCleanup(() => log.push('onCleanup:1'))
        onCleanup(() => log.push('onCleanup:2'))
        return () => log.push('returned')
      })
      effect(() => {
        if (a.get() === 1) {
          effect(() => {
            throw new Error('interno')
          })
        }
      })
      return r
    })
    flush()
    a.set(1)
    flush()
    expect(log).toEqual(['returned', 'onCleanup:2', 'onCleanup:1'])
    expect(errors.map(([e]) => (e as Error).message)).toEqual(['interno'])
    expect(errors[0]![1].owner.kind).toBe('effect')
    dispose(root)
  })
})

describe('derived-recreates-instance (C-2)', () => {
  test('só avisa para instância com método de ciclo de vida', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    class Plain {
      constructor(readonly q: number) {}
    }
    class Conn {
      constructor(readonly q: number) {}
      close() {}
    }
    const a = signal(0)
    const plain = memo(() => new Plain(a.get()))
    const conn = memo(() => new Conn(a.get()))
    a.set(1)
    plain.get()
    expect(warn).not.toHaveBeenCalled()
    conn.get()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('derived-recreates-instance')
  })
})

describe('owner', () => {
  test('dispose recursivo: filhos em ordem reversa, depois cleanups em ordem reversa; idempotente', () => {
    const log: string[] = []
    const root = createOwner('root', null)
    runWithOwner(root, () => {
      onCleanup(() => log.push('root:1'))
      const c1 = createOwner('component')
      runWithOwner(c1, () => onCleanup(() => log.push('c1')))
      const c2 = createOwner('component')
      runWithOwner(c2, () => {
        expect(getOwner()).toBe(c2)
        onCleanup(() => log.push('c2'))
      })
      onCleanup(() => log.push('root:2'))
      expect(c1.parent).toBe(root)
      expect(c2.depth).toBe(1)
    })
    expect(getOwner()).toBe(null)
    dispose(root)
    expect(log).toEqual(['c2', 'c1', 'root:2', 'root:1'])
    expect(root.disposed).toBe(true)
    dispose(root)
    expect(log).toHaveLength(4)
  })

  test('createOwner herda boundary do pai; ids crescentes', () => {
    const root = createOwner('root', null)
    const handle: BoundaryHandle = { owner: root, track() {}, catch: () => false }
    root.boundary = handle
    const child = createOwner('branch', root)
    expect(child.boundary).toBe(handle)
    expect(child.id).toBeGreaterThan(root.id)
    expect(child.kind).toBe('branch')
    expect(child.context).toBe(null)
  })

  test('handleError: fronteira que trata → root onError → console.error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const root = createOwner('root', null)
    const rootErrors: unknown[] = []
    const b = createOwner('boundary', root)
    const caught: [unknown, ErrorInfo][] = []
    b.boundary = { owner: b, track() {}, catch: (e, info) => (caught.push([e, info]), e === 'tratável') }
    const comp = createOwner('component', b, { name: 'Card', loc: 'Card.tsx:1:1' })

    handleError(comp, 'tratável', 'handler')
    expect(caught[0]![1]).toMatchObject({ phase: 'handler', owner: comp, component: 'Card', loc: 'Card.tsx:1:1' })

    // fronteira não trata, root sem onError → console.error
    handleError(comp, 'outro', 'effect')
    expect(err).toHaveBeenCalledTimes(1)

    setOnError(root, (e) => rootErrors.push(e))
    handleError(comp, 'outro', 'effect')
    expect(rootErrors).toEqual(['outro'])
    expect(err).toHaveBeenCalledTimes(1)
  })

  test('handleError em modo de teste relança quando ninguém trata', () => {
    __setTestMode(true)
    try {
      expect(() => handleError(createOwner('root', null), new Error('falha'), 'setup')).toThrow('falha')
    } finally {
      __setTestMode(false)
    }
  })
})

describe('devtools', () => {
  test('emite eventos do núcleo quando o hook existe', () => {
    const events: { type: string }[] = []
    const g = globalThis as { __JOTASTIC_DEVTOOLS__?: unknown }
    g.__JOTASTIC_DEVTOOLS__ = { emit: (e: { type: string }) => events.push(e), registry: { owners: new Map() } }
    try {
      const root = createOwner('root', null)
      const a = runWithOwner(root, () => {
        const a = signal(0, { name: 'a' })
        const m = memo(() => a.get() + 1)
        effect(() => void m.get())
        return a
      })
      flush()
      a.set(1)
      flush()
      dispose(root)
    } finally {
      delete g.__JOTASTIC_DEVTOOLS__
    }
    const types = new Set(events.map((e) => e.type))
    for (const t of ['owner:create', 'signal:create', 'memo:create', 'effect:create', 'flush:start', 'effect:run'])
      expect(types).toContain(t)
    for (const t of ['signal:set', 'memo:run', 'flush:end', 'owner:dispose']) expect(types).toContain(t)
  })
})
