import { Child, Tabs, Icon } from './lib'

export function Parent({ id, Comp }: { id: string; Comp: any }) {
  let count = 0
  const extra = { a: 1 }
  const handler = () => count++
  return (
    <div>
      <Child
        title="t"
        n={1}
        flag
        neg={-1}
        id={id}
        count={count}
        onPick={(x: number) => (count = x)}
        handler={handler}
        icon={<Icon />}
        list={[1, 2]}
        tpl={`x${count}`}
      />
      <Child {...extra} a={count} {...(count > 1 ? extra : {})} />
      <Child key={id} />
      <Tabs.Tab label="x">texto</Tabs.Tab>
      <Comp>
        <b>um</b>
      </Comp>
      <Child>
        a {count} <i>b</i>
      </Child>
      <Child>{(item: number) => <span>{item}</span>}</Child>
      <Child>{count}</Child>
    </div>
  )
}

export function Root() {
  return <Child title="root" />
}
