// 18 §9: switch cujos case terminam em return → casos `discriminante === valor`; default → fallback
export function Icon({ kind }: { kind: 'ok' | 'warn' | 'err' | 'info' }) {
  switch (kind) {
    case 'ok':
      return <i class="ok" />
    case 'warn':
    case 'err': {
      const cls = `alert-${kind}`
      return <i class={cls} />
    }
    default:
      return <i>?</i>
  }
}
