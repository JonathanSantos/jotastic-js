// Componentes compostos com contexto (fase 2: createContext). No MVP, passe um store por prop.
import { createContext, useContext } from 'jotastic'

interface TabsState { active: string; select(id: string): void; register(id: string): void; ids: string[] }
const TabsContext = createContext<TabsState>()

export function Tabs({ initial, children, onChange }: { initial: string; children: JSX.Element; onChange?: (id: string) => void }) {
  let active = initial
  const ids: string[] = []

  const state: TabsState = {
    get active() { return active },               // getter: quem lê `active` reage
    ids,
    select(id) { active = id; onChange?.(id) },
    register(id) { if (!ids.includes(id)) ids.push(id) },
  }

  return (
    <TabsContext.Provider value={state}>
      <div class="tabs" role="tablist"
           onKeyDown={e => {
             const i = ids.indexOf(active)
             if (e.key === 'ArrowRight') state.select(ids[(i + 1) % ids.length])
             if (e.key === 'ArrowLeft') state.select(ids[(i - 1 + ids.length) % ids.length])
           }}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

Tabs.Tab = function Tab({ id, children }: { id: string; children: JSX.Element }) {
  const tabs = useContext(TabsContext)            // o Provider mais próximo na árvore de owners
  tabs.register(id)
  const selected = tabs.active === id
  return (
    <button role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1}
            class={{ tab: true, active: selected }} onClick={() => tabs.select(id)}>
      {children}
    </button>
  )
}

Tabs.Panel = function Panel({ id, children }: { id: string; children: JSX.Element }) {
  const tabs = useContext(TabsContext)
  return <section role="tabpanel" hidden={tabs.active !== id}>{children}</section>   // hidden: mantém o estado interno
}

// uso
export function Settings() {
  return (
    <Tabs initial="profile" onChange={id => history.replaceState(null, '', `#${id}`)}>
      <Tabs.Tab id="profile">Perfil</Tabs.Tab>
      <Tabs.Tab id="security">Segurança</Tabs.Tab>

      <Tabs.Panel id="profile"><ProfileForm /></Tabs.Panel>
      <Tabs.Panel id="security"><SecurityForm /></Tabs.Panel>
    </Tabs>
  )
}

declare const ProfileForm: () => JSX.Element
declare const SecurityForm: () => JSX.Element
