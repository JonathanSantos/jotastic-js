// Reatividade básica. Sem useState, useMemo, useCallback.
export function Counter({ label = 'Contador', step = 1 }: { label?: string; step?: number }) {
  let count = 0                       // estado
  const double = count * 2            // derivado (recalcula só quando `count` muda)
  const isEven = count % 2 === 0      // derivado de `count`

  function reset() {                  // função estável: o corpo roda uma vez
    count = 0
  }

  return (
    <section>
      <h2>{label}</h2>
      <p class={{ even: isEven, odd: !isEven }}>
        {count} (dobro: {double})
      </p>
      <button onClick={() => (count += step)}>+{step}</button>
      <button onClick={() => (count -= step)}>-{step}</button>
      <button onClick={reset} disabled={count === 0}>Zerar</button>
    </section>
  )
}

// O que acontece ao clicar em "+5":
//   count.set(5) → text "{count}" atualiza, memo `double` recalcula → text "{double}" atualiza,
//   memo `isEven` recalcula (true → false) → classList.toggle em <p>, prop `disabled` recalcula.
//   Counter() NÃO roda de novo. 4 escritas no DOM, nenhuma comparação de árvore.
