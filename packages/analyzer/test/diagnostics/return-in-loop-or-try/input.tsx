export function List({ items }: { items: string[] }) {
  for (const item of items) {
    if (!item) return <p>vazio</p>
  }
  return <ul />
}
