import { createStore } from 'jotastic/store'
import { watch } from 'jotastic'
import './button.css'

// Tema global em store (lido por qualquer componente, sem Provider)
export const theme = createStore((set, get) => ({
  mode: 'light' as 'light' | 'dark',
  accent: '#6750a4',
  get isDark() { return get().mode === 'dark' },
  toggle: () => set(s => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
  setAccent: (accent: string) => set({ accent }),
}))

// 1) class como objeto / array / string
export function Button({ variant = 'primary', size = 'md', loading = false, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      class={['btn', `btn-${variant}`, `btn-${size}`, { loading }]}   // cada chave vira classList.toggle
      disabled={loading || rest.disabled}
    >
      {loading && <span class="spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}

// 2) style como objeto (camelCase ou kebab), variáveis CSS reativas
export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div class="progress" role="progressbar" aria-valuenow={value} aria-valuemax={max}
         style={{ '--pct': `${pct}%`, '--accent': theme.accent }}>   {/* só style.setProperty('--pct') muda */}
      <div class="progress-fill" style={{ width: `${pct}%`, transition: 'width .2s' }} />
      <span style={{ fontWeight: pct === 100 ? 700 : 400 }}>{pct}%</span>
    </div>
  )
}

// 3) Tema aplicado no <html> com watch (sincronização com o mundo externo)
export function ThemeRoot({ children }: { children: JSX.Element }) {
  watch(() => {
    document.documentElement.dataset.theme = theme.mode
    document.documentElement.style.setProperty('--accent', theme.accent)
  })
  return <>{children}</>
}

// 4) Tailwind funciona como em qualquer JSX
export function Card({ title, children }: { title: string; children: JSX.Element }) {
  return (
    <section class={['rounded-xl p-4 shadow', theme.isDark ? 'bg-zinc-900 text-white' : 'bg-white']}>
      <h3 class="text-lg font-semibold">{title}</h3>
      {children}
    </section>
  )
}

// 5) Estilo inline dinâmico por item de lista (só o item que mudou atualiza)
export function Heatmap({ cells }: { cells: { id: string; v: number }[] }) {
  return (
    <div class="grid">
      {cells.map(c => (
        <div class="cell" style={{ background: `hsl(${200 - c.v * 2} 80% 50%)` }} title={c.v} />
      ))}
    </div>
  )
}

export function ThemeToggle() {
  return (
    <Button variant="ghost" onClick={theme.toggle} aria-pressed={theme.isDark}>
      {theme.isDark ? '🌙' : '☀️'}
    </Button>
  )
}

interface ButtonProps extends JSX.IntrinsicElements['button'] {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}
