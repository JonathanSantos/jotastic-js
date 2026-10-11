import { makeLabel, takeId } from '../data'

interface Row {
  id: number
  label: string
}

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count)
  for (let i = 0; i < count; i++) data[i] = { id: takeId(), label: makeLabel() }
  return data
}

function Button(props: { id: string; text: string; onClick: () => void }) {
  return (
    <div class="col-sm-6 smallpad">
      <button type="button" class="btn btn-primary btn-block" id={props.id} onClick={props.onClick}>
        {props.text}
      </button>
    </div>
  )
}

export function Main() {
  let rows: Row[] = []
  let selected = 0

  function run() {
    rows = buildData(1000)
    selected = 0
  }
  function runLots() {
    rows = buildData(10000)
    selected = 0
  }
  function add() {
    rows.push(...buildData(1000))
  }
  function update() {
    for (let i = 0; i < rows.length; i += 10) rows[i].label += ' !!!'
  }
  function clear() {
    rows = []
    selected = 0
  }
  function swapRows() {
    if (rows.length > 998) {
      const a = rows[1]
      rows[1] = rows[998]
      rows[998] = a
    }
  }
  function remove(id: number) {
    rows.splice(
      rows.findIndex((r) => r.id === id),
      1,
    )
  }

  return (
    <div class="container">
      <div class="jumbotron">
        <div class="row">
          <div class="col-md-6">
            <h1>Jotastic keyed</h1>
          </div>
          <div class="col-md-6">
            <div class="row">
              <Button id="run" text="Create 1,000 rows" onClick={run} />
              <Button id="runlots" text="Create 10,000 rows" onClick={runLots} />
              <Button id="add" text="Append 1,000 rows" onClick={add} />
              <Button id="update" text="Update every 10th row" onClick={update} />
              <Button id="clear" text="Clear" onClick={clear} />
              <Button id="swaprows" text="Swap Rows" onClick={swapRows} />
            </div>
          </div>
        </div>
      </div>
      <table class="table table-hover table-striped test-data">
        <tbody>
          {rows.map((row) => (
            <tr class={selected === row.id ? 'danger' : ''}>
              <td class="col-md-1">{row.id}</td>
              <td class="col-md-4">
                <a onClick={() => (selected = row.id)}>{row.label}</a>
              </td>
              <td class="col-md-1">
                <a onClick={() => remove(row.id)}>
                  <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                </a>
              </td>
              <td class="col-md-6" />
            </tr>
          ))}
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  )
}
