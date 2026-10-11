// Asserções negativas/positivas do namespace JSX (typecheck apenas; nunca executa).
import type { Component, ParentProps } from 'jotastic'

let el!: HTMLInputElement

export const ok = (
  <div class={['a', { b: true }]} style={{ color: 'red', '--x': 1 }} data-id={1} aria-label="x" tabIndex={0}>
    <input ref={el} value={1} onInput={(e) => e.currentTarget.value} onKeyDown={(e) => e.key} />
    <span onDblClick={() => {}} onClickCapture={(e) => e.button} on:item-selected={(e) => e.detail} />
    <my-element anything={1} />
    <svg viewBox="0 0 1 1">
      <path d="M0 0" />
    </svg>
    {1}
    {null}
    {[<b />, 'x']}
    {() => 'lazy'}
  </div>
)

// @ts-expect-error atributo desconhecido em elemento HTML
export const bad1 = <div foo="x" />
// @ts-expect-error nome DOM minúsculo não é aceito: use onDblClick
export const bad2 = <span onDblclick={() => {}} />
// @ts-expect-error tag desconhecida (sem hífen)
export const bad3 = <notatag />
// @ts-expect-error currentTarget tipado pelo elemento
export const bad4 = <button onClick={(e) => e.currentTarget.value.toFixed()} />

const Async: Component<{ id: string }> = async ({ id }) => <p>{id}</p>
const Parent = (p: ParentProps<{ title: string }>) => <section title={p.title}>{p.children}</section>
export const comp = (
  <Parent title="t" key="k">
    <Async id="1" />
    texto {2}
  </Parent>
)
// @ts-expect-error prop obrigatória ausente
export const bad5 = <Async />
