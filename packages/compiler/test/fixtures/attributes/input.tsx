export function Attrs({ url, n }: { url: string; n: number }) {
  let active = false
  let html = '<b>x</b>'
  return (
    <section
      id={url}
      data-n={n}
      aria-label={url}
      tabindex={n}
      class={{ on: active }}
      style={{ color: active ? 'red' : 'blue' }}
      innerHTML={html}
      onClick={() => (active = !active)}
    >
      <a href={url} title={`t-${n}`} />
      <button disabled={active} hidden={!active} readOnly={active} />
      <video muted={active} />
      <label htmlFor="x" maxLength={n} />
      <div {...{ id: url }} />
      <p textContent="literal" />
    </section>
  )
}
