// Cópia de docs/spec/examples/10-modal.tsx com ajustes mínimos marcados com `[patch]` (erros de tipo do próprio exemplo).
import { Portal, Boundary, Slot, useSlots, on, tick, onMount } from 'jotastic'

// 1) Modal com Portal, foco, Escape, slots nomeados e two-way explícito (open + onOpenChange)
export function Modal({ open, onOpenChange, title, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: JSX.Element
}) {
  const slots = useSlots<'actions'>(children)       // <Slot name="actions"> vai para o rodapé; o resto é o corpo
  let dialog: HTMLDivElement | undefined

  on(document, 'keydown', e => open && e.key === 'Escape' && onOpenChange(false))

  if (!open) return null                            // early return: nada no DOM quando fechado

  // continuação: roda quando `open` vira true
  onMount(() => dialog?.querySelector<HTMLElement>('[autofocus], button')?.focus())

  return (
    <Portal to={document.body}>
      <div class="backdrop" onClick={() => onOpenChange(false)}>
        <div ref={dialog} class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"
             onClick={e => e.stopPropagation()}>    {/* listener direto: stopPropagation funciona */}
          <h2 id="modal-title">{title}</h2>
          <div class="body">{slots.default}</div>
          <footer>
            {slots.actions}
            <button onClick={() => onOpenChange(false)}>Fechar</button>
          </footer>
        </div>
      </div>
    </Portal>
  )
}

// 2) Uso com <Boundary> capturando erro de handler async
export function DeleteAccount() {
  let confirmOpen = false
  let typed = ''
  let input: HTMLInputElement | undefined

  async function openConfirm() {
    confirmOpen = true
    await tick()                                    // o modal ainda não existe antes do flush
    input?.focus()
  }

  async function confirmDelete() {
    await api.deleteAccount()                       // se lançar, o <Boundary> abaixo captura (handler async)
    location.href = '/'
  }

  return (
    <Boundary error={(err, retry) => <p role="alert">Erro: {(err as Error).message /* [patch] err: unknown */} <button onClick={retry}>Tentar de novo</button></p>}>
      <button class="danger" onClick={openConfirm}>Excluir conta</button>

      <Modal open={confirmOpen} onOpenChange={v => (confirmOpen = v)} title="Tem certeza?">
        <p>Digite <code>excluir</code> para confirmar.</p>
        <input ref={input} value={typed} />

        <Slot name="actions">
          <button disabled={typed !== 'excluir'} onClick={confirmDelete}>Excluir definitivamente</button>
        </Slot>
      </Modal>
    </Boundary>
  )
}

declare const api: { deleteAccount(): Promise<void> }
