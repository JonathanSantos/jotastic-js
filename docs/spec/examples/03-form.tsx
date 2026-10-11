import { useForm } from './14-use-form'

type Plan = 'free' | 'pro'

export function SignupForm({ onDone }: { onDone: (id: string) => void }) {
  const f = useForm(
    { name: '', email: '', age: null as number | null, plan: 'free' as Plan, terms: false },
    {
      name: v => v.trim().length < 3 && 'Mínimo de 3 caracteres',
      email: v => !/^\S+@\S+\.\S+$/.test(v) && 'E-mail inválido',
      age: v => v !== null && v < 18 && 'Precisa ter 18+',
      terms: v => !v && 'Aceite os termos',
    },
  )

  return (
    <form onSubmit={f.submit(async v => onDone((await api.signup(v)).id))} novalidate>
      <label>
        Nome
        <input {...f.field('name')} autofocus />
        {f.error('name') && <small class="error">{f.error('name')}</small>}
      </label>

      <label>
        E-mail
        <input type="email" {...f.field('email')} />
        {f.error('email') && <small class="error">{f.error('email')}</small>}
      </label>

      <label>
        Idade
        <input type="number" {...f.field('age')} />                 {/* number | null, coerção pelo type */}
        {f.error('age') && <small class="error">{f.error('age')}</small>}
      </label>

      <fieldset>
        <legend>Plano</legend>
        <label><input {...f.radio('plan', 'free')} /> Grátis</label>
        <label><input {...f.radio('plan', 'pro')} /> Pro</label>
      </fieldset>

      <label>
        <input {...f.checkbox('terms')} /> Aceito os termos
      </label>
      {f.error('terms') && <small class="error">{f.error('terms')}</small>}

      {f.serverError && <p role="alert" class="error">{f.serverError}</p>}

      <button type="submit" disabled={f.submitting || !f.valid}>
        {f.submitting ? 'Enviando…' : f.values.plan === 'pro' ? 'Assinar Pro' : 'Criar conta'}
      </button>
      {f.dirty && <button type="button" onClick={f.reset}>Limpar</button>}
    </form>
  )
}

// Sem a receita, um campo fica assim (ainda curto, porque `value` é two-way):
//   <input value={form.name} onBlur={() => (touched.name = true)} aria-invalid={!!errors.name} />

declare const api: { signup(input: { name: string; email: string; age: number | null; plan: Plan; terms: boolean }): Promise<{ id: string }> }
