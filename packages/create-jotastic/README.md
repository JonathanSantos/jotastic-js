# create-jotastic

Cria um app Jotastic: Vite + TypeScript + ESLint (`@jotastic/eslint-plugin`) + um `Counter` + `@jotastic/test` (Vitest + happy-dom).

```bash
npm create jotastic@latest meu-app
cd meu-app
npm install
npm run dev
```

Sem argumento, o CLI pergunta o diretório (padrão `jotastic-app`). Recusa diretório não vazio. O `name` do `package.json` vem do nome do diretório.

Scripts do app gerado: `dev`, `build`, `preview`, `test`, `lint`.

## Estado

Os pacotes `jotastic` e `@jotastic/*` ainda não foram publicados no npm: o template declara `^0.0.0` e `npm install` só funciona depois da primeira publicação (ou com `npm link`/workspaces).

## Desenvolvimento

`npm run test -w packages/create-jotastic` roda os testes do CLI e a integração do template: o template é copiado para `test/.tmp-app` (dentro do repo, para resolver os pacotes pelos workspaces), e lá rodam `vite build`, o teste do `Counter`, `eslint` e `tsc`. Para pular a integração: `CREATE_JOTASTIC_E2E=0`.
