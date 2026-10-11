// [ajuste] stub da API usada por docs/spec/examples/10-modal.tsx (`declare const api`): a exclusão sempre falha,
// para o <Boundary> mostrar o erro do handler async.
export const api = {
  async deleteAccount(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 50))
    throw new Error('Servidor indisponível')
  },
}
