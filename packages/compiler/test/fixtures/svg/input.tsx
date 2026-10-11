export function Icon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size}>
      <path d="M0 0" stroke-width={size} />
      <foreignObject>
        <div class="x" />
      </foreignObject>
    </svg>
  )
}

export function Shape({ r }: { r: number }) {
  return <circle r={r} />
}
