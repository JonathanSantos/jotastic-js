import { CartBadge, CartSummary, ProductCard } from './CartViews'
import type { Product } from './store'

export const products: Product[] = [
  { id: 'cafe', name: 'Café', price: 18.9 },
  { id: 'pao', name: 'Pão de queijo', price: 12.5 },
  { id: 'bolo', name: 'Bolo de fubá', price: 24 },
]

export function App() {
  return (
    <main>
      <header>
        <h1>Loja</h1>
        <span>Carrinho: </span>
        <CartBadge />
      </header>
      <section class="products">
        {products.map((product) => (
          <ProductCard product={product} />
        ))}
      </section>
      <CartSummary />
    </main>
  )
}
