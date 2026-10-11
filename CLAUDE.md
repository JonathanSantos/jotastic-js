# Jotastic

Biblioteca front-end compiler-first: TSX puro, sem hooks, sem VDOM. O componente roda uma vez; o compilador gera signals e bindings por nó.

## Onde está tudo

- **Spec normativa:** `docs/spec/README.md` (índice). Leia primeiro `01-modelo-mental.md` e `15-decisoes.md`.
- **Contratos exatos (fonte da verdade para código):** `docs/spec/contracts/*.d.ts`. O `.d.ts` vence a prosa.
- **Algoritmo do compilador:** `docs/spec/18-transformacoes.md`.
- **Saídas compiladas de referência (snapshots):** `docs/spec/compiled/*.js`.
- **Plano de testes com asserções:** `docs/spec/19-plano-de-testes.md`.
- **Ordem de implementação e definição de pronto:** `docs/spec/20-guia-de-implementacao.md`.
- **Exemplos do que o dev escreve:** `docs/spec/examples/`.
- `docs/refinement/` é histórico; se divergir da spec, vale a spec.

## Regras de trabalho

- Siga a ordem do guia (passo 0 → 9). Não comece um passo sem os testes do anterior verdes.
- Não invente API nem mude decisões. Lacunas vão para `docs/spec/21-pendencias.md` com o caso concreto; implemente o mais simples que respeite os contratos.
- Toda função pública do runtime nasce com o teste correspondente do plano (IDs R1…, P1…, D1…, F1…, A1…, E1…, S1…).
- Saída compilada legível é requisito. `packages/jotastic` não tem dependências em runtime.
- Stack: npm workspaces (npm 10+), TypeScript strict ESM, tsup, Vitest + happy-dom, Babel para o compilador, Vite plugin. Prettier sem ponto e vírgula, aspas simples, 120 colunas.

## Comandos (depois do passo 0)

```bash
npm install
npm test                              # todos os pacotes
npm run build
npm run dev                           # exemplos no Vite
npm run size                          # tamanho brotli dos exemplos
npm run test -w packages/jotastic     # um pacote só
```
