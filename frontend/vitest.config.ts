import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    // 1テストごとに、spyOn などの差し替えを元に戻す
    restoreMocks: true,
    // 網羅率（テストがコードのどれだけを実行したか）。`npm run coverage` で測る
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // テスト自身・テスト用の部品・起動のための 1 ファイルは、測る対象から外す
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-*.ts', 'src/main.tsx'],
      reporter: ['text', 'json-summary'],
    },
  },
})
