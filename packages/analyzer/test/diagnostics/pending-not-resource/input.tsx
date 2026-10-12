import { pending } from 'jotastic'

export function UserCard({ user }: { user: { name: string } }) {
  return <article class={{ dimmed: pending(user) }}>{user.name}</article>
}
