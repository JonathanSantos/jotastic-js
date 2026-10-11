/**
 * Funções `use*` (18 §11). PARTE 2 do passo 5: por ora só os ganchos.
 *
 * Como plugar:
 * - `compileUseBody(ctx)`: chamado por `module.ts` para cada corpo `kind: 'use'` (no lugar do pipeline de componente).
 *   Deve montar as regras de parâmetros posicionais (`p` → `p()`, default `p() ?? d`), reaproveitar
 *   `setupRules`/`rewriteBody`/`emitDeclarations` de `bindings.ts` e reescrever o objeto de retorno (17 §Convenções).
 * - `emitUseCall(path, ctx)`: chamado pela reescrita de §4 para toda chamada `useX(a, b)` que não é API de `jotastic`
 *   (`useContext` fica inalterado; `useSlots` é tratado em `bindings.ts`). Deve trocar os argumentos por getters.
 */
import type * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { BodyContext } from '../context'

export function compileUseBody(ctx: BodyContext): void {
  ctx.mod.notImplemented(ctx.fn!.node, `função \`${ctx.body!.name}\` (corpos \`use*\`)`)
}

export function emitUseCall(path: NodePath<t.CallExpression>, ctx: BodyContext): void {
  ctx.mod.notImplemented(path.node, 'chamada a função `use*`')
}
