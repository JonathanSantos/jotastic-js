// Tipos mínimos para os testes (os .js ficam fora do tsc).
import type { Rendered } from 'jotastic/runtime'
export declare function UserCard(props: { id: string }): Rendered
export declare function Sidebar(props: { userId: string }): Rendered
export declare function Boundary(props: { pending?: Rendered; error?: unknown; children?: Rendered }): Rendered
