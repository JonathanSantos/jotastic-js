import { useClamp } from './use-clamp'

export function Slider({ range }: { range: [number, number] }) {
  const clamped = useClamp(...range)
  return <p>{clamped.value}</p>
}
