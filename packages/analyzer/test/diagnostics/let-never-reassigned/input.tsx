export function Greeting({ name }: { name: string }) {
  let greeting = 'Olá'
  return (
    <p>
      {greeting}, {name}
    </p>
  )
}
