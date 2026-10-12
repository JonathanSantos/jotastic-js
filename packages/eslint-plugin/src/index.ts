/**
 * `@jotastic/eslint-plugin`: expõe os diagnósticos estáticos do `@jotastic/analyzer` como regras ESLint (13 §ESLint).
 * Uma regra por ID de 12-diagnosticos.md; o `fix` do diagnóstico vira `fixer.replaceTextRange`.
 */
import type { ESLint, Linter, Rule, SourceCode } from 'eslint'
import { parse } from '@babel/parser'
import * as tsParser from '@typescript-eslint/parser'
import { analyze, DIAGNOSTIC_LEVELS, type Diagnostic, type DiagnosticId } from '@jotastic/analyzer'

const DOCS = 'https://github.com/jotastic/jotastic/blob/main/docs/spec/12-diagnosticos.md'

/** Descrição curta de cada regra (coluna "Gatilho" de 12-diagnosticos.md). */
const DESCRIPTIONS: Record<DiagnosticId, string> = {
  'return-in-loop-or-try': '`return` dentro de `for`/`while`/`try` no corpo raiz',
  'await-in-try': '`await` dentro de `try` no corpo raiz',
  'use-return-not-object': 'função `use*` retorna um `let` solto ou expressão não-objeto',
  'ref-before-mount': 'variável de `ref`/`external` lida no corpo raiz fora de `onMount`/`external`/handler',
  'slot-not-direct-child': '`<Slot>` dentro de `.map`, de outro elemento ou de outro componente',
  'inner-html-object': '`dangerouslySetInnerHTML={{ __html }}` em vez de `innerHTML`',
  'await-in-branch': '`await` dentro de `if` sem `return` no corpo raiz',
  'list-const-used-twice': 'lista `const rows = items.map(JSX)` inserida em mais de um lugar',
  'slot-name-not-literal': '`<Slot name={expr}>` sem string literal',
  'component-ref-unsupported': '`ref` em componente',
  'use-spread-args-unsupported': 'spread nos argumentos de uma chamada a `use*` (`useX(...xs)`)',
  'use-param-assignment': 'escrita em parâmetro de `use*`',
  'await-position-unsupported': '`await` em posição não coberta pelo compilador',
  'await-in-use-unsupported': '`await` no corpo raiz de `use*`',
  'pending-not-resource': '`pending(x)`/`refresh(x)` com `x` que não vem de `await`',
  'slot-mixed-branch': 'ternário entre `<Slot>` e conteúdo comum nos children de componente',
  'continuation-state-resets': '`let` declarado depois de um early return / `await`',
  'state-read-in-setup': 'leitura solta ou `console.*(…)` no corpo raiz lendo estado/prop',
  'watch-without-reads': '`watch` cujo corpo não lê nada reativo',
  'prefer-key-in-list': '`.map` com JSX sem `key` sobre `let` reatribuído de itens primitivos ou sem `id`',
  'class-name-alias': '`className` / `htmlFor` em vez de `class` / `for`',
  'ref-non-optional-in-branch': '`ref` em elemento condicional com variável tipada `!:`',
  'on-change-on-input': '`onChange` + `value=` em `input`/`textarea`',
  'value-not-writable': '`value`/`checked` em campo editável sem handler e expressão não atribuível',
  'fetch-without-signal': '`fetch(` em `await` de componente ou `watch` sem `signal`',
  'await-waterfall': 'dois `await` seguidos no corpo raiz sem dependência léxica',
  'let-never-reassigned': '`let` no corpo raiz nunca reatribuído nem mutado',
}

/** IDs cujo diagnóstico traz `fix` mecânico. */
const FIXABLE = new Set<DiagnosticId>([
  'inner-html-object',
  'state-read-in-setup',
  'class-name-alias',
  'let-never-reassigned',
])

const cache = new WeakMap<SourceCode, Diagnostic[]>()

/** Reparseia o arquivo com Babel e roda o analyzer uma vez por `SourceCode` (compartilhado entre as regras). */
function diagnosticsOf(context: Rule.RuleContext): Diagnostic[] {
  const sourceCode = context.sourceCode
  const cached = cache.get(sourceCode)
  if (cached) return cached
  let found: Diagnostic[]
  const filename = context.filename
  const code = sourceCode.text
  const ts = /\.[mc]?tsx?$/.test(filename)
  try {
    const ast = parse(code, { sourceType: 'module', plugins: ts ? ['jsx', 'typescript'] : ['jsx'] })
    found = analyze(ast, { filename, isTSX: /\.[jt]sx$/.test(filename), dev: true, code }).diagnostics
  } catch {
    // O parser do ESLint já reporta erros de sintaxe; código que só o Babel rejeita fica sem diagnósticos.
    found = []
  }
  cache.set(sourceCode, found)
  return found
}

function createRule(id: DiagnosticId): Rule.RuleModule {
  const level = DIAGNOSTIC_LEVELS[id]
  return {
    meta: {
      type: level === 'error' ? 'problem' : 'suggestion',
      docs: { description: DESCRIPTIONS[id], recommended: true, url: `${DOCS}#${id}` },
      fixable: FIXABLE.has(id) ? 'code' : undefined,
      schema: [],
      messages: { [id]: '{{message}}' },
    },
    create(context) {
      return {
        Program() {
          for (const d of diagnosticsOf(context)) {
            if (d.id !== id) continue
            const fix = d.fix
            context.report({
              messageId: id,
              data: { message: d.suggestion ? `${d.message} Sugestão: ${d.suggestion}` : d.message },
              // A-7: o analyzer usa coluna 1-based; o ESLint espera 0-based.
              loc: {
                start: { line: d.loc.line, column: d.loc.column - 1 },
                end: { line: d.loc.endLine, column: d.loc.endColumn - 1 },
              },
              fix: fix ? (fixer) => fixer.replaceTextRange(fix.range, fix.text) : null,
            })
          }
        },
      }
    },
  }
}

const ids = Object.keys(DIAGNOSTIC_LEVELS) as DiagnosticId[]

export const rules: Record<DiagnosticId, Rule.RuleModule> = Object.fromEntries(
  ids.map((id) => [id, createRule(id)]),
) as Record<DiagnosticId, Rule.RuleModule>

/** error → 'error'; warning e hint → 'warn' (12: dicas aparecem só no editor, que é onde o ESLint roda). */
const severity = (id: DiagnosticId): Linter.RuleSeverity => (DIAGNOSTIC_LEVELS[id] === 'error' ? 'error' : 'warn')

const plugin = {
  meta: { name: '@jotastic/eslint-plugin', version: '0.0.0' },
  rules,
  configs: {} as { recommended: Linter.Config },
} satisfies ESLint.Plugin

plugin.configs.recommended = {
  name: 'jotastic/recommended',
  files: ['**/*.{ts,tsx,mts,cts,jsx}'],
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: { jotastic: plugin },
  rules: {
    ...Object.fromEntries(ids.map((id) => [`jotastic/${id}`, severity(id)])),
    // O compilador já cuida disso com `let-never-reassigned` (só nos corpos reativos).
    'prefer-const': 'off',
  },
}

export default plugin
