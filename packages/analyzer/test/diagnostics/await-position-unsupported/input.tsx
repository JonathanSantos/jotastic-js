export async function Stats({ id }: { id: string }) {
  const total = (await api.posts(id)).length + (await api.drafts(id)).length
  return <p>{total}</p>
}

declare const api: {
  posts(id: string): Promise<unknown[]>
  drafts(id: string): Promise<unknown[]>
}
