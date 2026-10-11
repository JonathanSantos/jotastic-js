// Implementação oficial do Solid no js-framework-benchmark (keyed), com o mesmo gerador de dados.
import { createSignal, createSelector, batch, For, type Signal } from 'solid-js'
import { makeLabel, takeId } from '../data'

interface Row {
  id: number
  label: Signal<string>
}

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count)
  for (let i = 0; i < count; i++) data[i] = { id: takeId(), label: createSignal(makeLabel()) }
  return data
}

function Button(props: { id: string; text: string; fn: () => void }) {
  return (
    <div class="col-sm-6 smallpad">
      <button id={props.id} class="btn btn-primary btn-block" type="button" onClick={props.fn}>
        {props.text}
      </button>
    </div>
  )
}

export function Main() {
  const [data, setData] = createSignal<Row[]>([])
  const [selected, setSelected] = createSignal(0)
  const isSelected = createSelector(selected)

  const run = () => setData(buildData(1000))
  const runLots = () => setData(buildData(10000))
  const add = () => setData((d) => [...d, ...buildData(1000)])
  const update = () =>
    batch(() => {
      const d = data()
      for (let i = 0; i < d.length; i += 10) d[i].label[1]((l) => l + ' !!!')
    })
  const clear = () => setData([])
  const swapRows = () => {
    const d = data().slice()
    if (d.length > 998) {
      const tmp = d[1]
      d[1] = d[998]
      d[998] = tmp
      setData(d)
    }
  }
  const remove = (id: number) => setData((d) => d.filter((r) => r.id !== id))

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Solid keyed</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Button id="run" text="Create 1,000 rows" fn={run} />
              <Button id="runlots" text="Create 10,000 rows" fn={runLots} />
              <Button id="add" text="Append 1,000 rows" fn={add} />
              <Button id="update" text="Update every 10th row" fn={update} />
              <Button id="clear" text="Clear" fn={clear} />
              <Button id="swaprows" text="Swap Rows" fn={swapRows} />
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          <For each={data()}>
            {(row) => {
              const { id, label } = row
              return (
                <tr class={isSelected(id) ? 'danger' : ''}>
                  <td class="col-md-1" textContent={id} />
                  <td class="col-md-4">
                    <a onClick={() => setSelected(id)} textContent={label[0]()} />
                  </td>
                  <td class="col-md-1">
                    <a onClick={() => remove(id)}>
                      <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                    </a>
                  </td>
                  <td class="col-md-6" />
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  )
}
