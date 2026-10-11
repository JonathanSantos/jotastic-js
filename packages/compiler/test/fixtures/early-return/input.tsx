// 18 §9: if/return → branches; setup antes, continuação depois (com estado próprio: continuation-state-resets)
import { Spinner } from './spinner'

export function UserPage({ user }: { user: { error?: Error; data?: { first: string; last: string } } }) {
  let clicks = 0
  if (user.error) return <p class="error">{user.error.message}</p>
  if (!user.data) return <Spinner />
  let tab = 'posts'
  const fullName = `${user.data.first} ${user.data.last}`
  return (
    <div>
      <h1>{fullName}</h1>
      <button onClick={() => (tab = tab === 'posts' ? 'about' : 'posts')}>{tab}</button>
      <span>{clicks}</span>
    </div>
  )
}
