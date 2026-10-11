// Tipos mínimos para os testes (os .js ficam fora do tsc).
import type { Rendered } from 'jotastic/runtime'
export declare const items: { id: number; name: string }[]
export declare function Card(props: { children: unknown }): Node
export declare function Page(props: { admin: boolean }): Rendered
