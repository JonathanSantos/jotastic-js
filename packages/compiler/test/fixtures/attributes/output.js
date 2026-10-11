import { template, signal, attr, classList, style, prop, listen, bool, spread } from 'jotastic/runtime'
const _t0 = template(
  '<section data-jo="input.tsx:5"><a></a><button></button><video></video><label for="x"></label><div></div><p></p></section>',
)
export function Attrs(props) {
  const active = signal(false, {
    name: 'active',
    loc: 'input.tsx:2:7',
  })
  const html = signal('<b>x</b>', {
    name: 'html',
    loc: 'input.tsx:3:7',
  })
  const _el = _t0()
  const _a = _el.firstChild
  const _button = _a.nextSibling
  const _video = _button.nextSibling
  const _label = _video.nextSibling
  const _div = _label.nextSibling
  const _p = _div.nextSibling
  attr(_el, 'id', () => props.url)
  attr(_el, 'data-n', () => props.n)
  attr(_el, 'aria-label', () => props.url)
  attr(_el, 'tabindex', () => props.n)
  classList(_el, () => ({
    on: active.get(),
  }))
  style(_el, () => ({
    color: active.get() ? 'red' : 'blue',
  }))
  prop(_el, 'innerHTML', () => html.get())
  listen(_el, 'click', () => active.set(!active.get()))
  attr(_a, 'href', () => props.url)
  attr(_a, 'title', () => `t-${props.n}`)
  bool(_button, 'disabled', () => active.get())
  bool(_button, 'hidden', () => !active.get())
  bool(_button, 'readonly', () => active.get())
  prop(_video, 'muted', () => active.get())
  attr(_label, 'maxlength', () => props.n)
  spread(_div, () => ({
    id: props.url,
  }))
  prop(_p, 'textContent', () => 'literal')
  return _el
}
