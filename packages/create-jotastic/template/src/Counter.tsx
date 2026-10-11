// Reatividade básica. Sem useState, useMemo, useCallback: o componente roda uma vez.
export function Counter({ label = 'Contador', step = 1 }: { label?: string; step?: number }) {
  let count = 0 // estado
  const double = count * 2 // derivado (recalcula só quando `count` muda)
  const isEven = count % 2 === 0 // derivado de `count`

  function reset() {
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
      <button onClick={reset} disabled={count === 0}>
        Zerar
      </button>
    </section>
  )
}
