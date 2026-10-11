export function Static() {
  return (
    <div class="card" id="main" hidden>
      <h1 title="a &amp; b">Título &lt;x&gt; "aspas"</h1>
      <p>primeira linha segunda linha</p>
      <input type="text" disabled={true} value="x" />
      <br />
      <span class={{ a: true, b: false }}>
        {'texto'} {42}
      </span>
      <i class={['x', 'y']} />
      {null}
      {false}
    </div>
  )
}
