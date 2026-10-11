import { defineConfig } from 'vitest/config'
import { alias } from '../../vitest.shared'

export default defineConfig({
  resolve: { alias },
  // H-1: contorno do happy-dom 15 (`form.nextSibling` null), o mesmo do pacote jotastic
  test: { environment: 'happy-dom' },
})
