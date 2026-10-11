import { defineConfig } from 'vitest/config'
import { alias } from '../../vitest.shared'

export default defineConfig({
  resolve: { alias },
  test: { environment: 'happy-dom', setupFiles: ['./test/setup/happy-dom-form.ts'] },
})
