// Entrada: examples/06-async.tsx (UserCard, Sidebar)
import { template, resource, continuation, insert, classList, listen, component, boundary } from 'jotastic/runtime'
import { api } from './lib/api'
import { Skeleton, ErrorBox } from './components'

const _t0 = template('<article><h2></h2><button>Atualizar</button></article>')

// async function UserCard({ id }) { const user = await api.user(id); return <article …/> }
export function UserCard(props) {
  const _r0 = resource(() => api.user(props.id), { name: 'user', loc: 'UserCard.tsx:6:9' })   // rastreia props.id; abortSignal() ambiente

  return continuation(_r0, () => {
    // `user` → _r0.value.get(); pending(user) → _r0.pending.get(); refresh(user) → _r0.refresh()
    const _el = _t0()
    const _h2 = _el.firstChild
    const _btn = _h2.nextSibling
    classList(_el, () => ({ dimmed: _r0.pending.get() }))
    insert(_h2, () => _r0.value.get().name, null)
    listen(_btn, 'click', () => _r0.refresh())
    return _el
  })
}

// <Boundary pending={<Skeleton/>} error={(e, retry) => <ErrorBox error={e} onRetry={retry}/>}><UserCard id={userId}/></Boundary>
export function Sidebar(props) {
  return component(Boundary, {
    get pending() { return component(Skeleton, {}) },
    error: (e, retry) => component(ErrorBox, { error: e, onRetry: retry }),
    get children() { return component(UserCard, { get id() { return props.userId } }, { name: 'UserCard', loc: 'Sidebar.tsx:4:7' }) },
  }, { name: 'Boundary', loc: 'Sidebar.tsx:3:5' })
}

// O componente público Boundary do pacote `jotastic` é apenas:
export function Boundary(props) {
  return boundary({
    pending: () => props.pending,
    error: props.error,
    children: () => props.children,
  })
}
