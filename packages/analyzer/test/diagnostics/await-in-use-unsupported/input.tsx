export async function useUser(id: string) {
  const user = await fetchUser(id)
  return { user }
}

declare function fetchUser(id: string): Promise<{ name: string }>
