export function Profile({ user }: { user: { name: string } | null }) {
  if (!user) return <p>Carregando…</p>
  let tab = 'posts'
  return (
    <button onClick={() => (tab = 'likes')}>
      {user.name} · {tab}
    </button>
  )
}
