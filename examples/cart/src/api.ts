// [ajuste] stub da API usada por docs/spec/examples/08-store.ts (`declare const api`): só `JOTA10` é válido.
export const api = {
  async validateCoupon(code: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return code.trim().toUpperCase() === 'JOTA10'
  },
}
