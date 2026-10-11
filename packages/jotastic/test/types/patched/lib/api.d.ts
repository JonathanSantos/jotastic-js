/** Stub de `./lib/api` importado por `docs/spec/examples/06-async.tsx` (resolvido via `rootDirs`). */
export declare const api: {
  user(id: string): Promise<{ id: string; name: string }>
  posts(id: string): Promise<{ id: string; title: string; published: boolean; tagId: number }[]>
  tags(): Promise<Record<number, string>>
  search(q: string): Promise<{ id: string; title: string }[]>
  rename(id: string, name: string): Promise<void>
}
