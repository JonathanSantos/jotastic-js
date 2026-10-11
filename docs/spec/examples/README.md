# Exemplos: o que o dev escreve

Código do ponto de vista de quem usa a lib. Cada arquivo cobre um cenário e serve de referência para a spec, para os testes de contagem de execuções e para o tutorial. Os comentários apontam o que o compilador faz por você.

| Arquivo | Cenário | O que mostra |
|---|---|---|
| [01-counter.tsx](01-counter.tsx) | Reatividade básica | `let`, `const` derivado, evento, sem hooks |
| [02-todos.tsx](02-todos.tsx) | Lista e objetos reativos | `.map` com chave implícita (`id`), mutação profunda, `value`/`checked` two-way, filtro derivado |
| [03-form.tsx](03-form.tsx) | Formulário com validação | Receita `useForm`: `{...f.field('name')}`, validação derivada, touched, submit async, erro de servidor, reset |
| [04-routes.tsx](04-routes.tsx) | Rotas e páginas | `defineRoutes`, `<Outlet>` (um `<Boundary>`), `<Link>`, `await` na página *(router: fase 2)* |
| [05-styling.tsx](05-styling.tsx) | Estilo | `class` objeto/array, `style` objeto, variáveis CSS, tema em store, Tailwind |
| [06-async.tsx](06-async.tsx) | Dados assíncronos | `await` no componente, `<Boundary pending error>`, `pending`/`refresh`, cancelamento ambiente via `jotastic/fetch`, optimistic update |
| [07-use-functions.ts](07-use-functions.ts) | Lógica reutilizável | `useFetch` em 6 linhas (`jotastic/fetch` + `watch`), `useMediaQuery` com `on` lazy, `useClickOutside` sem thunk, `useDebounced`, `useLocalStorage` |
| [08-store.ts](08-store.ts) + [08-store-usage.tsx](08-store-usage.tsx) | Estado compartilhado | `createStore`, `set`, getters, ações async, leitura sem seletor |
| [09-external.tsx](09-external.tsx) | Libs externas | `external` com Chart.js e WebSocket, `on(window, …)`, `ref` |
| [10-modal.tsx](10-modal.tsx) | Modal, portal e erros | `<Portal>`, `<Boundary error>` pegando handler async, `tick`, `ref`, `open` + `onOpenChange`, `on(document, 'keydown')` |
| [11-tabs-context.tsx](11-tabs-context.tsx) | Componentes compostos | `createContext`, `Tabs`/`Tabs.Tab` *(fase 2)* |
| [12-react-vs-jotastic.tsx](12-react-vs-jotastic.tsx) | Migração | O mesmo componente em React e em Jotastic, lado a lado |
| [13-slots.tsx](13-slots.tsx) | Slots nomeados | `<Slot name>` + `useSlots`: slot padrão, nomeado, com parâmetro e condicional, resolvidos em build |
| [14-use-form.ts](14-use-form.ts) | Receita de formulário | `useForm` em ~50 linhas só com `let`, derivados e `tick`; base do futuro `@jotastic/form` |
