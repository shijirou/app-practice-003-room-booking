import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ポートは 5173 で固定。使用中なら、別の番号にずれずにエラーで止まる
    port: 5173,
    strictPort: true,
    // /api への通信は、API（8080）へ中継する（ブラウザから見ると同じ場所なので、設定が要らない）
    proxy: { '/api': 'http://localhost:8080' },
  },
})
