export function Events() {
  function onKey(e: KeyboardEvent) {
    console.log(e.key)
  }
  return (
    <div onDblClick={() => console.log('dbl')} onScrollCapture={onKey} on:item-selected={(e: Event) => console.log(e)}>
      <input onKeyDown={onKey} onMouseEnter={onKey} />
    </div>
  )
}
