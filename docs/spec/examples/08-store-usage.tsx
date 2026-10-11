import { cart, type Product } from './08-store'

// Leitura direta, sem seletores: cada binding assina só a propriedade que lê.
export function CartBadge() {
  return <span class={{ badge: true, empty: cart.isEmpty }}>{cart.count}</span>
}

export function CartSummary() {
  let code = ''
  const { subtotal, total } = cart              // desestruturar no corpo raiz vira derivados

  if (cart.isEmpty) return <p>Seu carrinho está vazio.</p>

  return (
    <aside>
      <ul>
        {cart.items.map(item => (
          <li>
            {item.name}
            <input type="number" min={0} value={item.qty}
                   onChange={e => cart.setQty(item.id, e.currentTarget.valueAsNumber)} />
            <button onClick={() => cart.remove(item.id)}>×</button>
          </li>
        ))}
      </ul>

      <form onSubmit={e => { e.preventDefault(); cart.applyCoupon(code) }}>
        <input value={code} placeholder="Cupom" />
        <button>Aplicar</button>
        {cart.couponError && <small class="error">{cart.couponError}</small>}
      </form>

      <p>Subtotal: {money(subtotal)}</p>
      {cart.coupon && <p>Cupom {cart.coupon}: -10%</p>}
      <p><strong>Total: {money(total)}</strong></p>
      <button onClick={cart.clear}>Esvaziar</button>
    </aside>
  )
}

export function ProductCard({ product }: { product: Product }) {
  const inCart = cart.items.find(i => i.id === product.id)?.qty ?? 0
  return (
    <article>
      <h3>{product.name}</h3>
      <p>{money(product.price)}</p>
      <button onClick={() => cart.add(product)}>Adicionar {inCart > 0 && `(${inCart})`}</button>
    </article>
  )
}

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
