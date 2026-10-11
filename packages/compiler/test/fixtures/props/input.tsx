export function Destructured({ title, size = 'md', user: { name }, ...others }: any) {
  function rename() {
    title = 'novo'
  }
  return (
    <div class={size} onClick={rename} {...others}>
      {title} {name}
    </div>
  )
}

export function PropsObject(props: { title: string }) {
  return <h1>{props.title}</h1>
}

export const Arrow = ({ label }: { label: string }) => <b>{label}</b>

export function Shadow({ value }: { value: number }) {
  const f = (value: number) => value + 1
  return <i>{f(value)}</i>
}
