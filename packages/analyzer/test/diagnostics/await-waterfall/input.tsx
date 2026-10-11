export async function Dashboard({ id }: { id: string }) {
  const user = await api.user(id)
  const ads = await api.ads()
  return (
    <p>
      {user.name} {ads.length}
    </p>
  )
}

declare const api: { user(id: string): Promise<{ name: string }>; ads(): Promise<string[]> }
