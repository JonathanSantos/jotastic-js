export function Canvas() {
  let canvas!: HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  return <canvas ref={canvas} onClick={() => ctx?.fill()} />
}
