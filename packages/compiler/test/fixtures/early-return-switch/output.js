import { template, branches, classList } from 'jotastic/runtime'
const _t0 = template('<i data-jo="input.tsx:5" class="ok"></i>')
const _t1 = template('<i data-jo="input.tsx:9"></i>')
const _t2 = template('<i data-jo="input.tsx:12">?</i>')
// 18 §9: switch cujos case terminam em return → casos `discriminante === valor`; default → fallback
export function Icon(props) {
  return branches(
    [
      [
        () => props.kind === 'ok',
        () => {
          const _el = _t0()
          return _el
        },
      ],
      [
        () => props.kind === 'warn' || props.kind === 'err',
        () => {
          const cls = `alert-${props.kind}`
          const _el2 = _t1()
          classList(_el2, () => cls)
          return _el2
        },
      ],
    ],
    () => {
      const _el3 = _t2()
      return _el3
    },
  )
}
