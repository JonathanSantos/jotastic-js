export async function User({ id }: { id: string }) {
  try {
    await api.ping(id)
  } catch {}
  return <p />
}

declare const api: { ping(id: string): Promise<void> }
