export function Counter({ step = 1 }: { step?: number }) {
  let count = 0
  const double = count * 2
  return (
    <section>
      <p>
        {count} (dobro: {double})
      </p>
      <button onClick={() => (count += step)}>+{step}</button>
    </section>
  )
}
