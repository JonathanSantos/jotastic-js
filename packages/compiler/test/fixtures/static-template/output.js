import { template } from 'jotastic/runtime'
const _t0 = template(
  '<div data-jo="input.tsx:3" class="card" id="main" hidden><h1 title="a &amp; b">Título &lt;x> "aspas"</h1><p>primeira linha segunda linha</p><input type="text" disabled value="x"><br><span class="a">texto 42</span><i class="x y"></i></div>',
)
export function Static() {
  const _el = _t0()
  return _el
}
