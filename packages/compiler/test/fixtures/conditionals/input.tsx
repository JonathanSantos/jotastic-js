// 18 §7: condicionais com JSX em posição de filho → branches; sem JSX (K-4) → insert comum
export function Status({ user, tab, n }: { user?: { name: string }; tab: string; n: number }) {
  let open = false
  return (
    <div>
      {open && <p>aberto</p>}
      {n > 0 ? <b>{n}</b> : <i>vazio</i>}
      {n === 0 ? <span>zero</span> : n === 1 ? 'um' : <em>muitos</em>}
      {user?.name || <i>anônimo</i>}
      {user?.name ?? <i>sem nome</i>}
      {{ a: <A />, b: <p>b</p> }[tab]}
      {n === 1 ? 'item' : 'itens'}
      {open ? <hr /> : null}
      <button onClick={() => (open = !open)}>alternar</button>
    </div>
  )
}

function A() {
  return <p>a</p>
}
