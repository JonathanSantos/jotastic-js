// Tipos mínimos para os testes (os .js ficam fora do tsc).
import type { Rendered } from 'jotastic/runtime'
export declare function Counter(props: { label?: string; step?: number }): Node
export declare const App: () => Rendered
