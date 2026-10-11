// Cópia de docs/spec/compiled/04-user-page.js para rodar no runtime (passo 3). Ajustes marcados com `// [ajuste]`.
// Entrada: spec 06-controle-de-fluxo.md §Early return reativo
//
// export function UserPage({ id }: { id: string }) {
//   const user = useFetch<User>(`/api/users/${id}`)
//   if (user.error) return <ErrorBox message={user.error.message} />
//   if (!user.data) return <Spinner />
//   let tab = 'posts'
//   const fullName = `${user.data.firstName} ${user.data.lastName}`
//   return <div><h1>{fullName}</h1><Tabs value={tab} onChange={t => (tab = t)} /></div>
// }
import { template, signal, memo, insert, branches, component } from 'jotastic/runtime'
import { useFetch } from './03-use-fetch.js' // [ajuste] era './useFetch'
import { ErrorBox, Spinner, Tabs } from './components.js' // [ajuste] era './components' (stubs de teste)

const _t0 = template('<div><h1></h1><!></div>')

export function UserPage(props) {
  // setup: roda uma vez
  const user = useFetch(() => `/api/users/${props.id}`, () => undefined)

  // cada `if (cond) return X` vira um caso; o código depois vira a continuação (fallback)
  return branches([
    [() => !!user.error, () => component(ErrorBox, { get message() { return user.error.message } }, { name: 'ErrorBox', loc: 'UserPage.tsx:4:21' })],
    [() => !user.data,   () => component(Spinner, {}, { name: 'Spinner', loc: 'UserPage.tsx:5:22' })],
  ], () => {
    // continuação: owner próprio; `tab` e `fullName` pertencem a ela (continuation-state-resets)
    const tab = signal('posts', { name: 'tab', loc: 'UserPage.tsx:7:7' })
    const fullName = memo(() => `${user.data.firstName} ${user.data.lastName}`, { name: 'fullName', loc: 'UserPage.tsx:8:9' })

    const _el = _t0()
    const _h1 = _el.firstChild
    const _m0 = _h1.nextSibling
    insert(_h1, () => fullName.get(), null)
    insert(_el, component(Tabs, { get value() { return tab.get() }, onChange: t => tab.set(t) }, { name: 'Tabs', loc: 'UserPage.tsx:10:33' }), _m0)
    return _el
  })
}
// Invariante testado: quando `user.data` volta a null, o caso 1 ativa, a continuação é descartada ANTES de
// `fullName` rodar de novo (efeitos de render do branch têm id menor que os da continuação).
