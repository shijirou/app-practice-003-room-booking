import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 1 テストごとに、表示した画面を片付ける（前のテストの画面が残らないように）
afterEach(() => {
  cleanup()
})
