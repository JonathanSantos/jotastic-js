export async function User({ id, prefetch }: { id: string; prefetch: boolean }) {
  if (prefetch) {
    await api.warm(id)
  }
  return <p />
}

declare const api: { warm(id: string): Promise<void> }
