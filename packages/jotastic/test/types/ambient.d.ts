/** Stubs mínimos de módulos externos usados pelos exemplos (não instalados no monorepo). */
declare module '*.css' {}

declare module 'chart.js/auto' {
  export class Chart {
    constructor(item: HTMLCanvasElement | CanvasRenderingContext2D, config: any)
    data: any
    options: any
    update(mode?: string): void
    resize(width?: number, height?: number): void
    destroy(): void
  }
}

declare module 'leaflet' {
  const L: any
  export default L
}
