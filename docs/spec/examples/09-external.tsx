import { external, on } from 'jotastic'
import { Chart } from 'chart.js/auto'
import L from 'leaflet'

// 1) Lib ligada a um elemento: cria depois de montar, atualiza sem recriar, destrói no unmount
export function SalesChart({ data, labels }: { data: number[]; labels: string[] }) {
  let canvas!: HTMLCanvasElement

  const chart = external(
    () => new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ data }] } }),   // create (refs já existem)
    (chart) => {                                                                        // update: roda quando data/labels mudam
      chart.data.labels = labels
      chart.data.datasets[0].data = data
      chart.update()
    },
  )                                                                                     // chart.destroy() automático

  on(window, 'resize', () => chart.resize())            // removido no unmount

  return <canvas ref={canvas} />
}

// 2) Recria quando a dependência muda (fecha a conexão anterior)
export function Room({ roomId }: { roomId: string }) {
  let messages: string[] = []
  let status: 'connecting' | 'open' | 'closed' = 'connecting'

  const socket = external(() => {
    const ws = new WebSocket(`wss://chat.example/rooms/${roomId}`)   // `roomId` muda → close() + nova conexão
    ws.onopen = () => (status = 'open')
    ws.onclose = () => (status = 'closed')
    ws.onmessage = e => messages.push(e.data)
    return ws
  })

  function send(text: string) {
    socket.send(text)
  }

  return (
    <section>
      <header>Sala {roomId} · {status}</header>
      <ul>{messages.map(m => <li>{m}</li>)}</ul>
      <input onKeyDown={e => { if (e.key === 'Enter') { send(e.currentTarget.value); e.currentTarget.value = '' } }} />
    </section>
  )
}

// 3) Destruição customizada + observer
export function Map({ center, zoom }: { center: [number, number]; zoom: number }) {
  let el!: HTMLDivElement

  const map = external(
    () => L.map(el).setView(center, zoom),
    (map) => map.setView(center, zoom),
    (map) => map.remove(),                                   // Leaflet usa remove(), não destroy()
  )

  external(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return ro                                                // disconnect() automático
  })

  return <div ref={el} class="map" />
}
