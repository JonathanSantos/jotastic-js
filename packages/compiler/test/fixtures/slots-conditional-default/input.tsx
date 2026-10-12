// 18 §12 (U-3): `{x ? <Slot name="h"/> : <i/>}` → `h` e `default` com getters condicionais complementares
import { Slot } from 'jotastic'
import { Panel } from './panel'

export function Page({ titled }: { titled: boolean }) {
  return <Panel>{titled ? <Slot name="head"><h1>Título</h1></Slot> : <i>sem título</i>}</Panel>
}

export function Inverse({ empty }: { empty: boolean }) {
  return <Panel>{empty ? <p>vazio</p> : <Slot name="head">cheio</Slot>}</Panel>
}
