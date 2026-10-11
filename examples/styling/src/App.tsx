import { Button, Card, Heatmap, ProgressBar, ThemeRoot, ThemeToggle, theme } from './Styling'

const accents = ['#6750a4', '#0b7285', '#c2255c']

export function App() {
  let progress = 40
  let saving = false
  let cells = Array.from({ length: 32 }, (_, i) => ({ id: String(i), v: (i * 37) % 100 }))

  function save() {
    saving = true
    setTimeout(() => (saving = false), 1000)
  }

  function shuffle() {
    for (const c of cells) c.v = Math.floor(Math.random() * 100)
  }

  return (
    <ThemeRoot>
      <header>
        <ThemeToggle />
        {accents.map((a) => (
          <Button size="sm" variant="secondary" onClick={() => theme.setAccent(a)} style={{ color: a }}>
            {a}
          </Button>
        ))}
      </header>

      <Card title="Botões">
        <Button onClick={save} loading={saving}>
          Salvar
        </Button>{' '}
        <Button variant="secondary" size="lg" onClick={() => (progress = 0)}>
          Zerar
        </Button>
      </Card>

      <Card title="Progresso">
        <input type="range" min={0} max={100} value={progress} />
        <ProgressBar value={progress} />
      </Card>

      <Card title="Heatmap">
        <Heatmap cells={cells} />
        <p>
          <Button size="sm" onClick={shuffle}>
            Embaralhar
          </Button>
        </p>
      </Card>
    </ThemeRoot>
  )
}
