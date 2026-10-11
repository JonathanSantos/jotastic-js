export async function User({ id }: { id: string }) {
  const user = await fetch(`/api/users/${id}`).then((r) => r.json())
  return <h1>{user.name}</h1>
}
