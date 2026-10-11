// [ajuste] Componentes de carregamento/erro que docs/spec/examples/06-async.tsx só declarava.
export function Skeleton() {
  return (
    <article class="skeleton" aria-busy="true">
      <h2>Carregando…</h2>
    </article>
  )
}

export function PageSpinner() {
  return (
    <p class="spinner" aria-busy="true">
      Carregando painel…
    </p>
  )
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div class="error" role="alert">
      <p>Erro: {error.message}</p>
      <button onClick={onRetry}>Tentar de novo</button>
    </div>
  )
}

export function ErrorPage({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div class="error page" role="alert">
      <h2>O painel não carregou</h2>
      <p>{error.message}</p>
      <button onClick={onRetry}>Tentar de novo</button>
    </div>
  )
}
