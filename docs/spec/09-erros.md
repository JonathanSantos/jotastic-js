# 09 — Erros

## `<Boundary>`

O mesmo componente que trata `pending` ([07](07-async.md)) trata erros:

```tsx
<Boundary error={(err, retry) => <ErrorBox error={err} onRetry={retry} />}>
  <Dashboard />
</Boundary>
```

Captura, na subárvore:

| Origem | React (ErrorBoundary) | Jotastic |
|---|---|---|
| Setup do componente | ✓ | ✓ |
| Bindings (expressão no JSX que lança) | ✓ | ✓ |
| `await` do componente | com Suspense | ✓ |
| `watch`, `external`, `onMount` | ✗ | ✓ |
| **Handlers de evento** (síncronos) | ✗ | ✓ |
| **Handlers async** (promise rejeitada) | ✗ | ✓ |
| Ações de store chamadas de um handler | ✗ | ✓ (via handler) |

É possível porque cada componente tem um owner, e o compilador embrulha handlers e efeitos em `runWithOwner`. `retry` descarta e recria a subárvore. Um `<Boundary>` sem `error` deixa o erro subir para o próximo.

## `onError` global

```tsx
mount(<App />, '#app', { onError: (err, info) => report(err, info) })
```

`info`: `{ component, loc, phase: 'setup' | 'binding' | 'effect' | 'handler' | 'async' }`. Recebe o que nenhum `<Boundary>` capturou. Sem `onError`, o erro vai para `console.error` e o restante da app continua funcionando (um erro em um binding não derruba os outros).

## Em dev

- Stack traces apontam para o `.tsx` original (sourcemaps).
- Erros de compilação aparecem no overlay do Vite com a mesma mensagem e sugestão do editor.
- O devtools mostra o owner onde o erro aconteceu e o flush que o disparou.
